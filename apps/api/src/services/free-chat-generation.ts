import { Prisma, prisma } from '@allvision/database';
import { CHAT_PROMPT_MAX_LENGTH, estimateChatGenerationPriceCoins, generationExpiresAt, getChatModel, type ChatAspectRatio } from '@allvision/shared';
import { z } from 'zod';
import { HttpError } from '../utils/http-error';
import { logger } from '../utils/logger';
import * as queues from '../queues';
import { readModelPriceOverrides } from './model-pricing';

export const chatMessageSchema = z.object({
  modelSlug: z.string().trim().min(1),
  prompt: z.string().trim().max(CHAT_PROMPT_MAX_LENGTH, `Максимум ${CHAT_PROMPT_MAX_LENGTH} символов в запросе`).optional(),
  aspectRatio: z.enum(['1:1', '9:16', '16:9', '4:3', '3:4', '21:9', '9:21', 'auto']).optional(),
  duration: z.union([z.coerce.number().int().min(1).max(30), z.literal('auto')]).optional(),
  generateAudio: z.boolean().optional(),
  params: z.record(z.unknown()).optional(),
  inputRef: z.string().trim().min(1).optional(),
  imageInputRef: z.string().trim().min(1).optional(),
  videoInputRef: z.string().trim().min(1).optional(),
  audioInputRef: z.string().trim().min(1).optional(),
});

export type ChatMessageBody = z.infer<typeof chatMessageSchema>;

type InputRef = {
  ref: string;
  publicUrl: string;
  mediaKind: 'image' | 'video' | 'audio';
};

function isPrismaNotFound(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025';
}

function staticUrlForKey(key: string) {
  const baseUrl = process.env.PUBLIC_API_URL ?? 'http://localhost:4000';
  return `${baseUrl.replace(/\/+$/, '')}/static/${key.replace(/^\/+/, '')}`;
}

function chatKeyFromRef(value: string) {
  if (value.startsWith('chat:')) return value.slice('chat:'.length);
  if (value.startsWith('user-uploads/chat/')) return value;
  return null;
}

function mediaKindFromMime(mimeType: string): 'image' | 'video' | 'audio' | null {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  return null;
}

function mediaKindFromKey(key: string): 'image' | 'video' | 'audio' | null {
  if (/\.(jpe?g|png|webp)(\?|$)/i.test(key)) return 'image';
  if (/\.(mp4|mov|webm)(\?|$)/i.test(key)) return 'video';
  if (/\.(mp3|wav|ogg|m4a)(\?|$)/i.test(key)) return 'audio';
  return null;
}

function resultKeyFromUrl(value: string): string | null {
  const rawPath = (() => {
    if (value.startsWith('http://') || value.startsWith('https://')) {
      try {
        return new URL(value).pathname;
      } catch {
        return null;
      }
    }
    return value;
  })();
  if (!rawPath) return null;
  const marker = '/static/';
  const key = rawPath.includes(marker)
    ? rawPath.slice(rawPath.indexOf(marker) + marker.length)
    : rawPath.replace(/^\/+/, '');
  return key.startsWith('results/') ? decodeURIComponent(key) : null;
}

/** Ключ файла после /static/ для любого нашего URL (без ограничения на results/). */
function staticKeyFromUrl(value: string): string | null {
  const rawPath = (() => {
    if (value.startsWith('http://') || value.startsWith('https://')) {
      try { return new URL(value).pathname; } catch { return null; }
    }
    return value.startsWith('/') ? value : null;
  })();
  if (!rawPath) return null;
  const marker = '/static/';
  if (!rawPath.includes(marker)) return null;
  const key = decodeURIComponent(rawPath.slice(rawPath.indexOf(marker) + marker.length)).replace(/^\/+/, '');
  return key.includes('..') || key.length === 0 ? null : key;
}

function assertChatKeyOwnership(key: string, userId: string) {
  const normalized = key.replace(/^\/+/, '');
  const expectedPrefix = `user-uploads/chat/${userId}/`;
  if (!normalized.startsWith(expectedPrefix) || normalized.includes('..')) {
    throw new HttpError(404, 'CHAT_INPUT_NOT_FOUND', 'Файл не найден');
  }
  return normalized;
}

function outputUrl(project: { resultImage: string | null; resultVideo: string | null; resultThumbnail: string | null }) {
  return project.resultVideo ?? project.resultImage ?? project.resultThumbnail;
}

async function resolveProjectResultRef(projectId: string, userId: string): Promise<InputRef> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId, status: 'COMPLETED' },
    select: { id: true, resultImage: true, resultVideo: true, resultThumbnail: true },
  });
  const url = project ? outputUrl(project) : null;
  if (!project || !url) throw new HttpError(404, 'PROJECT_OUTPUT_NOT_FOUND', 'Результат не найден');
  const key = resultKeyFromUrl(url);
  const mediaKind = mediaKindFromKey(key ?? url);
  if (!mediaKind) throw new HttpError(400, 'UNSUPPORTED_INPUT_KIND', 'Этот результат нельзя использовать как референс');
  return { ref: `result:${project.id}`, publicUrl: url, mediaKind };
}

export async function resolveInputRef(value: string, userId: string): Promise<InputRef> {
  const assetMatch = value.match(/^asset:([a-zA-Z0-9_-]+)$/);
  if (assetMatch) {
    const asset = await prisma.mediaAsset.findFirst({
      where: { id: assetMatch[1], isActive: true },
      select: { id: true, publicUrl: true, ownerUserId: true, mimeType: true },
    });
    if (!asset || (asset.ownerUserId && asset.ownerUserId !== userId)) {
      throw new HttpError(404, 'MEDIA_ASSET_NOT_FOUND', 'Файл не найден');
    }
    const mediaKind = mediaKindFromMime(asset.mimeType);
    if (!mediaKind) throw new HttpError(400, 'UNSUPPORTED_INPUT_KIND', 'Этот файл нельзя использовать в чате');
    return { ref: `asset:${asset.id}`, publicUrl: asset.publicUrl, mediaKind };
  }

  const resultMatch = value.match(/^result:([a-zA-Z0-9_-]+)$/);
  if (resultMatch) return resolveProjectResultRef(resultMatch[1], userId);

  const chatKey = chatKeyFromRef(value);
  if (chatKey) {
    const key = assertChatKeyOwnership(chatKey, userId);
    const mediaKind = mediaKindFromKey(key);
    if (!mediaKind) throw new HttpError(400, 'UNSUPPORTED_INPUT_KIND', 'Этот файл нельзя использовать в чате');
    return { ref: `chat:${key}`, publicUrl: staticUrlForKey(key), mediaKind };
  }

  const resultKey = resultKeyFromUrl(value);
  if (resultKey) {
    const [, projectId] = resultKey.split('/');
    const project = projectId
      ? await prisma.project.findFirst({
          where: { id: projectId, userId },
          select: { id: true },
        })
      : null;
    if (!project) throw new HttpError(404, 'PROJECT_OUTPUT_NOT_FOUND', 'Результат не найден');
    const mediaKind = mediaKindFromKey(resultKey);
    if (!mediaKind) throw new HttpError(400, 'UNSUPPORTED_INPUT_KIND', 'Этот результат нельзя использовать как референс');
    const publicUrl = staticUrlForKey(resultKey);
    return { ref: `result:${project.id}`, publicUrl, mediaKind };
  }

  // Переиспользование референса из результата: наш публичный /static URL (uploads/assets/service) —
  // напрямую скачиваемый вход. Ограничено нашими served-директориями, чтобы не принимать чужие URL.
  const staticKey = staticKeyFromUrl(value);
  if (staticKey && /^(user-uploads|media-assets|service-assets|uploads)\//.test(staticKey)) {
    const mediaKind = mediaKindFromKey(staticKey);
    if (!mediaKind) throw new HttpError(400, 'UNSUPPORTED_INPUT_KIND', 'Этот файл нельзя использовать как референс');
    return { ref: staticUrlForKey(staticKey), publicUrl: staticUrlForKey(staticKey), mediaKind };
  }

  throw new HttpError(400, 'INVALID_INPUT_REF', 'Выберите файл из Студии, библиотеки сайта или загрузите новый');
}

function estimateDurationSec(category: 'image' | 'video') {
  return category === 'video' ? 600 : 180;
}

export function titleFromPrompt(prompt: string, prefix = 'Чат: ') {
  const compact = prompt.replace(/\s+/g, ' ').trim();
  return `${prefix}${compact.slice(0, 50)}${compact.length > 50 ? '…' : ''}`;
}

function buildPipeline(params: {
  blockSlug: string;
  modelSlug: string;
  prompt: string;
  aspectRatio: ChatAspectRatio;
  duration?: number | 'auto';
  generateAudio?: boolean;
  audioParam?: 'enable_audio' | 'generate_audio';
  extraParams?: Record<string, unknown>;
  inputRef: string | null;
}) {
  const baseParams: Record<string, unknown> = {
    model: params.modelSlug,
    prompt: params.prompt,
    aspect_ratio: params.aspectRatio,
    ...(params.extraParams ?? {}),
  };
  if (params.duration !== undefined) baseParams.duration = params.duration;
  if (params.generateAudio && params.audioParam) baseParams[params.audioParam] = true;
  if (params.blockSlug === 'image-edit') {
    if (baseParams.output_format === undefined) baseParams.output_format = 'jpg';
    if (baseParams.resolution === undefined) baseParams.resolution = '1K';
  }
  if (params.blockSlug === 'text-to-video' && baseParams.mode === undefined) {
    baseParams.mode = params.modelSlug.includes('-omni') ? 'omni_reference' : 'text_to_video';
  }
  if (params.blockSlug === 'fal-generic' && baseParams.kind === undefined) {
    baseParams.kind = params.modelSlug === 'fal-custom-image' ? 'image' : 'video';
  }
  return [
    {
      id: 'step_1',
      blockSlug: params.blockSlug,
      input: params.inputRef,
      params: baseParams,
    },
  ];
}

function removeUndefined<T extends Record<string, unknown>>(value: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function splitListParam(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  if (typeof value === 'string') return value.split(',').map((item) => item.trim()).filter(Boolean);
  return [];
}

async function resolveMaybeInputRef(value: unknown, userId: string): Promise<unknown> {
  if (typeof value !== 'string' || !/^(asset|chat|result):/.test(value)) return value;
  return (await resolveInputRef(value, userId)).publicUrl;
}

async function normaliseChatParams(raw: Record<string, unknown> | undefined, userId: string) {
  const allowed = new Set([
    'resolution',
    'quality',
    'negative_prompt',
    'tail_image_url',
    'audio_url',
    'image_urls',
    'video_urls',
    'audio_urls',
    'images',
    'video',
    'video_url',
    'target_video',
    'seed',
    'estimatedFrames',
    'expand_prompt',
    'shot_type',
    'watermark',
    'preset_motion',
    'motion_direction',
    'keep_original_sound',
    'keep_original_audio',
    'swap_faces_index',
    'target_faces_index',
    'prefer_multi_shots',
    'multi_shots',
    'mode',
    'output_format',
    'camera_control',
    'enable_audio',
    'generate_audio',
    // fal-generic (своя модель fal) — пользователь задаёт endpoint/функцию/доп. поля.
    'endpoint',
    'kind',
    'extra_params',
    'image_url',
    'video_url',
  ]);
  const source = raw ?? {};
  const entries = await Promise.all(Object.entries(source)
    .filter(([key]) => allowed.has(key))
    .map(async ([key, value]) => {
      if (key === 'image_urls' || key === 'video_urls' || key === 'audio_urls' || key === 'images') {
        const resolved = await Promise.all(splitListParam(value).map((item) => resolveMaybeInputRef(item, userId)));
        return [key, resolved.filter((item): item is string => typeof item === 'string' && item.length > 0)] as const;
      }
      return [key, await resolveMaybeInputRef(value, userId)] as const;
    }));
  return Object.fromEntries(entries.filter(([, value]) => {
    if (Array.isArray(value)) return value.length > 0;
    return value !== undefined && value !== null && value !== '';
  }));
}

async function refundQueuedProject(projectId: string, userId: string, tokensCost: number) {
  await prisma.$transaction(async (tx) => {
    await tx.project.update({
      where: { id: projectId },
      data: { status: 'FAILED', errorMessage: 'Queue unavailable', errorCode: 'QUEUE_UNAVAILABLE' },
    });
    const user = await tx.user.update({
      where: { id: userId },
      data: { tokenBalance: { increment: tokensCost } },
      select: { tokenBalance: true },
    });
    await tx.tokenTransaction.create({
      data: {
        reason: 'refund',
        amount: tokensCost,
        balanceAfter: user.tokenBalance,
        refId: projectId,
        userId,
      },
    });
  });
}

/** Списание из изолированного бюджета нейролаборатории урока (не из кошелька семьи). */
export interface LabBilling {
  kind: 'lesson-lab';
  lessonId: string;
  videoAllowed: boolean;
}

export async function createFreeChatProject(userId: string, rawBody: unknown, billing?: LabBilling) {
  const body = chatMessageSchema.parse(rawBody);
  const model = getChatModel(body.modelSlug);
  if (!model) throw new HttpError(400, 'UNKNOWN_CHAT_MODEL', 'Модель недоступна в Allvision AI');
  if (billing?.kind === 'lesson-lab' && !billing.videoAllowed && model.category === 'video') {
    throw new HttpError(400, 'VIDEO_NOT_ALLOWED', 'В этой лаборатории доступны только модели картинок');
  }

  const prompt = (body.prompt ?? '').trim();
  if (model.requiresPrompt && prompt.length === 0) {
    throw new HttpError(400, 'PROMPT_REQUIRED', 'Введите запрос для генерации');
  }

  const aspectRatio = body.aspectRatio ?? model.supportedAspectRatios[0] ?? 'auto';
  if (!model.supportedAspectRatios.includes(aspectRatio)) {
    throw new HttpError(400, 'UNSUPPORTED_ASPECT_RATIO', 'Эта модель не поддерживает выбранное соотношение сторон');
  }
  if (body.generateAudio && !model.supportsAudio) {
    throw new HttpError(400, 'AUDIO_NOT_SUPPORTED', 'Эта модель не генерирует звук');
  }
  let duration: number | 'auto' | undefined = model.category === 'video' ? body.duration ?? model.defaultDurationSec ?? 5 : undefined;
  // «auto» разрешено только для моделей, которые его поддерживают (Seedance 2.0); иначе — дефолт.
  if (duration === 'auto' && !model.durationAutoSupported) {
    duration = model.defaultDurationSec ?? 5;
  }
  if (typeof duration === 'number' && model.minDurationSec !== undefined && duration < model.minDurationSec) {
    throw new HttpError(400, 'UNSUPPORTED_DURATION', `Минимальная длительность для этой модели: ${model.minDurationSec} сек.`);
  }
  if (typeof duration === 'number' && model.maxDurationSec !== undefined && duration > model.maxDurationSec) {
    throw new HttpError(400, 'UNSUPPORTED_DURATION', `Максимальная длительность для этой модели: ${model.maxDurationSec} сек.`);
  }

  const genericInput = body.inputRef ? await resolveInputRef(body.inputRef, userId) : null;
  const imageInput = body.imageInputRef ? await resolveInputRef(body.imageInputRef, userId) : genericInput?.mediaKind === 'image' ? genericInput : null;
  const videoInput = body.videoInputRef ? await resolveInputRef(body.videoInputRef, userId) : genericInput?.mediaKind === 'video' ? genericInput : null;
  const audioInput = body.audioInputRef ? await resolveInputRef(body.audioInputRef, userId) : genericInput?.mediaKind === 'audio' ? genericInput : null;
  if (imageInput && imageInput.mediaKind !== 'image') {
    throw new HttpError(400, 'IMAGE_INPUT_REQUIRED', 'Выберите изображение как референс');
  }
  if (videoInput && videoInput.mediaKind !== 'video') {
    throw new HttpError(400, 'VIDEO_INPUT_REQUIRED', 'Выберите видео как референс');
  }
  if (audioInput && audioInput.mediaKind !== 'audio') {
    throw new HttpError(400, 'AUDIO_INPUT_REQUIRED', 'Выберите аудио как референс');
  }
  if (imageInput && !model.acceptsImageInput) {
    throw new HttpError(400, 'IMAGE_INPUT_NOT_SUPPORTED', 'Эта модель работает только с промптом');
  }
  if (videoInput && !model.acceptsVideoInput) {
    throw new HttpError(400, 'VIDEO_INPUT_NOT_SUPPORTED', 'Эта модель не принимает видео-референс');
  }
  if (audioInput && !model.acceptsAudioInput) {
    throw new HttpError(400, 'AUDIO_INPUT_NOT_SUPPORTED', 'Эта модель не принимает аудио-референс');
  }
  if (!model.acceptsTextOnly && model.acceptsImageInput && !imageInput) {
    throw new HttpError(400, 'IMAGE_INPUT_REQUIRED', 'Для этой модели нужно прикрепить изображение');
  }
  if (!model.acceptsTextOnly && model.acceptsVideoInput && !model.acceptsImageInput && !videoInput) {
    throw new HttpError(400, 'VIDEO_INPUT_REQUIRED', 'Для этой модели нужно прикрепить видео');
  }

  const input = imageInput ?? videoInput ?? audioInput;
  const generateAudio = model.supportsAudio && body.generateAudio === true;
  const extraParams = await normaliseChatParams(body.params, userId);
  const paramsWithReferences: Record<string, unknown> = {
    ...extraParams,
    ...(model.slug === 'kling-3-omni' && imageInput && !extraParams.images
      ? { images: [imageInput.publicUrl] }
      : {}),
    ...(model.slug === 'kling-3-omni' && videoInput && !extraParams.video
      ? { video: videoInput.publicUrl }
      : {}),
    ...(model.blockSlug === 'text-to-video' && model.slug !== 'kling-3-omni' && imageInput && model.acceptsImageInput && !extraParams.image_urls
      ? { image_urls: [imageInput.publicUrl] }
      : {}),
    ...(model.blockSlug === 'text-to-video' && model.slug !== 'kling-3-omni' && videoInput && model.acceptsVideoInput && !extraParams.video_urls
      ? { video_urls: [videoInput.publicUrl] }
      : {}),
  };
  const paramsWithAudio = audioInput && model.audioInputParam && !paramsWithReferences[model.audioInputParam]
    ? { ...paramsWithReferences, [model.audioInputParam]: model.audioInputParam === 'audio_urls' ? [audioInput.publicUrl] : audioInput.publicUrl }
    : paramsWithReferences;
  if (model.blockSlug === 'motion-transfer' && !paramsWithAudio.video_url && !paramsWithAudio.preset_motion) {
    throw new HttpError(400, 'MOTION_REFERENCE_REQUIRED', 'Для Motion Control нужен driving video или preset motion');
  }
  if (model.blockSlug === 'face-swap-video' && !paramsWithAudio.target_video) {
    throw new HttpError(400, 'TARGET_VIDEO_REQUIRED', 'Для face swap нужно выбрать target video');
  }
  if (model.blockSlug === 'fal-generic' && !(typeof paramsWithAudio.endpoint === 'string' && paramsWithAudio.endpoint.trim())) {
    throw new HttpError(400, 'FAL_ENDPOINT_REQUIRED', 'Укажите fal endpoint (напр. fal-ai/veo3.1)');
  }
  // Для оценки цены «auto» считаем по дефолтной длительности модели.
  const pricingDuration = typeof duration === 'number' ? duration : (model.defaultDurationSec ?? 5);
  const tokensCost = estimateChatGenerationPriceCoins(model.slug, {
    duration: pricingDuration,
    generateAudio,
    params: paramsWithAudio,
    priceOverrides: await readModelPriceOverrides(),
  });
  const pipelineSnapshot = buildPipeline({
    blockSlug: model.blockSlug,
    modelSlug: model.slug,
    prompt,
    aspectRatio,
    duration,
    generateAudio,
    audioParam: model.audioParam,
    extraParams: paramsWithAudio,
    inputRef: input?.ref.startsWith('result:') ? input.publicUrl : input?.ref ?? null,
  });
  const stepProgress = pipelineSnapshot.map((step) => ({
    stepId: step.id,
    blockSlug: step.blockSlug,
    status: 'pending',
    progress: 0,
  }));

  let project;
  try {
    project = await prisma.$transaction(async (tx) => {
      let balanceAfter = 0;
      if (billing?.kind === 'lesson-lab') {
        // Списываем из бюджета урока; кошелёк семьи не трогаем.
        const lesson = await tx.lesson.findUnique({ where: { id: billing.lessonId }, select: { labTokensGranted: true, labTokensSpent: true } });
        const remaining = (lesson?.labTokensGranted ?? 0) - (lesson?.labTokensSpent ?? 0);
        if (!lesson?.labTokensGranted || remaining < tokensCost) {
          throw new HttpError(402, 'INSUFFICIENT_LAB_TOKENS', 'В лаборатории урока не хватает токенов');
        }
        await tx.lesson.update({ where: { id: billing.lessonId }, data: { labTokensSpent: { increment: tokensCost } } });
      } else {
        const user = await tx.user.update({
          where: { id: userId, tokenBalance: { gte: tokensCost } },
          data: { tokenBalance: { decrement: tokensCost } },
          select: { tokenBalance: true },
        });
        balanceAfter = user.tokenBalance;
      }
      const created = await tx.project.create({
        data: {
          userId,
          mode: billing?.kind === 'lesson-lab' ? 'lesson-lab' : 'free-chat',
          title: prompt ? titleFromPrompt(prompt) : `Чат: ${model.functionTitle}`,
          status: 'PENDING',
          progress: 0,
          inputImages: imageInput ? [imageInput.publicUrl] : [],
          inputText: prompt,
          tokensCost,
          pipelineSnapshot: pipelineSnapshot as Prisma.InputJsonValue,
          selectedTier: 'standard',
          expiresAt: generationExpiresAt(),
          userInputs: {
            chatGeneration: removeUndefined({
              modelSlug: model.slug,
              blockSlug: model.blockSlug,
              category: model.category,
              prompt: prompt || undefined,
              aspectRatio,
              duration,
              generateAudio: generateAudio || undefined,
              params: Object.keys(paramsWithAudio).length > 0 ? paramsWithAudio : undefined,
              inputRef: input?.ref,
              imageInputRef: imageInput?.ref,
              videoInputRef: videoInput?.ref,
              audioInputRef: audioInput?.ref,
              inputPreviewUrl: input?.publicUrl,
            }),
            ...(billing?.kind === 'lesson-lab' ? { labLessonId: billing.lessonId } : {}),
          } as Prisma.InputJsonValue,
          stepProgress: stepProgress as Prisma.InputJsonValue,
        },
        select: {
          id: true,
          status: true,
          progress: true,
          tokensCost: true,
          createdAt: true,
          expiresAt: true,
          serviceId: true,
          title: true,
        },
      });
      if (billing?.kind !== 'lesson-lab') {
        await tx.tokenTransaction.create({
          data: {
            reason: 'free_chat',
            amount: -tokensCost,
            balanceAfter,
            refId: created.id,
            userId,
          },
        });
      }
      return created;
    });
  } catch (err) {
    if (err instanceof HttpError) throw err;
    if (isPrismaNotFound(err)) {
      throw new HttpError(402, 'INSUFFICIENT_TOKENS', 'Недостаточно токенов');
    }
    throw err;
  }

  try {
    await queues.addServicePipelineJob({ projectId: project.id, userId, mode: 'production' });
  } catch (err) {
    logger.error(`Failed to enqueue free-chat project ${project.id}`, err);
    if (billing?.kind === 'lesson-lab') {
      await prisma.lesson.update({ where: { id: billing.lessonId }, data: { labTokensSpent: { decrement: tokensCost } } }).catch(() => undefined);
    } else {
      await refundQueuedProject(project.id, userId, tokensCost);
    }
    throw new HttpError(503, 'QUEUE_UNAVAILABLE', 'Очередь задач недоступна');
  }

  return {
    body,
    model,
    input,
    projectId: project.id,
    project,
    status: 'queued' as const,
    estimatedDurationSec: estimateDurationSec(model.category),
    aspectRatio,
    // ChatMessage.duration — Int?; для «auto» пишем null (в pipeline/userInputs 'auto' сохранён).
    duration: typeof duration === 'number' ? duration : null,
  };
}

export function parseChatGenerationMeta(value: unknown): {
  modelSlug?: string;
  category?: string;
  prompt?: string;
  inputPreviewUrl?: string;
} | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const meta = (value as Record<string, unknown>).chatGeneration;
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return null;
  const record = meta as Record<string, unknown>;
  return {
    modelSlug: typeof record.modelSlug === 'string' ? record.modelSlug : undefined,
    category: typeof record.category === 'string' ? record.category : undefined,
    prompt: typeof record.prompt === 'string' ? record.prompt : undefined,
    inputPreviewUrl: typeof record.inputPreviewUrl === 'string' ? record.inputPreviewUrl : undefined,
  };
}

export type ChatReference = { url: string; mediaKind: 'image' | 'video' | 'audio' };

// Ключи chatGeneration.params, которые держат публичные URL прикреплённых референсов.
const REFERENCE_PARAM_KEYS = ['images', 'image_urls', 'video', 'video_url', 'video_urls', 'tail_image_url', 'target_video', 'audio_url', 'audio_urls'];

/** Собирает прикреплённые к сообщению референсы (главный вход + слоты) для показа в результате. */
export function extractChatReferences(value: unknown): ChatReference[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const meta = (value as Record<string, unknown>).chatGeneration;
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return [];
  const record = meta as Record<string, unknown>;
  const urls: string[] = [];
  if (typeof record.inputPreviewUrl === 'string') urls.push(record.inputPreviewUrl);
  const params = record.params;
  if (params && typeof params === 'object' && !Array.isArray(params)) {
    for (const key of REFERENCE_PARAM_KEYS) {
      const v = (params as Record<string, unknown>)[key];
      if (typeof v === 'string') urls.push(v);
      else if (Array.isArray(v)) for (const item of v) if (typeof item === 'string') urls.push(item);
    }
  }
  const seen = new Set<string>();
  const refs: ChatReference[] = [];
  for (const url of urls) {
    if (!url || url.startsWith('data:') || seen.has(url)) continue;
    seen.add(url);
    const mediaKind = mediaKindFromKey(url) ?? 'image';
    refs.push({ url, mediaKind });
  }
  return refs;
}
