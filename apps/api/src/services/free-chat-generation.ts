import { Prisma, prisma } from '@allvision/database';
import { estimateChatGenerationCostCoins, getChatModel, type ChatAspectRatio } from '@allvision/shared';
import { z } from 'zod';
import { HttpError } from '../utils/http-error';
import { logger } from '../utils/logger';
import * as queues from '../queues';

export const chatMessageSchema = z.object({
  modelSlug: z.string().trim().min(1),
  prompt: z.string().trim().min(1).max(4000),
  aspectRatio: z.enum(['1:1', '9:16', '16:9', 'auto']).optional(),
  duration: z.coerce.number().int().min(1).max(30).optional(),
  generateAudio: z.boolean().optional(),
  inputRef: z.string().trim().min(1).optional(),
  imageInputRef: z.string().trim().min(1).optional(),
  videoInputRef: z.string().trim().min(1).optional(),
});

export type ChatMessageBody = z.infer<typeof chatMessageSchema>;

type InputRef = {
  ref: string;
  publicUrl: string;
  mediaKind: 'image' | 'video';
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

function mediaKindFromMime(mimeType: string): 'image' | 'video' | null {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  return null;
}

function mediaKindFromKey(key: string): 'image' | 'video' | null {
  if (/\.(jpe?g|png|webp)(\?|$)/i.test(key)) return 'image';
  if (/\.(mp4|mov|webm)(\?|$)/i.test(key)) return 'video';
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
  duration?: number;
  generateAudio?: boolean;
  audioParam?: 'enable_audio' | 'generate_audio';
  inputRef: string | null;
}) {
  const baseParams: Record<string, unknown> = {
    model: params.modelSlug,
    prompt: params.prompt,
    aspect_ratio: params.aspectRatio,
  };
  if (params.duration !== undefined) baseParams.duration = params.duration;
  if (params.generateAudio && params.audioParam) baseParams[params.audioParam] = true;
  if (params.blockSlug === 'image-edit') {
    baseParams.output_format = 'jpg';
    baseParams.resolution = '1K';
  }
  if (params.blockSlug === 'text-to-video') {
    baseParams.mode = 'text_to_video';
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

export async function createFreeChatProject(userId: string, rawBody: unknown) {
  const body = chatMessageSchema.parse(rawBody);
  const model = getChatModel(body.modelSlug);
  if (!model) throw new HttpError(400, 'UNKNOWN_CHAT_MODEL', 'Модель недоступна в Allvision AI');

  const aspectRatio = body.aspectRatio ?? model.supportedAspectRatios[0] ?? 'auto';
  if (!model.supportedAspectRatios.includes(aspectRatio)) {
    throw new HttpError(400, 'UNSUPPORTED_ASPECT_RATIO', 'Эта модель не поддерживает выбранное соотношение сторон');
  }
  if (body.generateAudio && !model.supportsAudio) {
    throw new HttpError(400, 'AUDIO_NOT_SUPPORTED', 'Эта модель не генерирует звук');
  }
  const duration = model.category === 'video' ? body.duration ?? model.defaultDurationSec ?? 5 : undefined;
  if (duration !== undefined && model.minDurationSec !== undefined && duration < model.minDurationSec) {
    throw new HttpError(400, 'UNSUPPORTED_DURATION', `Минимальная длительность для этой модели: ${model.minDurationSec} сек.`);
  }
  if (duration !== undefined && model.maxDurationSec !== undefined && duration > model.maxDurationSec) {
    throw new HttpError(400, 'UNSUPPORTED_DURATION', `Максимальная длительность для этой модели: ${model.maxDurationSec} сек.`);
  }

  const genericInput = body.inputRef ? await resolveInputRef(body.inputRef, userId) : null;
  const imageInput = body.imageInputRef ? await resolveInputRef(body.imageInputRef, userId) : genericInput?.mediaKind === 'image' ? genericInput : null;
  const videoInput = body.videoInputRef ? await resolveInputRef(body.videoInputRef, userId) : genericInput?.mediaKind === 'video' ? genericInput : null;
  if (imageInput && imageInput.mediaKind !== 'image') {
    throw new HttpError(400, 'IMAGE_INPUT_REQUIRED', 'Выберите изображение как референс');
  }
  if (videoInput && videoInput.mediaKind !== 'video') {
    throw new HttpError(400, 'VIDEO_INPUT_REQUIRED', 'Выберите видео как референс');
  }
  if (imageInput && !model.acceptsImageInput) {
    throw new HttpError(400, 'IMAGE_INPUT_NOT_SUPPORTED', 'Эта модель работает только с промптом');
  }
  if (videoInput && !model.acceptsVideoInput) {
    throw new HttpError(400, 'VIDEO_INPUT_NOT_SUPPORTED', 'Эта модель не принимает видео-референс');
  }
  if (!model.acceptsTextOnly && model.acceptsImageInput && !imageInput) {
    throw new HttpError(400, 'IMAGE_INPUT_REQUIRED', 'Для этой модели нужно прикрепить изображение');
  }
  if (!model.acceptsTextOnly && model.acceptsVideoInput && !videoInput) {
    throw new HttpError(400, 'VIDEO_INPUT_REQUIRED', 'Для этой модели нужно прикрепить видео');
  }

  const input = imageInput ?? videoInput;
  const generateAudio = model.supportsAudio && body.generateAudio === true;
  const tokensCost = estimateChatGenerationCostCoins(model.slug, { duration, generateAudio });
  const pipelineSnapshot = buildPipeline({
    blockSlug: model.blockSlug,
    modelSlug: model.slug,
    prompt: body.prompt,
    aspectRatio,
    duration,
    generateAudio,
    audioParam: model.audioParam,
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
      const user = await tx.user.update({
        where: { id: userId, tokenBalance: { gte: tokensCost } },
        data: { tokenBalance: { decrement: tokensCost } },
        select: { tokenBalance: true },
      });
      const created = await tx.project.create({
        data: {
          userId,
          mode: 'free-chat',
          title: titleFromPrompt(body.prompt),
          status: 'PENDING',
          progress: 0,
          inputImages: imageInput ? [imageInput.publicUrl] : [],
          inputText: body.prompt,
          tokensCost,
          pipelineSnapshot: pipelineSnapshot as Prisma.InputJsonValue,
          selectedTier: 'standard',
          userInputs: {
            chatGeneration: removeUndefined({
              modelSlug: model.slug,
              blockSlug: model.blockSlug,
              category: model.category,
              prompt: body.prompt,
              aspectRatio,
              duration,
              generateAudio: generateAudio || undefined,
              inputRef: input?.ref,
              imageInputRef: imageInput?.ref,
              videoInputRef: videoInput?.ref,
              inputPreviewUrl: input?.publicUrl,
            }),
          } as Prisma.InputJsonValue,
          stepProgress: stepProgress as Prisma.InputJsonValue,
        },
        select: {
          id: true,
          status: true,
          progress: true,
          tokensCost: true,
          createdAt: true,
          serviceId: true,
          title: true,
        },
      });
      await tx.tokenTransaction.create({
        data: {
          reason: 'free_chat',
          amount: -tokensCost,
          balanceAfter: user.tokenBalance,
          refId: created.id,
          userId,
        },
      });
      return created;
    });
  } catch (err) {
    if (isPrismaNotFound(err)) {
      throw new HttpError(402, 'INSUFFICIENT_TOKENS', 'Недостаточно коинов');
    }
    throw err;
  }

  try {
    await queues.addServicePipelineJob({ projectId: project.id, userId, mode: 'production' });
  } catch (err) {
    logger.error(`Failed to enqueue free-chat project ${project.id}`, err);
    await refundQueuedProject(project.id, userId, tokensCost);
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
    duration,
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
