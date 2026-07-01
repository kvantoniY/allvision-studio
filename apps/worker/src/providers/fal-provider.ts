import { prisma } from '@allvision/database';
import type { StorageProvider } from '@allvision/shared';
import type { AIProvider, ProviderResult, ProviderRunContext } from './ai-provider';
import { FalClient, type FalCompletedResult } from './fal-client';
import { ProviderError } from './provider-errors';
import { createAIUsageLog } from './usage-limits';

type Logger = {
  info: (message: string, meta?: unknown) => void;
  warn: (message: string, meta?: unknown) => void;
  error: (message: string, meta?: unknown) => void;
};

export interface FalProviderOptions {
  apiKey: string;
  queueBaseUrl?: string;
  storage: StorageProvider;
  logger: Logger;
}

type FalModelKind = 'image' | 'text-to-video' | 'image-to-video';

interface FalModelConfig {
  /** fal endpoint для основного режима. */
  endpoint: string;
  /** Отдельный endpoint для image-to-image (edit), если у модели он другой. */
  editEndpoint?: string;
  kind: FalModelKind;
  /** Принимает ли картинки на вход (для image-моделей). */
  supportsImageInput?: boolean;
  /** Грубая оценка стоимости USD на случай, если fal не вернул цену. */
  estimatedCostUsd: number;
  /**
   * Как строить aspect_ratio/resolution для этой модели:
   * - default: наши aspect_ratio + resolution (nano/gpt/seedream/flux/kling/veo — принимают/игнорят лишнее).
   * - minimal: только prompt/refs/duration, без aspect/resolution (безопасно для моделей с чужим enum).
   * - grok-image / grok-video: свой словарь (resolution 1k/2k и 480p/720p, ограниченный набор aspect).
   */
  paramProfile?: 'default' | 'minimal' | 'aspect-only' | 'grok-image' | 'grok-video';
}

/**
 * ВАЖНО: endpoint id и часть полей input у каждой fal-модели нужно ПОДТВЕРДИТЬ смоук-тестом
 * после получения FAL_KEY (доки fal иногда расходятся с runtime, как было с PiAPI). Это
 * единственная таблица, которую правим по результатам смоука — логика провайдера универсальна.
 *
 * Источник наших slug'ов -> apps/worker/src/providers/piapi-provider.ts и blocks registry.
 */
const FAL_MODELS: Record<string, FalModelConfig> = {
  // ---- image (image-edit блок) ----
  // Nano Banana Pro (Gemini 3 Pro image) — флагман по консистентности лица и рендеру текста.
  'nano-banana': { endpoint: 'fal-ai/nano-banana-pro', editEndpoint: 'fal-ai/nano-banana-pro/edit', kind: 'image', supportsImageInput: true, estimatedCostUsd: 0.14 },
  // GPT Image 2 (последняя image-модель OpenAI) живёт в неймспейсе openai/ на fal.
  'gpt-image-2': { endpoint: 'openai/gpt-image-2', editEndpoint: 'openai/gpt-image-2/edit', kind: 'image', supportsImageInput: true, estimatedCostUsd: 0.1 },
  'flux-schnell': { endpoint: 'fal-ai/flux/schnell', kind: 'image', supportsImageInput: false, estimatedCostUsd: 0.003 },
  'flux-dev': { endpoint: 'fal-ai/flux/dev', kind: 'image', supportsImageInput: false, estimatedCostUsd: 0.025 },
  'seedream-5-lite': { endpoint: 'fal-ai/bytedance/seedream/v5/lite/text-to-image', editEndpoint: 'fal-ai/bytedance/seedream/v5/lite/edit', kind: 'image', supportsImageInput: true, estimatedCostUsd: 0.03 },
  // Grok Imagine (xAI). resolution 1k/2k, ограниченный набор aspect — профиль grok-image.
  'grok-image': { endpoint: 'xai/grok-imagine-image', editEndpoint: 'xai/grok-imagine-image/edit', kind: 'image', supportsImageInput: true, estimatedCostUsd: 0.05, paramProfile: 'grok-image' },
  'flux-pro-ultra': { endpoint: 'fal-ai/flux-pro/v1.1-ultra', kind: 'image', supportsImageInput: false, estimatedCostUsd: 0.06, paramProfile: 'aspect-only' },
  'recraft-v3': { endpoint: 'fal-ai/recraft/v3/text-to-image', kind: 'image', supportsImageInput: false, estimatedCostUsd: 0.04, paramProfile: 'minimal' },
  'ideogram-v3': { endpoint: 'fal-ai/ideogram/v3', kind: 'image', supportsImageInput: false, estimatedCostUsd: 0.06, paramProfile: 'minimal' },

  // ---- text-to-video ----
  'veo-3.1': { endpoint: 'fal-ai/veo3.1', kind: 'text-to-video', estimatedCostUsd: 1.5 },
  'veo-3.1-fast': { endpoint: 'fal-ai/veo3.1/fast', kind: 'text-to-video', estimatedCostUsd: 0.75 },
  // Sora 2: отдельного /pro эндпоинта в докахfal нет — pro маппится на базовый sora-2 t2v.
  'sora-2': { endpoint: 'fal-ai/sora-2/text-to-video', kind: 'text-to-video', estimatedCostUsd: 1.0 },
  'sora-2-pro': { endpoint: 'fal-ai/sora-2/text-to-video', kind: 'text-to-video', estimatedCostUsd: 2.0 },
  // Seedance 2.0 на fal живёт в неймспейсе bytedance/seedance-2.0/... (НЕ fal-ai/bytedance/seedance/v2).
  'seedance-2': { endpoint: 'bytedance/seedance-2.0/text-to-video', kind: 'text-to-video', estimatedCostUsd: 1.5 },
  'seedance-2-fast': { endpoint: 'bytedance/seedance-2.0/fast/text-to-video', kind: 'text-to-video', estimatedCostUsd: 0.75 },
  // omni -> отдельный reference-to-video эндпоинт Seedance (image_urls/video_urls как референсы).
  'seedance-2-omni': { endpoint: 'bytedance/seedance-2.0/reference-to-video', kind: 'text-to-video', estimatedCostUsd: 1.5 },
  'seedance-2-fast-omni': { endpoint: 'bytedance/seedance-2.0/fast/reference-to-video', kind: 'text-to-video', estimatedCostUsd: 0.75 },
  // kling-3-omni -> Kling v3 pro text-to-video (из реального каталога fal).
  'kling-3-omni': { endpoint: 'fal-ai/kling-video/v3/pro/text-to-video', kind: 'text-to-video', estimatedCostUsd: 0.5 },
  // hailuo text-to-video: слуги *-text (в чате hailuo-2.3/hailuo-2.3-fast — это image-to-video, см. ниже).
  'hailuo-2.3-text': { endpoint: 'fal-ai/minimax/hailuo-02/standard/text-to-video', kind: 'text-to-video', estimatedCostUsd: 0.5 },
  'hailuo-2.3-fast-text': { endpoint: 'fal-ai/minimax/hailuo-02/fast/text-to-video', kind: 'text-to-video', estimatedCostUsd: 0.3 },
  'wan-2.6': { endpoint: 'fal-ai/wan-25-preview/text-to-video', kind: 'text-to-video', estimatedCostUsd: 0.4 },
  'luma-ray2': { endpoint: 'fal-ai/luma-dream-machine/ray-2', kind: 'text-to-video', estimatedCostUsd: 0.5, paramProfile: 'aspect-only' },

  // ---- image-to-video ----
  'hailuo-2.3': { endpoint: 'fal-ai/minimax/hailuo-02/standard/image-to-video', kind: 'image-to-video', estimatedCostUsd: 0.5 },
  'hailuo-2.3-fast': { endpoint: 'fal-ai/minimax/hailuo-02/fast/image-to-video', kind: 'image-to-video', estimatedCostUsd: 0.3 },
  'kling-std': { endpoint: 'fal-ai/kling-video/v2.5-turbo/standard/image-to-video', kind: 'image-to-video', estimatedCostUsd: 0.25 },
  'kling-pro': { endpoint: 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video', kind: 'image-to-video', estimatedCostUsd: 0.35 },
  'kling-3-std': { endpoint: 'fal-ai/kling-video/v3/standard/image-to-video', kind: 'image-to-video', estimatedCostUsd: 0.5 },
  'kling-3-pro': { endpoint: 'fal-ai/kling-video/v3/pro/image-to-video', kind: 'image-to-video', estimatedCostUsd: 0.5 },
  'veo-3.1-i2v': { endpoint: 'fal-ai/veo3.1/image-to-video', kind: 'image-to-video', estimatedCostUsd: 1.5 },
  'veo-3.1-fast-i2v': { endpoint: 'fal-ai/veo3.1/fast/image-to-video', kind: 'image-to-video', estimatedCostUsd: 0.75 },
  'seedance-2-first-last': { endpoint: 'bytedance/seedance-2.0/image-to-video', kind: 'image-to-video', estimatedCostUsd: 1.5 },
  'seedance-2-fast-first-last': { endpoint: 'bytedance/seedance-2.0/fast/image-to-video', kind: 'image-to-video', estimatedCostUsd: 0.75 },
  'hailuo-2.3-i2v': { endpoint: 'fal-ai/minimax/hailuo-02/standard/image-to-video', kind: 'image-to-video', estimatedCostUsd: 0.5 },
  'wan-2.6-i2v': { endpoint: 'fal-ai/wan-25-preview/image-to-video', kind: 'image-to-video', estimatedCostUsd: 0.4 },
  'grok-video': { endpoint: 'xai/grok-imagine-video/image-to-video', kind: 'image-to-video', estimatedCostUsd: 0.4, paramProfile: 'grok-video' },
  'luma-ray2-i2v': { endpoint: 'fal-ai/luma-dream-machine/ray-2/image-to-video', kind: 'image-to-video', estimatedCostUsd: 0.5, paramProfile: 'aspect-only' },
};

// Наборы допустимых aspect для моделей с ограниченным словарём (иначе fal 422 по enum).
const GROK_IMAGE_ASPECTS = new Set(['1:1', '16:9', '9:16', '2:3', '3:2']);
const GROK_VIDEO_ASPECTS = new Set(['auto', '16:9', '4:3', '3:2', '1:1', '2:3', '3:4', '9:16']);

/** Возвращает extra-поля aspect_ratio/resolution по профилю модели, безопасно (без enum-422). */
function imageProfileFields(profile: FalModelConfig['paramProfile'], aspect: string | undefined, resolution: string | undefined): Record<string, unknown> {
  if (profile === 'minimal') return {};
  if (profile === 'aspect-only') return aspect ? { aspect_ratio: aspect } : {};
  if (profile === 'grok-image') {
    const out: Record<string, unknown> = {};
    if (aspect && GROK_IMAGE_ASPECTS.has(aspect)) out.aspect_ratio = aspect;
    // grok resolution — только 1k/2k строчными
    if (resolution) out.resolution = /4k|3k|2k/i.test(resolution) ? '2k' : '1k';
    return out;
  }
  const out: Record<string, unknown> = {};
  if (aspect) out.aspect_ratio = aspect;
  if (resolution) out.resolution = resolution;
  return out;
}

function videoProfileFields(profile: FalModelConfig['paramProfile'], aspect: string | undefined, resolution: string | undefined): Record<string, unknown> {
  if (profile === 'minimal') return {};
  if (profile === 'aspect-only') return aspect ? { aspect_ratio: aspect } : {};
  if (profile === 'grok-video') {
    const out: Record<string, unknown> = {};
    if (aspect && GROK_VIDEO_ASPECTS.has(aspect)) out.aspect_ratio = aspect;
    if (resolution && /480/.test(resolution)) out.resolution = '480p';
    else if (resolution) out.resolution = '720p';
    return out;
  }
  const out: Record<string, unknown> = {};
  if (aspect) out.aspect_ratio = aspect;
  if (resolution) out.resolution = resolution;
  return out;
}

const VIDEO_TIMEOUT_MS = 20 * 60 * 1000;
const IMAGE_TIMEOUT_MS = 5 * 60 * 1000;

export class FalProvider implements AIProvider {
  name = 'fal' as const;

  private client: FalClient;
  private storage: StorageProvider;
  private logger: Logger;

  constructor(options: FalProviderOptions) {
    if (process.env.NODE_ENV === 'test' && !process.env.ALLOW_REAL_FAL_IN_TEST) {
      throw new Error('FalProvider refuses to run in test environment. Use StubAIProvider.');
    }
    this.client = new FalClient({ apiKey: options.apiKey, queueBaseUrl: options.queueBaseUrl });
    this.storage = options.storage;
    this.logger = options.logger;
  }

  async initialise() {
    const ok = await this.client.ping();
    if (!ok) {
      this.logger.warn('[fal] ping failed at startup — egress to fal.run may be blocked from this host');
    } else {
      this.logger.info('[fal] provider initialised, egress to fal.run OK');
    }
  }

  async imageEdit(input: {
    imageUrl?: string;
    prompt: string;
    model: string;
    negativePrompt?: string;
    strength?: number;
    params?: Record<string, unknown>;
    context: ProviderRunContext;
  }): Promise<ProviderResult> {
    const config = this.requireModel(input.model, 'image');
    const refs = uniqueUrls([input.imageUrl, ...readStringList(input.params, 'image_urls')]);
    const useEdit = config.supportsImageInput && refs.length > 0;
    const endpoint = useEdit ? (config.editEndpoint ?? config.endpoint) : config.endpoint;

    const falInput: Record<string, unknown> = {
      prompt: input.prompt,
      ...(input.negativePrompt ? { negative_prompt: input.negativePrompt } : {}),
    };
    const aspect = normalizeAspect(readString(input.params, 'aspect_ratio'));
    const resolution = readString(input.params, 'resolution');
    Object.assign(falInput, imageProfileFields(config.paramProfile, aspect, resolution));
    if (useEdit) {
      // Все наши image-edit эндпоинты (nano-banana/edit, gpt-image-1/edit-image, seedream/v4/edit)
      // требуют image_urls[] — даже для одного фото. Раньше при одном реф-фото слали image_url
      // (singular) -> fal 422 "image_urls: Field required". Всегда шлём массив.
      falInput.image_urls = refs;
    }

    return this.run({
      endpoint,
      falInput,
      model: input.model,
      kind: 'image',
      ext: 'jpg',
      estimatedCost: estimateImageCost(input.model, config, resolution),
      context: input.context,
      timeoutMs: IMAGE_TIMEOUT_MS,
      expectedDurationMs: 30 * 1000,
    });
  }

  async imageToVideo(input: {
    imageUrl: string;
    prompt?: string;
    durationSec: number;
    model: string;
    params?: Record<string, unknown>;
    context: ProviderRunContext;
  }): Promise<ProviderResult> {
    const config = this.requireModel(input.model, 'image-to-video');
    const falInput: Record<string, unknown> = {
      image_url: input.imageUrl,
      prompt: input.prompt ?? '',
      duration: input.durationSec,
    };
    const aspect = normalizeAspect(readString(input.params, 'aspect_ratio'));
    const resolution = readString(input.params, 'resolution');
    Object.assign(falInput, videoProfileFields(config.paramProfile, aspect, resolution));

    return this.run({
      endpoint: config.endpoint,
      falInput,
      model: input.model,
      kind: 'image-to-video',
      ext: 'mp4',
      estimatedCost: config.estimatedCostUsd * Math.max(1, Math.ceil(input.durationSec / 5)),
      context: input.context,
      timeoutMs: VIDEO_TIMEOUT_MS,
      expectedDurationMs: 8 * 60 * 1000,
    });
  }

  async textToVideo(input: {
    prompt: string;
    durationSec: number;
    model: string;
    params?: Record<string, unknown>;
    context: ProviderRunContext;
  }): Promise<ProviderResult> {
    const config = this.requireModel(input.model, 'text-to-video');
    const falInput: Record<string, unknown> = {
      prompt: input.prompt,
      duration: input.durationSec,
    };
    const aspect = normalizeAspect(readString(input.params, 'aspect_ratio'));
    const resolution = readString(input.params, 'resolution');
    Object.assign(falInput, videoProfileFields(config.paramProfile, aspect, resolution));
    if (readBoolean(input.params, 'generate_audio')) falInput.generate_audio = true;
    // omni-референсы (картинки/видео сцены) — fal-эндпоинты ждут image_urls/video_url; точные имена
    // полей зависят от модели и подтверждаются смоуком.
    const imageRefs = uniqueUrls([...readStringList(input.params, 'images'), ...readStringList(input.params, 'image_urls')]);
    if (imageRefs.length > 0) falInput.image_urls = imageRefs;
    const videoRefs = uniqueUrls([readString(input.params, 'video'), ...readStringList(input.params, 'video_urls')]);
    if (videoRefs.length > 0) falInput.video_url = videoRefs[0];

    return this.run({
      endpoint: config.endpoint,
      falInput,
      model: input.model,
      kind: 'text-to-video',
      ext: 'mp4',
      estimatedCost: config.estimatedCostUsd,
      context: input.context,
      timeoutMs: VIDEO_TIMEOUT_MS,
      expectedDurationMs: 8 * 60 * 1000,
    });
  }

  // ---- общий исполнитель: submit -> poll -> download -> persist -> usage log ----
  private async run(args: {
    endpoint: string;
    falInput: Record<string, unknown>;
    model: string;
    kind: FalModelKind;
    ext: string;
    estimatedCost: number;
    context: ProviderRunContext;
    timeoutMs: number;
    expectedDurationMs: number;
  }): Promise<ProviderResult> {
    const startedAt = Date.now();
    let requestId: string | undefined;
    let completed: FalCompletedResult | undefined;
    try {
      const submit = await this.client.submit(args.endpoint, args.falInput);
      requestId = submit.requestId;
      await prisma.project.update({
        where: { id: args.context.projectId },
        data: { aiProviderJobId: submit.requestId },
      }).catch((err) => this.logger.warn(`[fal] failed to remember requestId=${submit.requestId}`, err));

      completed = await this.client.pollUntilDone(submit, {
        timeoutMs: args.timeoutMs,
        expectedDurationMs: args.expectedDurationMs,
        onProgress: args.context.reportProgress,
      });

      const outputUrl = extractOutputUrl(completed.output, args.kind);
      if (!outputUrl) {
        throw new ProviderError('FAL_EMPTY_OUTPUT', `fal ${args.model} completed without an output URL`);
      }
      const local = await this.persistOutput(outputUrl, args.context, args.ext);
      const costUsd = completed.costUsd ?? args.estimatedCost;
      const durationMs = Date.now() - startedAt;
      await this.logUsage(args.context, args.model, requestId, 'success', costUsd, durationMs, {
        requestPayload: { endpoint: args.endpoint, input: args.falInput },
        responsePayload: { output: completed.output, localOutputUrl: local.url },
      });
      return {
        outputUrl: local.url,
        costUsd,
        durationMs,
        meta: { falRequestId: requestId, falUrl: outputUrl, model: args.model, provider: 'fal' },
      };
    } catch (err) {
      const durationMs = Date.now() - startedAt;
      await this.logUsage(args.context, args.model, requestId, 'failed', 0, durationMs, {
        errorCode: err instanceof ProviderError ? err.code : 'FAL_ERROR',
        errorMessage: (err as Error).message,
        requestPayload: { endpoint: args.endpoint, input: args.falInput },
        responsePayload: completed ? { output: completed.output } : undefined,
      }).catch(() => undefined);
      throw err;
    }
  }

  private async persistOutput(providerUrl: string, context: ProviderRunContext, fallbackExt: string) {
    const downloaded = await this.client.download(providerUrl);
    const ext = extFor(downloaded.contentType, providerUrl, fallbackExt);
    const key = `outputs/${context.userId ?? 'unknown'}/${context.projectId}/${context.stepId}/result.${ext}`;
    return this.storage.upload({ key, body: downloaded.buffer, contentType: downloaded.contentType });
  }

  private async logUsage(
    context: ProviderRunContext,
    model: string,
    taskId: string | undefined,
    status: 'success' | 'failed',
    costUsd: number,
    durationMs: number,
    extra: {
      errorCode?: string;
      errorMessage?: string;
      requestPayload?: unknown;
      responsePayload?: unknown;
    },
  ) {
    await createAIUsageLog({
      projectId: context.projectId,
      userId: context.userId,
      blockSlug: context.blockSlug,
      provider: 'fal',
      model,
      taskId,
      status,
      costUsd,
      durationMs,
      errorCode: extra.errorCode,
      errorMessage: extra.errorMessage,
      requestPayload: extra.requestPayload,
      responsePayload: extra.responsePayload,
    }).catch((err) => this.logger.warn('[fal] failed to write AIUsageLog', err));
  }

  private requireModel(model: string, kind: FalModelKind): FalModelConfig {
    const config = FAL_MODELS[model];
    if (!config) {
      throw new ProviderError('UNSUPPORTED_MODEL', `Model ${model} is not mapped for fal yet`);
    }
    if (config.kind !== kind) {
      throw new ProviderError('UNSUPPORTED_MODEL', `Model ${model} is ${config.kind}, not ${kind} on fal`);
    }
    return config;
  }

  // ---- нишевые блоки пока остаются на PiAPI (гибридный роутинг в providers/index.ts) ----
  async imageRestore(): Promise<ProviderResult> {
    throw new ProviderError('FAL_NOT_IMPLEMENTED', 'image-restore not implemented on fal yet');
  }
  async faceSwapVideo(): Promise<ProviderResult> {
    throw new ProviderError('FAL_NOT_IMPLEMENTED', 'face-swap not implemented on fal yet');
  }
  // Kling v3 Motion Control (video-to-video): персонаж с image_url повторяет движение из video_url.
  async motionTransfer(input: {
    inputImageUrl: string;
    drivingVideoUrl?: string;
    prompt?: string;
    durationSec: number;
    model: string;
    params?: Record<string, unknown>;
    context: ProviderRunContext;
  }): Promise<ProviderResult> {
    if (!input.drivingVideoUrl) {
      throw new ProviderError('MOTION_REFERENCE_REQUIRED', 'Kling motion-control требует референс-видео движения (video_url)');
    }
    const isPro = input.model.endsWith('-pro');
    const endpoint = isPro
      ? 'fal-ai/kling-video/v3/pro/motion-control'
      : 'fal-ai/kling-video/v3/standard/motion-control';
    const falInput: Record<string, unknown> = {
      image_url: input.inputImageUrl,
      video_url: input.drivingVideoUrl,
      // required enum: image|video. 'video' -> ориентация и длительность берутся из референс-видео (до 30с).
      character_orientation: readString(input.params, 'character_orientation') ?? 'video',
      ...(input.prompt ? { prompt: input.prompt } : {}),
      ...(readBoolean(input.params, 'keep_original_sound') !== undefined
        ? { keep_original_sound: readBoolean(input.params, 'keep_original_sound') }
        : {}),
    };
    const perSec = isPro ? 0.168 : 0.126;
    return this.run({
      endpoint,
      falInput,
      model: input.model,
      kind: 'image-to-video',
      ext: 'mp4',
      estimatedCost: perSec * Math.max(5, input.durationSec || 5),
      context: input.context,
      timeoutMs: VIDEO_TIMEOUT_MS,
      expectedDurationMs: 8 * 60 * 1000,
    });
  }
  async videoEffect(): Promise<ProviderResult> {
    throw new ProviderError('FAL_NOT_IMPLEMENTED', 'video-effect not implemented on fal yet');
  }
  async talkingAvatar(): Promise<ProviderResult> {
    throw new ProviderError('FAL_NOT_IMPLEMENTED', 'talking-avatar not implemented on fal yet');
  }
  async removeWatermark(): Promise<ProviderResult> {
    throw new ProviderError('FAL_NOT_IMPLEMENTED', 'remove-watermark not implemented on fal yet');
  }
  async videoUpscale(): Promise<ProviderResult> {
    throw new ProviderError('FAL_NOT_IMPLEMENTED', 'video-upscale not implemented on fal yet');
  }
}

// ---------- helpers ----------

function extractOutputUrl(output: Record<string, unknown>, kind: FalModelKind): string | undefined {
  if (kind === 'image') {
    const images = output.images;
    if (Array.isArray(images) && images.length > 0) {
      const url = readUrlLike(images[0]);
      if (url) return url;
    }
    const single = readUrlLike(output.image);
    if (single) return single;
  } else {
    const video = readUrlLike(output.video);
    if (video) return video;
    const videos = output.videos;
    if (Array.isArray(videos) && videos.length > 0) {
      const url = readUrlLike(videos[0]);
      if (url) return url;
    }
  }
  // Общий фолбэк: output.url или output.{image,video} как строка.
  const direct = readUrlLike(output.url) ?? readUrlLike(output.output);
  return direct;
}

function readUrlLike(value: unknown): string | undefined {
  if (typeof value === 'string' && /^https?:\/\//.test(value)) return value;
  if (value && typeof value === 'object') {
    const url = (value as Record<string, unknown>).url;
    if (typeof url === 'string' && /^https?:\/\//.test(url)) return url;
  }
  return undefined;
}

function extFor(contentType: string, url: string, fallback: string): string {
  if (contentType.includes('mp4')) return 'mp4';
  if (contentType.includes('png')) return 'png';
  if (contentType.includes('webp')) return 'webp';
  if (contentType.includes('jpeg') || contentType.includes('jpg')) return 'jpg';
  const m = url.split('?')[0]?.match(/\.([a-z0-9]{3,4})$/i);
  if (m) return m[1].toLowerCase();
  return fallback;
}

function normalizeAspect(value: string | undefined): string | undefined {
  if (!value || value === 'auto') return undefined;
  return value;
}

function estimateImageCost(model: string, config: FalModelConfig, resolution?: string): number {
  // nano-banana slug теперь маппится на Nano Banana Pro — дороже базовой версии.
  if (model === 'nano-banana') {
    if (resolution === '4K') return 0.18;
    if (resolution === '2K') return 0.14;
    return 0.12;
  }
  return config.estimatedCostUsd;
}

function readString(params: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = params?.[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readBoolean(params: Record<string, unknown> | undefined, key: string): boolean | undefined {
  const value = params?.[key];
  return typeof value === 'boolean' ? value : undefined;
}

function readStringList(params: Record<string, unknown> | undefined, key: string): string[] {
  const value = params?.[key];
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string' && v.length > 0);
  if (typeof value === 'string' && value.length > 0) return [value];
  return [];
}

function uniqueUrls(urls: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const url of urls) {
    if (typeof url === 'string' && url.length > 0 && !seen.has(url)) {
      seen.add(url);
      out.push(url);
    }
  }
  return out;
}
