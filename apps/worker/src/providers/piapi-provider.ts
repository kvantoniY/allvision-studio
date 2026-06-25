import { spawn } from 'node:child_process';
import { createReadStream, createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import sharp from 'sharp';
import { prisma } from '@allvision/database';
import { resolveWorkspacePath } from '../utils/paths';
import { estimateModelCostUsd, type StorageProvider } from '@allvision/shared';
import type { AIProvider, ProviderResult, ProviderRunContext } from './ai-provider';
import { PiAPIClient, type PiAPIHistoryTask, type PiAPITaskStatus } from './piapi-client';
import { ProviderError } from './provider-errors';
import type { FilePublisher } from './file-publisher';
import { createAIUsageLog } from './usage-limits';

type Logger = {
  info: (message: string, meta?: unknown) => void;
  warn: (message: string, meta?: unknown) => void;
  error: (message: string, meta?: unknown) => void;
};

type VideoUpscalePostprocessSettings = {
  enabled: boolean;
  profile: 'natural' | 'strong' | 'max' | 'custom' | 'off';
  sharpness: number;
  contrast: number;
  clarity: number;
};

type PersistedVideoOutput = {
  url: string;
  key: string;
  postprocess?: {
    enabled: boolean;
    applied: boolean;
    profile: VideoUpscalePostprocessSettings['profile'];
    sharpness: number;
    contrast: number;
    clarity: number;
    filter?: string;
    fallbackReason?: string;
  };
};

export interface PiAPIProviderOptions {
  apiKey: string;
  baseUrl?: string;
  dailyCapUsd: number;
  balanceMinUsd: number;
  storage: StorageProvider;
  publisher: FilePublisher;
  logger: Logger;
}

const KLING_PRICE_5S: Record<string, { mode: 'std' | 'pro'; costUsd: number; version?: string }> = {
  'kling-std': { mode: 'std', costUsd: 0.20 },
  'kling-pro': { mode: 'pro', costUsd: 0.33 },
  'kling-3-std': { mode: 'std', costUsd: 0.50, version: '3.0' },
  'kling-3-pro': { mode: 'pro', costUsd: 0.50, version: '3.0' },
};

const FACE_SWAP_MODEL = 'qubico-video-toolkit';
const FACE_SWAP_COST_PER_FRAME_USD = 0.004;
const DEFAULT_FACE_SWAP_DURATION_SEC = 5;
const DEFAULT_FACE_SWAP_FPS = 24;
const WATERMARK_COST_PER_SEC_USD = 0.008;
// Talking-avatar (OmniHuman 1.5 ~$0.13/sec of audio; Kling lip-sync similar). Estimate by audio seconds.
const TALKING_AVATAR_COST_PER_SEC_USD = 0.13;
const TALKING_AVATAR_DEFAULT_SECONDS = 10;
const VIDEO_UPSCALE_MODEL = 'video-upscale-2x';
const VIDEO_UPSCALE_COST_PER_FRAME_USD = 0.0003;
const VIDEO_UPSCALE_MAX_FRAMES = 240;
const VIDEO_UPSCALE_ESTIMATE_FPS = 16;
const VIDEO_UPSCALE_POSTPROCESS_TIMEOUT_MS = 5 * 60 * 1000;
const PIAPI_VIDEO_TIMEOUT_MS = 30 * 60 * 1000;
const PIAPI_IMAGE_EDIT_TIMEOUT_MS = 5 * 60 * 1000;
// История-recovery для потерянного gpt-image edit укорочена до 2 минут: при раннем обрыве
// задача у PiAPI не регистрируется и искать нечего, а длинное ожидание зря держит worker
// (concurrency=1) и крутит UI. Если задача всё же завершилась — её поднимет серверный reconciler.
const PIAPI_GPT_IMAGE_HISTORY_RECOVERY_MS = 2 * 60 * 1000;
// GPT Image edit uploads references as multipart files FROM the worker. Raw user uploads
// (especially lossless PNG phone shots, 8-20 MB) make the body huge, and the VM egress resets
// the long upload connection (ECONNRESET at progress 5, before generation). Downscale + re-encode
// to JPEG so the body stays small and uploads instantly. gpt-image renders at <=1536 anyway.
const GPT_IMAGE_REF_MAX_PX = 1536;
const GPT_IMAGE_REF_JPEG_QUALITY = 90;
// Мягкий потолок размера одного референса: если первая перекодировка вышла тяжелее,
// пробуем меньше пикселей/качество. Большое multipart-тело — главный известный убийца
// edits-запроса (шлюз рвёт долгий upload на ~15s).
const GPT_IMAGE_REF_TARGET_BYTES = 1_500_000;
// Жёсткий потолок: тело такого размера гарантированно не доживёт до ответа — лучше
// упасть с понятной ошибкой и refund, чем 5 минут мучить соединение и history recovery.
const GPT_IMAGE_REF_HARD_LIMIT_BYTES = 4 * 1024 * 1024;
const GPT_IMAGE_REF_VARIANTS: Array<{ px: number; quality: number }> = [
  { px: GPT_IMAGE_REF_MAX_PX, quality: GPT_IMAGE_REF_JPEG_QUALITY },
  { px: 1280, quality: 80 },
  { px: 1024, quality: 70 },
];
const NANO_BANANA_COST_USD: Record<string, number> = {
  '1K': 0.06,
  '2K': 0.08,
  '4K': 0.12,
};
const SUPPORTED_ASPECT_RATIOS = new Set(['9:16', '16:9', '1:1', '4:3', '3:4', '21:9', '9:21']);
const HAILUO_MODELS = new Set(['hailuo-2.3', 'hailuo-2.3-fast']);
const VEO_IMAGE_TO_VIDEO_MODELS = new Set(['veo-3.1-i2v', 'veo-3.1-fast-i2v']);
const SEEDANCE_IMAGE_TO_VIDEO_MODELS = new Set(['seedance-2-first-last', 'seedance-2-fast-first-last']);
const WAN_IMAGE_TO_VIDEO_MODELS = new Set(['wan-2.6-i2v']);
const TEXT_TO_VIDEO_MODELS = new Set([
  'seedance-2',
  'seedance-2-fast',
  'seedance-2-less-restriction',
  'seedance-2-fast-less-restriction',
  'seedance-2-omni',
  'seedance-2-fast-omni',
  'hailuo-2.3',
  'hailuo-2.3-fast',
  'hailuo-2.3-text',
  'hailuo-2.3-fast-text',
  'kling-3-omni',
  'veo-3.1',
  'veo-3.1-fast',
  'wan-2.6',
  'sora-2',
  'sora-2-pro',
]);
const MOTION_TRANSFER_MODELS = new Set([
  'kling-motion-2.6-std',
  'kling-motion-2.6-pro',
  'kling-motion-3.0-std',
  'kling-motion-3.0-pro',
]);

const IMAGE_EDIT_MODELS_BY_PROVIDER: Record<string, { providerModel: string; taskType: string; supportsImageInput: boolean; estimatedCostUsd: number; maxInputImages?: number }> = {
  'nano-banana': { providerModel: 'gemini', taskType: 'nano-banana-2', supportsImageInput: true, estimatedCostUsd: 0.06, maxInputImages: 14 },
  'flux-schnell': { providerModel: 'Qubico/flux1-schnell', taskType: 'txt2img', supportsImageInput: false, estimatedCostUsd: 0.003 },
  'flux-dev': { providerModel: 'Qubico/flux1-dev', taskType: 'txt2img', supportsImageInput: false, estimatedCostUsd: 0.025 },
  // GPT Image 2 (OpenAI через PiAPI). Идёт НЕ через unified /api/v1/task, а через
  // OpenAI-совместимые /v1/images/generations|edits — см. ветку gpt-image в imageEdit().
  // providerModel/taskType здесь не используются для вызова, оставлены для единообразия каталога.
  'gpt-image-2': { providerModel: 'gpt-image-2', taskType: 'gpt-image-2', supportsImageInput: true, estimatedCostUsd: 0.1, maxInputImages: 10 },
};

const VIDEO_EFFECT_MODELS: Record<string, { providerModel: string; taskType: string; estimatedCostUsd: number }> = {
  'kling-effects': { providerModel: 'kling', taskType: 'effects', estimatedCostUsd: 0.35 },
  'ai-hugs': { providerModel: 'Qubico/ai-hugs', taskType: 'effects', estimatedCostUsd: 0.4 },
};

export class PiAPIProvider implements AIProvider {
  name = 'piapi' as const;

  private client: PiAPIClient;
  private storage: StorageProvider;
  private publisher: FilePublisher;
  private dailyCapUsd: number;
  private balanceMinUsd: number;
  private lowBalance = false;
  private logger: Logger;

  constructor(options: PiAPIProviderOptions) {
    if (process.env.NODE_ENV === 'test' && !process.env.ALLOW_REAL_PIAPI_IN_TEST) {
      throw new Error('PiAPIProvider refuses to run in test environment. Use StubAIProvider.');
    }
    if (!options.apiKey) {
      throw new Error('PIAPI_API_KEY is required for PiAPIProvider');
    }
    this.client = new PiAPIClient({ apiKey: options.apiKey, baseUrl: options.baseUrl });
    this.storage = options.storage;
    this.publisher = options.publisher;
    this.dailyCapUsd = options.dailyCapUsd;
    this.balanceMinUsd = options.balanceMinUsd;
    this.logger = options.logger;
  }

  async initialise() {
    await this.refreshBalance();
    const timer = setInterval(() => {
      this.refreshBalance().catch((err) => {
        this.logger.warn('[piapi] Failed to refresh account balance', err);
      });
    }, 60 * 60 * 1000);
    timer.unref();
  }

  private async createTask(payload: unknown, context: ProviderRunContext) {
    const created = await this.client.createTask(payload);
    await prisma.project.update({
      where: { id: context.projectId },
      data: { aiProviderJobId: created.taskId },
    }).catch((err) => {
      this.logger.warn(`[piapi] Failed to remember taskId=${created.taskId} for project=${context.projectId}`, err);
    });
    return created;
  }

  async imageRestore(): Promise<ProviderResult> {
    throw new ProviderError('IMAGE_RESTORE_NOT_REAL', 'image-restore is mock-only in P6');
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
    const modelConfig = IMAGE_EDIT_MODELS_BY_PROVIDER[input.model];
    if (!modelConfig) {
      throw new ProviderError('UNSUPPORTED_MODEL', `Unsupported image-edit model: ${input.model}`);
    }
    const resolution = readString(input.params, 'resolution') ?? '1K';
    const estimatedCost = input.model === 'nano-banana'
      ? (NANO_BANANA_COST_USD[resolution] ?? NANO_BANANA_COST_USD['1K'])
      : modelConfig.estimatedCostUsd;
    await this.ensureCanCall(estimatedCost);

    const startedAt = Date.now();
    let taskId: string | undefined;
    let completedTask: PiAPITaskStatus | undefined;
    let requestPayload: unknown;
    let createTaskResponse: unknown;
    try {
      // GPT Image идёт через OpenAI-совместимый эндпоинт (синхронно), а не unified task.
      if (input.model.startsWith('gpt-image')) {
        const aspect = normalizeAspectRatio(readString(input.params, 'aspect_ratio'));
        const size = gptImageSizeForAspect(aspect);
        const quality = normalizeGptImageQuality(readString(input.params, 'quality'));
        const outputFormat = normalizeGptImageOutputFormat(readString(input.params, 'output_format'));
        const refs = limitImageReferences(
          uniqueImageReferenceUrls([input.imageUrl, ...readStringList(input.params, 'image_urls')]),
          modelConfig.maxInputImages,
          input.model,
          this.logger,
        );
        requestPayload = {
          endpoint: refs.length > 0 ? '/v1/images/edits' : '/v1/images/generations',
          body: {
            model: input.model,
            prompt: input.prompt,
            n: 1,
            size,
            quality,
            output_format: outputFormat,
            response_format: 'url',
            references: refs,
          },
        };
        // GPT Image edits send the reference as a multipart file, so the WORKER must hold the bytes.
        // Read them from the shared local uploads volume when the URL is our own /static URL, instead of
        // HTTP-fetching the public domain from inside the container (that loopback fails -> network error).
        const images = await Promise.all(refs.map((url) => this.readImageRefBytes(url)));
        // В лог кладём фактический размер каждого референса ПОСЛЕ нормализации: при обрыве
        // edits-запроса это сразу показывает, было ли тело слишком тяжёлым.
        requestPayload = {
          ...(requestPayload as Record<string, unknown>),
          body: {
            ...((requestPayload as { body?: Record<string, unknown> }).body ?? {}),
            references: refs.map((url, index) => ({
              url,
              uploadBytes: images[index]?.buffer.length,
              uploadContentType: images[index]?.contentType,
            })),
          },
        };
        const result = await this.client.generateGptImage({
          model: input.model,
          prompt: input.prompt,
          images,
          size,
          quality,
          outputFormat,
        }).catch(async (err) => {
          if (!isRecoverableGptImageTransportError(err)) throw err;
          const recovered = await this.recoverGptImageFromHistory({
            context: input.context,
            model: input.model,
            prompt: input.prompt,
            startedAt,
            estimatedCost,
            outputFormat,
            size,
            quality,
            originalError: err,
            requestPayload,
          });
          if (recovered) return { recovered };
          throw new ProviderError(
            'PIAPI_SYNC_PENDING',
            'PiAPI response connection was lost; result recovery is still pending',
          );
        });
        if ('recovered' in result) {
          return result.recovered;
        }
        const outputExt = outputFormat === 'jpeg' ? 'jpg' : outputFormat;
        let local;
        if (result.url) {
          local = await this.persistProviderOutput(result.url, input.context, outputExt);
        } else if (result.b64) {
          const contentType = outputExt === 'png' ? 'image/png' : outputExt === 'webp' ? 'image/webp' : 'image/jpeg';
          const key = `outputs/${input.context.userId ?? 'unknown'}/${input.context.projectId}/${input.context.stepId}/result.${outputExt}`;
          local = await this.storage.upload({ key, body: Buffer.from(result.b64, 'base64'), contentType });
        } else {
          throw new ProviderError('PIAPI_EMPTY_OUTPUT', 'GPT Image returned no image');
        }
        const durationMs = Date.now() - startedAt;
        await this.logUsage(input.context, input.model, undefined, 'success', estimatedCost, durationMs, {
          requestPayload,
          responsePayload: {
            result: {
              url: result.url,
              b64: result.b64 ? `[base64:${result.b64.length}-chars]` : undefined,
            },
            localOutputUrl: local.url,
          },
        });
        return {
          outputUrl: local.url,
          costUsd: estimatedCost,
          durationMs,
          meta: { model: input.model, provider: 'piapi', size, quality, outputFormat },
        };
      }
      const aspectRatio = normalizeAspectRatio(readString(input.params, 'aspect_ratio'));
      // "Вход" шага и admin-параметр image_urls — это ОДИН список референсов: вход идёт первым,
      // дубликаты (один и тот же файл, указанный в обоих местах) выбрасываются ДО публикации,
      // и каждый референс проходит через publisher (resize/EXIF/публичный URL), а не только первый.
      const sourceRefs = limitImageReferences(
        uniqueImageReferenceUrls([input.imageUrl, ...readStringList(input.params, 'image_urls')]),
        modelConfig.maxInputImages,
        input.model,
        this.logger,
      );
      let referenceUrls: string[] = [];
      if (modelConfig.supportsImageInput && sourceRefs.length > 0) {
        referenceUrls = [];
        for (const url of sourceRefs) {
          referenceUrls.push((await this.publisher.publishImageUrl(url, 1)).publicUrl);
        }
      } else if (!modelConfig.supportsImageInput && sourceRefs.length > 0) {
        this.logger.warn(
          `[piapi] image-edit model ${input.model} is text-to-image only; ignoring ${sourceRefs.length} image reference(s)`,
        );
      }
      const payload = buildImageEditPayload({
        modelSlug: input.model,
        modelConfig,
        prompt: input.prompt,
        imageUrls: referenceUrls,
        resolution,
        aspectRatio,
        negativePrompt: input.negativePrompt,
        strength: input.strength,
        params: input.params,
      });
      requestPayload = payload;
      const created = await this.createTask(payload, input.context);
      taskId = created.taskId;
      createTaskResponse = created.raw;
      const completed = await this.client.pollUntilDone(taskId, {
        timeoutMs: PIAPI_IMAGE_EDIT_TIMEOUT_MS,
        expectedDurationMs: 60 * 1000,
        onProgress: input.context.reportProgress,
      });
      completedTask = completed;
      if (!completed.outputUrl) {
        throw new ProviderError('PIAPI_EMPTY_OUTPUT', 'PiAPI Nano Banana task completed without image URL');
      }
      const local = await this.persistProviderOutput(completed.outputUrl, input.context, 'jpg');
      const costUsd = costUsdFromActualOrEstimate(completed, estimatedCost);
      const durationMs = Date.now() - startedAt;
      await this.logUsage(input.context, input.model, taskId, 'success', costUsd, durationMs, {
        requestPayload,
        responsePayload: providerTaskResponsePayload(createTaskResponse, completed, { localOutputUrl: local.url }),
      });
      return {
        outputUrl: local.url,
        costUsd,
        durationMs,
        meta: {
          piapiTaskId: taskId,
          piapiUrl: completed.outputUrl,
          model: input.model,
          provider: 'piapi',
          resolution,
          aspectRatio: aspectRatio ?? 'auto',
        },
      };
    } catch (err) {
      const durationMs = Date.now() - startedAt;
      await this.logProviderFailure(input.context, input.model, taskId, durationMs, err, completedTask, estimatedCost, requestPayload, createTaskResponse);
      throw err;
    }
  }

  async imageToVideo(input: {
    imageUrl: string;
    prompt?: string;
    durationSec: number;
    model: string;
    params?: Record<string, unknown>;
    context: ProviderRunContext;
  }): Promise<ProviderResult> {
    const klingModel = KLING_PRICE_5S[input.model];
    const supported = klingModel
      || HAILUO_MODELS.has(input.model)
      || VEO_IMAGE_TO_VIDEO_MODELS.has(input.model)
      || SEEDANCE_IMAGE_TO_VIDEO_MODELS.has(input.model)
      || WAN_IMAGE_TO_VIDEO_MODELS.has(input.model);
    if (!supported) {
      throw new ProviderError('UNSUPPORTED_MODEL', `Unsupported image-to-video model: ${input.model}`);
    }
    const estimatedCost = estimatedCostForModel(input.model, {
      ...(input.params ?? {}),
      duration: input.durationSec,
    }, klingModel ? klingModel.costUsd * Math.max(1, Math.ceil(input.durationSec / 5)) : 0);
    await this.ensureCanCall(estimatedCost);

    const startedAt = Date.now();
    let taskId: string | undefined;
    let completedTask: PiAPITaskStatus | undefined;
    let requestPayload: unknown;
    let createTaskResponse: unknown;
    try {
      const published = await this.publisher.publishImageUrl(input.imageUrl, 1);
      const aspectRatio = await this.resolveImageAspectRatio(input.imageUrl, input.params);
      const payload = buildImageToVideoPayload(input.model, {
        prompt: input.prompt ?? '',
        durationSec: input.durationSec,
        imageUrl: published.publicUrl,
        aspectRatio,
        params: input.params,
      });
      requestPayload = payload;
      const created = await this.createTask(payload, input.context);
      taskId = created.taskId;
      createTaskResponse = created.raw;
      const completed = await this.client.pollUntilDone(taskId, {
        timeoutMs: PIAPI_VIDEO_TIMEOUT_MS,
        expectedDurationMs: 10 * 60 * 1000,
        onProgress: input.context.reportProgress,
      });
      completedTask = completed;
      if (!completed.outputUrl) {
        throw new ProviderError('PIAPI_EMPTY_OUTPUT', 'PiAPI Kling task completed without video_url');
      }
      const local = await this.persistProviderOutput(completed.outputUrl, input.context, 'mp4');
      const costUsd = costUsdFromActualOrEstimate(completed, estimatedCost);
      const durationMs = Date.now() - startedAt;
      await this.logUsage(input.context, input.model, taskId, 'success', costUsd, durationMs, {
        requestPayload,
        responsePayload: providerTaskResponsePayload(createTaskResponse, completed, { localOutputUrl: local.url }),
      });
      return {
        outputUrl: local.url,
        costUsd,
        durationMs,
        meta: {
          piapiTaskId: taskId,
          piapiUrl: completed.outputUrl,
          model: input.model,
          provider: 'piapi',
          aspectRatio: aspectRatio ?? 'auto',
        },
      };
    } catch (err) {
      const durationMs = Date.now() - startedAt;
      await this.logProviderFailure(input.context, input.model, taskId, durationMs, err, completedTask, estimatedCost, requestPayload, createTaskResponse);
      throw err;
    }
  }

  async textToVideo(input: {
    prompt: string;
    durationSec: number;
    model: string;
    params?: Record<string, unknown>;
    context: ProviderRunContext;
  }): Promise<ProviderResult> {
    if (!TEXT_TO_VIDEO_MODELS.has(input.model)) {
      throw new ProviderError('UNSUPPORTED_MODEL', `Unsupported text-to-video model: ${input.model}`);
    }
    const estimatedCost = estimatedCostForModel(input.model, {
      ...(input.params ?? {}),
      duration: input.durationSec,
    }, 0);
    await this.ensureCanCall(estimatedCost);

    const startedAt = Date.now();
    let taskId: string | undefined;
    let completedTask: PiAPITaskStatus | undefined;
    let requestPayload: unknown;
    let createTaskResponse: unknown;
    try {
      const aspectRatio = normalizeAspectRatio(readString(input.params, 'aspect_ratio'));
      const providerParams = await this.publishTextToVideoReferences(input.model, input.params);
      const payload = buildTextToVideoPayload(input.model, {
        prompt: input.prompt,
        durationSec: input.durationSec,
        aspectRatio,
        resolution: readString(input.params, 'resolution'),
        generateAudio: readBoolean(input.params, 'generate_audio') ?? false,
        params: providerParams,
      });
      requestPayload = payload;
      const created = await this.createTask(payload, input.context);
      taskId = created.taskId;
      createTaskResponse = created.raw;
      const completed = await this.client.pollUntilDone(taskId, {
        timeoutMs: PIAPI_VIDEO_TIMEOUT_MS,
        expectedDurationMs: 10 * 60 * 1000,
        onProgress: input.context.reportProgress,
      });
      completedTask = completed;
      if (!completed.outputUrl) {
        throw new ProviderError('PIAPI_EMPTY_OUTPUT', 'PiAPI text-to-video task completed without video URL');
      }
      const local = await this.persistProviderOutput(completed.outputUrl, input.context, 'mp4');
      const costUsd = costUsdFromActualOrEstimate(completed, estimatedCost);
      const durationMs = Date.now() - startedAt;
      await this.logUsage(input.context, input.model, taskId, 'success', costUsd, durationMs, {
        requestPayload,
        responsePayload: providerTaskResponsePayload(createTaskResponse, completed, { localOutputUrl: local.url }),
      });
      return {
        outputUrl: local.url,
        costUsd,
        durationMs,
        meta: {
          piapiTaskId: taskId,
          piapiUrl: completed.outputUrl,
          model: input.model,
          provider: 'piapi',
          aspectRatio: aspectRatio ?? 'auto',
        },
      };
    } catch (err) {
      const durationMs = Date.now() - startedAt;
      await this.logProviderFailure(input.context, input.model, taskId, durationMs, err, completedTask, estimatedCost, requestPayload, createTaskResponse);
      throw err;
    }
  }

  private async publishTextToVideoReferences(model: string, params: Record<string, unknown> | undefined) {
    if (model === 'kling-3-omni') {
      const next: Record<string, unknown> = { ...(params ?? {}) };
      const imageUrls = readStringList(params, 'images').length > 0
        ? readStringList(params, 'images')
        : readStringList(params, 'image_urls');
      const videoUrl = readString(params, 'video') ?? readStringList(params, 'video_urls')[0];
      if (imageUrls.length > 0) {
        next.images = await Promise.all(
          imageUrls.map(async (url) => (await this.publisher.publishImageUrl(url, 1)).publicUrl),
        );
      }
      if (videoUrl) {
        next.video = (await this.publisher.publishFileUrl(videoUrl, 1, contentTypeForUrl(videoUrl, 'video/mp4'))).publicUrl;
      }
      return next;
    }
    if (!model.startsWith('seedance-2')) return params;
    const next: Record<string, unknown> = { ...(params ?? {}) };
    const imageUrls = readStringList(params, 'image_urls');
    const videoUrls = readStringList(params, 'video_urls');
    const audioUrls = readStringList(params, 'audio_urls');
    if (imageUrls.length > 0) {
      next.image_urls = await Promise.all(
        imageUrls.map(async (url) => (await this.publisher.publishImageUrl(url, 1)).publicUrl),
      );
    }
    if (videoUrls.length > 0) {
      next.video_urls = await Promise.all(
        videoUrls.map(async (url) => (await this.publisher.publishFileUrl(url, 1, contentTypeForUrl(url, 'video/mp4'))).publicUrl),
      );
    }
    if (audioUrls.length > 0) {
      next.audio_urls = await Promise.all(
        audioUrls.map(async (url) => (await this.publisher.publishFileUrl(url, 1, contentTypeForUrl(url, 'audio/mpeg'))).publicUrl),
      );
    }
    return next;
  }

  async faceSwapVideo(input: {
    swapImageUrl: string;
    targetVideoUrl: string;
    model: string;
    params?: Record<string, unknown>;
    context: ProviderRunContext;
  }): Promise<ProviderResult> {
    if (input.model !== FACE_SWAP_MODEL) {
      throw new ProviderError('UNSUPPORTED_MODEL', `Unsupported face-swap model: ${input.model}`);
    }
    const frames = readNumber(input.params, 'estimatedFrames')
      ?? (readNumber(input.params, 'duration') ?? DEFAULT_FACE_SWAP_DURATION_SEC) * DEFAULT_FACE_SWAP_FPS;
    const estimatedCost = frames * FACE_SWAP_COST_PER_FRAME_USD;
    await this.ensureCanCall(estimatedCost);

    const startedAt = Date.now();
    let taskId: string | undefined;
    let completedTask: PiAPITaskStatus | undefined;
    let requestPayload: unknown;
    let createTaskResponse: unknown;
    try {
      const published = await this.publisher.publishImageUrl(input.swapImageUrl, 1);
      const publishedTarget = await this.publisher.publishFileUrl(
        input.targetVideoUrl,
        1,
        contentTypeForUrl(input.targetVideoUrl, 'video/mp4'),
      );
      const aspectRatio = await this.resolveTargetVideoAspectRatio(input.targetVideoUrl, input.params);
      const payload = {
        model: 'Qubico/video-toolkit',
        task_type: 'face-swap',
        input: {
          swap_image: published.publicUrl,
          target_video: publishedTarget.publicUrl,
          ...(readString(input.params, 'swap_faces_index') ? { swap_faces_index: readString(input.params, 'swap_faces_index') } : {}),
          ...(readString(input.params, 'target_faces_index') ? { target_faces_index: readString(input.params, 'target_faces_index') } : {}),
        },
      };
      requestPayload = payload;
      const created = await this.createTask(payload, input.context);
      taskId = created.taskId;
      createTaskResponse = created.raw;
      const completed = await this.client.pollUntilDone(taskId, {
        timeoutMs: PIAPI_VIDEO_TIMEOUT_MS,
        expectedDurationMs: 12 * 60 * 1000,
        onProgress: input.context.reportProgress,
      });
      completedTask = completed;
      if (!completed.outputUrl) {
        throw new ProviderError('PIAPI_EMPTY_OUTPUT', 'PiAPI face-swap task completed without video URL');
      }
      const local = await this.persistProviderOutput(completed.outputUrl, input.context, 'mp4');
      const costUsd = costUsdFromActualOrEstimate(completed, estimatedCost);
      const durationMs = Date.now() - startedAt;
      await this.logUsage(input.context, input.model, taskId, 'success', costUsd, durationMs, {
        requestPayload,
        responsePayload: providerTaskResponsePayload(createTaskResponse, completed, { localOutputUrl: local.url }),
      });
      return {
        outputUrl: local.url,
        costUsd,
        durationMs,
        meta: {
          piapiTaskId: taskId,
          piapiUrl: completed.outputUrl,
          model: input.model,
          provider: 'piapi',
          estimatedFrames: frames,
          aspectRatio: aspectRatio ?? 'auto',
        },
      };
    } catch (err) {
      const durationMs = Date.now() - startedAt;
      await this.logProviderFailure(input.context, input.model, taskId, durationMs, err, completedTask, estimatedCost, requestPayload, createTaskResponse);
      throw err;
    }
  }

  async talkingAvatar(input: {
    imageUrl: string;
    audioUrl: string;
    prompt?: string;
    model: string;
    params?: Record<string, unknown>;
    context: ProviderRunContext;
  }): Promise<ProviderResult> {
    const estimatedSeconds = readNumber(input.params, 'estimatedSeconds') ?? TALKING_AVATAR_DEFAULT_SECONDS;
    const estimatedCost = estimatedSeconds * TALKING_AVATAR_COST_PER_SEC_USD;
    await this.ensureCanCall(estimatedCost);

    const startedAt = Date.now();
    let taskId: string | undefined;
    let completedTask: PiAPITaskStatus | undefined;
    let requestPayload: unknown;
    let createTaskResponse: unknown;
    try {
      const publishedImage = await this.publisher.publishImageUrl(input.imageUrl, 1);
      const publishedAudio = await this.publisher.publishFileUrl(
        input.audioUrl,
        1,
        contentTypeForUrl(input.audioUrl, 'audio/mpeg'),
      );
      const payload = buildTalkingAvatarPayload(input.model, {
        imageUrl: publishedImage.publicUrl,
        audioUrl: publishedAudio.publicUrl,
        prompt: input.prompt,
        params: input.params,
      });
      requestPayload = payload;
      const created = await this.createTask(payload, input.context);
      taskId = created.taskId;
      createTaskResponse = created.raw;
      const completed = await this.client.pollUntilDone(taskId, {
        timeoutMs: PIAPI_VIDEO_TIMEOUT_MS,
        expectedDurationMs: 12 * 60 * 1000,
        onProgress: input.context.reportProgress,
      });
      completedTask = completed;
      if (!completed.outputUrl) {
        throw new ProviderError('PIAPI_EMPTY_OUTPUT', 'PiAPI talking-avatar task completed without video URL');
      }
      const local = await this.persistProviderOutput(completed.outputUrl, input.context, 'mp4');
      const costUsd = costUsdFromActualOrEstimate(completed, estimatedCost);
      const durationMs = Date.now() - startedAt;
      await this.logUsage(input.context, input.model, taskId, 'success', costUsd, durationMs, {
        requestPayload,
        responsePayload: providerTaskResponsePayload(createTaskResponse, completed, { localOutputUrl: local.url }),
      });
      return {
        outputUrl: local.url,
        costUsd,
        durationMs,
        meta: { piapiTaskId: taskId, piapiUrl: completed.outputUrl, model: input.model, provider: 'piapi' },
      };
    } catch (err) {
      const durationMs = Date.now() - startedAt;
      await this.logProviderFailure(input.context, input.model, taskId, durationMs, err, completedTask, estimatedCost, requestPayload, createTaskResponse);
      throw err;
    }
  }

  async videoEffect(input: {
    imageUrl: string;
    effectId?: string;
    prompt?: string;
    durationSec: number;
    model: string;
    params?: Record<string, unknown>;
    context: ProviderRunContext;
  }): Promise<ProviderResult> {
    const modelConfig = VIDEO_EFFECT_MODELS[input.model];
    if (!modelConfig) {
      throw new ProviderError('UNSUPPORTED_MODEL', `Unsupported video-effect model: ${input.model}`);
    }
    const estimatedCost = modelConfig.estimatedCostUsd;
    await this.ensureCanCall(estimatedCost);

    const startedAt = Date.now();
    let taskId: string | undefined;
    let completedTask: PiAPITaskStatus | undefined;
    let requestPayload: unknown;
    let createTaskResponse: unknown;
    try {
      const published = await this.publisher.publishImageUrl(input.imageUrl, 1);
      const aspectRatio = normalizeAspectRatio(readString(input.params, 'aspect_ratio'));
      const payload = {
        model: modelConfig.providerModel,
        task_type: modelConfig.taskType,
        input: {
          image_url: published.publicUrl,
          ...(input.effectId ? { effect: input.effectId } : {}),
          ...(input.prompt ? { prompt: input.prompt } : {}),
          duration: input.durationSec,
          ...(aspectRatio && aspectRatio !== 'auto' ? { aspect_ratio: aspectRatio } : {}),
        },
      };
      requestPayload = payload;
      const created = await this.createTask(payload, input.context);
      taskId = created.taskId;
      createTaskResponse = created.raw;
      const completed = await this.client.pollUntilDone(taskId, {
        timeoutMs: PIAPI_VIDEO_TIMEOUT_MS,
        expectedDurationMs: 8 * 60 * 1000,
        onProgress: input.context.reportProgress,
      });
      completedTask = completed;
      if (!completed.outputUrl) {
        throw new ProviderError('PIAPI_EMPTY_OUTPUT', 'PiAPI video-effect task completed without video URL');
      }
      const local = await this.persistProviderOutput(completed.outputUrl, input.context, 'mp4');
      const costUsd = costUsdFromActualOrEstimate(completed, estimatedCost);
      const durationMs = Date.now() - startedAt;
      await this.logUsage(input.context, input.model, taskId, 'success', costUsd, durationMs, {
        requestPayload,
        responsePayload: providerTaskResponsePayload(createTaskResponse, completed, { localOutputUrl: local.url }),
      });
      return {
        outputUrl: local.url,
        costUsd,
        durationMs,
        meta: {
          piapiTaskId: taskId,
          piapiUrl: completed.outputUrl,
          model: input.model,
          provider: 'piapi',
          effectId: input.effectId,
          aspectRatio: aspectRatio ?? 'auto',
        },
      };
    } catch (err) {
      const durationMs = Date.now() - startedAt;
      await this.logProviderFailure(input.context, input.model, taskId, durationMs, err, completedTask, estimatedCost, requestPayload, createTaskResponse);
      throw err;
    }
  }

  async removeWatermark(input: {
    videoUrl: string;
    durationSec?: number;
    model: string;
    params?: Record<string, unknown>;
    context: ProviderRunContext;
  }): Promise<ProviderResult> {
    if (input.model !== 'remove-watermark') {
      throw new ProviderError('UNSUPPORTED_MODEL', `Unsupported watermark model: ${input.model}`);
    }
    const seconds = Math.max(5, Math.ceil(input.durationSec ?? readNumber(input.params, 'duration') ?? 5));
    const estimatedCost = seconds * WATERMARK_COST_PER_SEC_USD;
    await this.ensureCanCall(estimatedCost);

    const startedAt = Date.now();
    let taskId: string | undefined;
    let completedTask: PiAPITaskStatus | undefined;
    let requestPayload: unknown;
    let createTaskResponse: unknown;
    try {
      const payload = buildWatermarkPayload(input.videoUrl, input.durationSec);
      requestPayload = payload;
      const created = await this.createTask(payload, input.context);
      taskId = created.taskId;
      createTaskResponse = created.raw;
      const completed = await this.client.pollUntilDone(taskId, {
        timeoutMs: PIAPI_VIDEO_TIMEOUT_MS,
        expectedDurationMs: 5 * 60 * 1000,
        onProgress: input.context.reportProgress,
      });
      completedTask = completed;
      if (!completed.outputUrl) {
        throw new ProviderError('PIAPI_EMPTY_OUTPUT', 'PiAPI watermark task completed without video URL');
      }
      const local = await this.persistProviderOutput(completed.outputUrl, input.context, 'mp4');
      const costUsd = costUsdFromActualOrEstimate(completed, estimatedCost);
      const durationMs = Date.now() - startedAt;
      await this.logUsage(input.context, input.model, taskId, 'success', costUsd, durationMs, {
        requestPayload,
        responsePayload: providerTaskResponsePayload(createTaskResponse, completed, { localOutputUrl: local.url }),
      });
      return {
        outputUrl: local.url,
        costUsd,
        durationMs,
        meta: {
          piapiTaskId: taskId,
          piapiUrl: completed.outputUrl,
          model: input.model,
          provider: 'piapi',
        },
      };
    } catch (err) {
      const durationMs = Date.now() - startedAt;
      await this.logProviderFailure(input.context, input.model, taskId, durationMs, err, completedTask, estimatedCost, requestPayload, createTaskResponse);
      throw err;
    }
  }

  async videoUpscale(input: {
    videoUrl: string;
    durationSec?: number;
    model: string;
    params?: Record<string, unknown>;
    context: ProviderRunContext;
  }): Promise<ProviderResult> {
    if (input.model !== VIDEO_UPSCALE_MODEL) {
      throw new ProviderError('UNSUPPORTED_MODEL', `Unsupported video-upscale model: ${input.model}`);
    }
    const duration = input.durationSec ?? readNumber(input.params, 'duration') ?? 15;
    const frameEstimate = readNumber(input.params, 'estimatedFrames')
      ?? Math.ceil(duration * VIDEO_UPSCALE_ESTIMATE_FPS);
    const frames = Math.min(VIDEO_UPSCALE_MAX_FRAMES, Math.max(10, Math.ceil(frameEstimate)));
    const estimatedCost = frames * VIDEO_UPSCALE_COST_PER_FRAME_USD;
    await this.ensureCanCall(estimatedCost);

    const startedAt = Date.now();
    let taskId: string | undefined;
    let completedTask: PiAPITaskStatus | undefined;
    let requestPayload: unknown;
    let createTaskResponse: unknown;
    try {
      const published = await this.publisher.publishFileUrl(
        input.videoUrl,
        1,
        contentTypeForUrl(input.videoUrl, 'video/mp4'),
      );
      const payload = buildVideoUpscalePayload(published.publicUrl);
      requestPayload = payload;
      const created = await this.createTask(payload, input.context);
      taskId = created.taskId;
      createTaskResponse = created.raw;
      const completed = await this.client.pollUntilDone(taskId, {
        timeoutMs: PIAPI_VIDEO_TIMEOUT_MS,
        expectedDurationMs: 8 * 60 * 1000,
        onProgress: input.context.reportProgress,
      });
      completedTask = completed;
      if (!completed.outputUrl) {
        throw new ProviderError('PIAPI_EMPTY_OUTPUT', 'PiAPI video-upscale task completed without video URL');
      }
      const postprocessSettings = videoUpscalePostprocessSettings(input.params);
      const local = await this.persistVideoUpscaleOutput(completed.outputUrl, input.context, postprocessSettings);
      const costUsd = costUsdFromActualOrEstimate(completed, estimatedCost);
      const durationMs = Date.now() - startedAt;
      await this.logUsage(input.context, input.model, taskId, 'success', costUsd, durationMs, {
        requestPayload,
        responsePayload: providerTaskResponsePayload(createTaskResponse, completed, {
          localOutputUrl: local.url,
          postprocess: local.postprocess,
        }),
      });
      return {
        outputUrl: local.url,
        costUsd,
        durationMs,
        meta: {
          piapiTaskId: taskId,
          piapiUrl: completed.outputUrl,
          model: input.model,
          provider: 'piapi',
          estimatedFrames: frames,
          scale: '2x',
          postprocess: local.postprocess,
        },
      };
    } catch (err) {
      const durationMs = Date.now() - startedAt;
      await this.logProviderFailure(input.context, input.model, taskId, durationMs, err, completedTask, estimatedCost, requestPayload, createTaskResponse);
      throw err;
    }
  }

  async motionTransfer(input: {
    inputImageUrl: string;
    drivingVideoUrl?: string;
    prompt?: string;
    durationSec: number;
    model: string;
    params?: Record<string, unknown>;
    context: ProviderRunContext;
  }): Promise<ProviderResult> {
    if (!MOTION_TRANSFER_MODELS.has(input.model)) {
      throw new ProviderError('UNSUPPORTED_MODEL', `Unsupported motion-transfer model: ${input.model}`);
    }
    const estimatedCost = estimatedCostForModel(input.model, {
      ...(input.params ?? {}),
      duration: input.durationSec,
    }, 0);
    await this.ensureCanCall(estimatedCost);

    const startedAt = Date.now();
    let taskId: string | undefined;
    let completedTask: PiAPITaskStatus | undefined;
    let requestPayload: unknown;
    let createTaskResponse: unknown;
    try {
      const publishedImage = await this.publisher.publishImageUrl(input.inputImageUrl, 1);
      const publishedDrivingVideo = input.drivingVideoUrl
        ? await this.publisher.publishFileUrl(input.drivingVideoUrl, 1, contentTypeForUrl(input.drivingVideoUrl, 'video/mp4'))
        : undefined;
      const aspectRatio = await this.resolveImageAspectRatio(input.inputImageUrl, input.params);
      const isV3 = input.model.includes('3.0');
      const isPro = input.model.endsWith('-pro');
      const presetMotion = readString(input.params, 'preset_motion');
      if (!input.drivingVideoUrl && !presetMotion) {
        throw new ProviderError('MOTION_REFERENCE_REQUIRED', 'PiAPI motion-transfer requires video_url or preset_motion');
      }
      const payload = {
        model: 'kling',
        task_type: 'motion_control',
        input: {
          image_url: publishedImage.publicUrl,
          ...(publishedDrivingVideo ? { video_url: publishedDrivingVideo.publicUrl } : {}),
          ...(presetMotion ? { preset_motion: presetMotion } : {}),
          prompt: input.prompt ?? '',
          duration: input.durationSec,
          mode: isPro ? 'pro' : 'std',
          ...(readString(input.params, 'motion_direction') ? { motion_direction: readString(input.params, 'motion_direction') } : {}),
          ...(isV3 ? { version: '3.0' } : {}),
          ...(readString(input.params, 'resolution') ? { resolution: readString(input.params, 'resolution') } : {}),
          ...(readBoolean(input.params, 'keep_original_sound') !== undefined ? { keep_original_sound: readBoolean(input.params, 'keep_original_sound') } : {}),
          ...(aspectRatio ? { aspect_ratio: aspectRatio } : {}),
        },
      };
      requestPayload = payload;
      const created = await this.createTask(payload, input.context);
      taskId = created.taskId;
      createTaskResponse = created.raw;
      const completed = await this.client.pollUntilDone(taskId, {
        timeoutMs: PIAPI_VIDEO_TIMEOUT_MS,
        expectedDurationMs: 12 * 60 * 1000,
        onProgress: input.context.reportProgress,
      });
      completedTask = completed;
      if (!completed.outputUrl) {
        throw new ProviderError('PIAPI_EMPTY_OUTPUT', 'PiAPI motion-transfer task completed without video URL');
      }
      const local = await this.persistProviderOutput(completed.outputUrl, input.context, 'mp4');
      const costUsd = costUsdFromActualOrEstimate(completed, estimatedCost);
      const durationMs = Date.now() - startedAt;
      await this.logUsage(input.context, input.model, taskId, 'success', costUsd, durationMs, {
        requestPayload,
        responsePayload: providerTaskResponsePayload(createTaskResponse, completed, { localOutputUrl: local.url }),
      });
      return {
        outputUrl: local.url,
        costUsd,
        durationMs,
        meta: {
          piapiTaskId: taskId,
          piapiUrl: completed.outputUrl,
          model: input.model,
          provider: 'piapi',
          aspectRatio: aspectRatio ?? 'auto',
        },
      };
    } catch (err) {
      const durationMs = Date.now() - startedAt;
      await this.logProviderFailure(input.context, input.model, taskId, durationMs, err, completedTask, estimatedCost, requestPayload, createTaskResponse);
      throw err;
    }
  }

  private async ensureCanCall(_nextCostUsd: number) {
    // Daily cap and low-balance checks intentionally disabled: usage limits are not enforced.
    // Provider availability is verified by PiAPI itself; account balance is observability-only.
  }

  private async refreshBalance() {
    const account = await this.client.getAccountInfo();
    this.lowBalance = account.equivalentUsd < this.balanceMinUsd;
    const message = `[piapi] Account balance: $${account.equivalentUsd.toFixed(2)}`;
    if (this.lowBalance) {
      this.logger.warn(`${message}; below minimum $${this.balanceMinUsd.toFixed(2)}`);
      return;
    }
    this.logger.info(message);
  }

  private async recoverGptImageFromHistory(params: {
    context: ProviderRunContext;
    model: string;
    prompt: string;
    startedAt: number;
    estimatedCost: number;
    outputFormat: 'jpeg' | 'png' | 'webp';
    size: string;
    quality: string;
    originalError: unknown;
    requestPayload?: unknown;
  }): Promise<ProviderResult | undefined> {
    const recoveryMs = gptImageHistoryRecoveryMs();
    if (recoveryMs <= 0) return undefined;

    const startedAtSec = Math.max(0, Math.floor((params.startedAt - 60_000) / 1000));
    const deadline = Date.now() + recoveryMs;
    let delayMs = 0;

    this.logger.warn('[piapi] GPT Image response lost; trying history recovery', {
      projectId: params.context.projectId,
      model: params.model,
      error: (params.originalError as Error).message,
    });

    while (Date.now() <= deadline) {
      if (delayMs > 0) {
        await delay(Math.min(delayMs, Math.max(0, deadline - Date.now())));
      }
      await params.context.reportProgress?.(95);

      const task = await this.findGptImageHistoryTask({
        model: params.model,
        prompt: params.prompt,
        startedAtSec,
      }).catch((err) => {
        this.logger.warn('[piapi] GPT Image history lookup failed', err);
        return undefined;
      });

      if (task?.outputUrl) {
        const outputExt = params.outputFormat === 'jpeg' ? 'jpg' : params.outputFormat;
        const local = await this.persistProviderOutput(task.outputUrl, params.context, outputExt);
        const durationMs = Date.now() - params.startedAt;
        await this.logUsage(params.context, params.model, task.taskId, 'success', params.estimatedCost, durationMs, {
          recoverableOutputUrl: task.outputUrl,
          requestPayload: params.requestPayload,
          responsePayload: {
            historyTask: task,
            localOutputUrl: local.url,
            recoveredFromOriginalError: errorPayload(params.originalError),
          },
        });
        return {
          outputUrl: local.url,
          costUsd: params.estimatedCost,
          durationMs,
          meta: {
            model: params.model,
            provider: 'piapi',
            recovered: true,
            piapiTaskId: task.taskId,
            piapiUrl: task.outputUrl,
            size: params.size,
            quality: params.quality,
            outputFormat: params.outputFormat,
          },
        };
      }

      delayMs = delayMs === 0 ? 10_000 : Math.min(30_000, Math.round(delayMs * 1.5));
    }

    return undefined;
  }

  private async findGptImageHistoryTask(params: {
    model: string;
    prompt: string;
    startedAtSec: number;
  }): Promise<PiAPIHistoryTask | undefined> {
    const endTimeSec = Math.ceil((Date.now() + 60_000) / 1000);
    const fetched: Array<PiAPIHistoryTask & { historyFilter?: string }> = [];

    for (const modelFilter of ['gpts', undefined]) {
      try {
        const history = await this.client.getUserTaskHistory({
          page: 1,
          pageSize: 50,
          model: modelFilter,
          startTimeSec: params.startedAtSec,
          endTimeSec,
        });
        fetched.push(...history.tasks.map((task) => ({ ...task, historyFilter: modelFilter ?? 'all' })));
      } catch (err) {
        this.logger.warn(`[piapi] GPT Image history lookup failed for filter=${modelFilter ?? 'all'}`, err);
      }
    }

    const unique = uniqueHistoryTasks(fetched)
      .filter((task) => task.status === 'completed' && task.outputUrl)
      .filter((task) => isGptImageHistoryCandidate(task, params.model, params.startedAtSec));

    const promptMatches = unique
      .filter((task) => normalisePrompt(historyPrompt(task)) === normalisePrompt(params.prompt))
      .sort(sortHistoryNewestFirst);
    if (promptMatches[0]) return promptMatches[0];

    // Concurrency 1 -> at most one gpt-image task in this window; if the (often truncated) prompt
    // did not match, return the newest completed candidate in the window rather than giving up.
    return unique.slice().sort(sortHistoryNewestFirst)[0];
  }

  // Returns the bytes of a reference image. For our own /static URLs it reads the file directly from
  // the shared local uploads volume (the worker cannot reliably fetch its own public domain from inside
  // the container). For external URLs it HTTP-downloads as before.
  private async readImageRefBytes(url: string): Promise<{ buffer: Buffer; contentType: string }> {
    const raw = await this.readRawImageRefBytes(url);
    return normalizeGptImageReference(raw, this.logger);
  }

  private async readRawImageRefBytes(url: string): Promise<{ buffer: Buffer; contentType: string }> {
    const key = localStaticKey(url);
    if (key) {
      try {
        const rootDir = resolveWorkspacePath(process.env.UPLOADS_DIR ?? './uploads');
        const target = path.resolve(rootDir, key);
        if (target === rootDir || target.startsWith(rootDir + path.sep)) {
          const buffer = await fs.readFile(target);
          return { buffer, contentType: imageContentTypeForPath(target) };
        }
      } catch (err) {
        this.logger.warn('[piapi] local read of gpt-image reference failed; falling back to HTTP download', err);
      }
    }
    return this.client.download(url);
  }

  private async persistProviderOutput(
    providerUrl: string,
    context: ProviderRunContext,
    fallbackExt: string,
  ) {
    const downloaded = await this.client.download(providerUrl);
    const ext = extFor(downloaded.contentType, providerUrl, fallbackExt);
    const key = `outputs/${context.userId ?? 'unknown'}/${context.projectId}/${context.stepId}/result.${ext}`;
    return this.storage.upload({
      key,
      body: downloaded.buffer,
      contentType: downloaded.contentType,
    });
  }

  private async persistVideoUpscaleOutput(
    providerUrl: string,
    context: ProviderRunContext,
    settings: VideoUpscalePostprocessSettings,
  ): Promise<PersistedVideoOutput> {
    if (!settings.enabled) {
      const raw = await this.persistProviderOutput(providerUrl, context, 'mp4');
      return {
        ...raw,
        postprocess: { enabled: false, applied: false, profile: settings.profile, sharpness: settings.sharpness, contrast: settings.contrast, clarity: settings.clarity },
      };
    }

    const filter = videoUpscalePostprocessFilter(settings);
    try {
      const processed = await this.postProcessAndPersistVideo(providerUrl, context, filter);
      return {
        ...processed,
        postprocess: {
          enabled: true,
          applied: true,
          profile: settings.profile,
          sharpness: settings.sharpness,
          contrast: settings.contrast,
          clarity: settings.clarity,
          filter,
        },
      };
    } catch (err) {
      this.logger.warn('[piapi] video upscale postprocess failed; returning raw upscaled output', err);
      const raw = await this.persistProviderOutput(providerUrl, context, 'mp4');
      return {
        ...raw,
        postprocess: {
          enabled: true,
          applied: false,
          profile: settings.profile,
          sharpness: settings.sharpness,
          contrast: settings.contrast,
          clarity: settings.clarity,
          filter,
          fallbackReason: (err as Error).message,
        },
      };
    }
  }

  private async postProcessAndPersistVideo(
    providerUrl: string,
    context: ProviderRunContext,
    filter: string,
  ): Promise<{ url: string; key: string }> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'allvision-video-upscale-'));
    const inputPath = path.join(dir, 'upscaled-source.mp4');
    const outputPath = path.join(dir, 'enhanced-output.mp4');
    try {
      await downloadUrlToFile(providerUrl, inputPath);
      await runFfmpeg([
        '-y',
        '-i',
        inputPath,
        '-map',
        '0:v:0',
        '-map',
        '0:a?',
        '-vf',
        filter,
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '18',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'copy',
        '-movflags',
        '+faststart',
        outputPath,
      ], VIDEO_UPSCALE_POSTPROCESS_TIMEOUT_MS);

      const key = `outputs/${context.userId ?? 'unknown'}/${context.projectId}/${context.stepId}/result.mp4`;
      return this.storage.upload({
        key,
        body: createReadStream(outputPath),
        contentType: 'video/mp4',
      });
    } finally {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private async resolveImageAspectRatio(imageUrl: string, params: Record<string, unknown> | undefined) {
    const requested = normalizeAspectRatio(readString(params, 'aspect_ratio'));
    if (requested && requested !== 'auto') return requested;

    try {
      const downloaded = await this.client.download(imageUrl);
      const metadata = await sharp(downloaded.buffer).metadata();
      if (metadata.width && metadata.height) {
        return aspectRatioFromDimensions(metadata.width, metadata.height);
      }
    } catch (err) {
      this.logger.warn('[piapi] Failed to probe image aspect ratio; Kling request will omit aspect_ratio', err);
    }
    return undefined;
  }

  private async resolveTargetVideoAspectRatio(videoUrl: string, params: Record<string, unknown> | undefined) {
    const requested = normalizeAspectRatio(readString(params, 'aspect_ratio'));
    if (requested && requested !== 'auto') return requested;

    try {
      const dimensions = await ffprobeVideoDimensions(videoUrl);
      if (dimensions) return aspectRatioFromDimensions(dimensions.width, dimensions.height);
    } catch (err) {
      this.logger.warn('[piapi] Failed to probe target video aspect ratio; Qubico will rely on target_video defaults', err);
    }
    return undefined;
  }

  private async logUsage(
    context: ProviderRunContext,
    model: string,
    taskId: string | undefined,
    status: 'success' | 'failed' | 'timeout' | 'timeout_charged' | 'timeout_pending',
    costUsd: number,
    durationMs: number,
    details: {
      error?: unknown;
      recoverableOutputUrl?: string;
      requestPayload?: unknown;
      responsePayload?: unknown;
    } = {},
  ) {
    await createAIUsageLog({
      projectId: context.projectId,
      userId: context.userId,
      blockSlug: context.blockSlug,
      provider: 'piapi',
      model,
      taskId,
      status,
      costUsd,
      durationMs,
      errorCode: details.error instanceof ProviderError ? details.error.code : undefined,
      errorMessage: details.error ? (details.error as Error).message : undefined,
      recoverableOutputUrl: details.recoverableOutputUrl,
      requestPayload: details.requestPayload,
      responsePayload: details.responsePayload,
    }).catch((err) => {
      this.logger.warn('[piapi] Failed to write AIUsageLog', err);
    });
  }

  private async logProviderFailure(
    context: ProviderRunContext,
    model: string,
    taskId: string | undefined,
    durationMs: number,
    error: unknown,
    completedTask?: PiAPITaskStatus,
    estimatedCost?: number,
    requestPayload?: unknown,
    createTaskResponse?: unknown,
  ) {
    if (completedTask?.status === 'completed') {
      await this.logUsage(
        context,
        model,
        taskId,
        'failed',
        costUsdFromActualOrEstimate(completedTask, estimatedCost ?? 0),
        durationMs,
        {
          error,
          recoverableOutputUrl: completedTask.outputUrl,
          requestPayload,
          responsePayload: providerTaskResponsePayload(createTaskResponse, completedTask),
        },
      );
      return;
    }

    if (error instanceof ProviderError && error.code === 'PIAPI_SYNC_PENDING') {
      await this.logUsage(context, model, taskId, 'timeout_pending', 0, durationMs, {
        error,
        requestPayload,
        responsePayload: providerErrorResponsePayload(createTaskResponse, error),
      });
      return;
    }

    if (!(error instanceof ProviderError) || error.code !== 'PIAPI_TIMEOUT') {
      await this.logUsage(context, model, taskId, 'failed', 0, durationMs, {
        error,
        requestPayload,
        responsePayload: providerErrorResponsePayload(createTaskResponse, error, completedTask),
      });
      return;
    }

    if (!taskId) {
      await this.logUsage(context, model, taskId, 'timeout', 0, durationMs, {
        error,
        requestPayload,
        responsePayload: providerErrorResponsePayload(createTaskResponse, error),
      });
      return;
    }

    let latest: PiAPITaskStatus;
    try {
      latest = await this.client.getTask(taskId);
    } catch (finalCheckError) {
      this.logger.warn(`[piapi] Final timeout getTask failed for taskId=${taskId}`, finalCheckError);
      await this.logUsage(context, model, taskId, 'timeout_pending', 0, durationMs, {
        error,
        requestPayload,
        responsePayload: providerErrorResponsePayload(createTaskResponse, error, undefined, finalCheckError),
      });
      return;
    }

    if (latest.status === 'completed') {
      await this.logUsage(
        context,
        model,
        taskId,
        'timeout_charged',
        costUsdFromActualOrEstimate(latest, estimatedCost ?? 0),
        durationMs,
        {
          error,
          recoverableOutputUrl: latest.outputUrl,
          requestPayload,
          responsePayload: providerTaskResponsePayload(createTaskResponse, latest),
        },
      );
      return;
    }

    if (latest.status === 'failed') {
      const taskError = new ProviderError(
        latest.errorCode ?? error.code,
        latest.errorMessage ?? error.message,
      );
      await this.logUsage(context, model, taskId, 'timeout', 0, durationMs, {
        error: taskError,
        requestPayload,
        responsePayload: providerTaskResponsePayload(createTaskResponse, latest),
      });
      return;
    }

    await this.logUsage(context, model, taskId, 'timeout_pending', 0, durationMs, {
      error,
      requestPayload,
      responsePayload: providerTaskResponsePayload(createTaskResponse, latest),
    });
  }
}

function providerTaskResponsePayload(createTaskResponse: unknown, task: PiAPITaskStatus, extra?: Record<string, unknown>) {
  return {
    createTask: createTaskResponse,
    finalTask: {
      taskId: task.taskId,
      status: task.status,
      progress: task.progress,
      outputUrl: task.outputUrl,
      actualCostUsd: task.actualCostUsd,
      errorCode: task.errorCode,
      errorMessage: task.errorMessage,
      raw: task.raw,
    },
    ...(extra ?? {}),
  };
}

function providerErrorResponsePayload(
  createTaskResponse: unknown,
  error: unknown,
  task?: PiAPITaskStatus,
  finalCheckError?: unknown,
) {
  return {
    createTask: createTaskResponse,
    ...(task ? { finalTask: providerTaskResponsePayload(undefined, task).finalTask } : {}),
    error: errorPayload(error),
    ...(finalCheckError ? { finalCheckError: errorPayload(finalCheckError) } : {}),
  };
}

function errorPayload(error: unknown) {
  if (error instanceof ProviderError) {
    return {
      name: error.name,
      code: error.code,
      status: error.status,
      message: error.message,
      stack: error.stack,
    };
  }
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  return { message: String(error) };
}

async function downloadUrlToFile(url: string, targetPath: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new ProviderError('VIDEO_POSTPROCESS_DOWNLOAD_FAILED', `Failed to download video for postprocess: ${response.status}`);
  }
  await pipeline(Readable.fromWeb(response.body as never), createWriteStream(targetPath));
}

function runFfmpeg(args: string[], timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', args, { windowsHide: true });
    const stderr: Buffer[] = [];
    let settled = false;
    let timedOut = false;

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve();
    };

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    child.stderr.on('data', (chunk) => stderr.push(Buffer.from(chunk)));
    child.on('error', (error) => finish(error));
    child.on('close', (code) => {
      if (timedOut) {
        finish(new ProviderError('VIDEO_POSTPROCESS_TIMEOUT', `ffmpeg postprocess timed out after ${timeoutMs}ms`));
        return;
      }
      if (code === 0) {
        finish();
        return;
      }
      const details = Buffer.concat(stderr).toString('utf8').slice(-2000);
      finish(new ProviderError('VIDEO_POSTPROCESS_FAILED', `ffmpeg postprocess exited with code ${code}: ${details}`));
    });
  });
}

function videoUpscalePostprocessSettings(params: Record<string, unknown> | undefined): VideoUpscalePostprocessSettings {
  const explicitEnabled = readBoolean(params, 'postprocess');
  const rawProfile = readString(params, 'postprocess_profile');
  const profile = rawProfile === 'natural' || rawProfile === 'strong' || rawProfile === 'max' || rawProfile === 'custom' || rawProfile === 'off'
    ? rawProfile
    : 'strong';

  if (explicitEnabled === false || profile === 'off') {
    return { enabled: false, profile: 'off', sharpness: 0, contrast: 0, clarity: 0 };
  }

  const defaults: Record<Exclude<VideoUpscalePostprocessSettings['profile'], 'off'>, Omit<VideoUpscalePostprocessSettings, 'enabled' | 'profile'>> = {
    natural: { sharpness: 60, contrast: 10, clarity: 50 },
    strong: { sharpness: 100, contrast: 20, clarity: 100 },
    max: { sharpness: 100, contrast: 25, clarity: 100 },
    custom: { sharpness: 100, contrast: 20, clarity: 100 },
  };
  const activeProfile = profile as Exclude<VideoUpscalePostprocessSettings['profile'], 'off'>;
  const base = defaults[activeProfile];

  return {
    enabled: explicitEnabled ?? true,
    profile: activeProfile,
    sharpness: clamp(readNumber(params, 'sharpness') ?? base.sharpness, 0, 100),
    contrast: clamp(readNumber(params, 'contrast') ?? base.contrast, 0, 50),
    clarity: clamp(readNumber(params, 'clarity') ?? base.clarity, 0, 100),
  };
}

function videoUpscalePostprocessFilter(settings: VideoUpscalePostprocessSettings): string {
  const contrast = roundFilterNumber(1 + settings.contrast / 100);
  const saturation = roundFilterNumber(1 + Math.min(settings.contrast, 25) / 500);
  const lumaAmount = roundFilterNumber(0.2 + (settings.sharpness / 100) * 0.8);
  const chromaAmount = roundFilterNumber((settings.clarity / 100) * 0.45);
  return `eq=contrast=${contrast}:saturation=${saturation},unsharp=7:7:${lumaAmount}:3:3:${chromaAmount}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function roundFilterNumber(value: number) {
  return Number(value.toFixed(2)).toString();
}

function readNumber(source: Record<string, unknown> | undefined, key: string): number | undefined {
  const value = source?.[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

function readString(source: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = source?.[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readBoolean(source: Record<string, unknown> | undefined, key: string): boolean | undefined {
  const value = source?.[key];
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

function uniqueImageReferenceUrls(values: Array<string | undefined>) {
  const seen = new Set<string>();
  const refs: string[] = [];
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const url = value.trim();
    if (!url) continue;
    const key = imageReferenceDedupeKey(url);
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push(url);
  }
  return refs;
}

function limitImageReferences(refs: string[], maxInputImages: number | undefined, model: string, logger: Logger) {
  if (!maxInputImages || refs.length <= maxInputImages) return refs;
  logger.warn(
    `[piapi] image-edit ${model}: ${refs.length} image references exceed the provider limit of ${maxInputImages}; sending the first ${maxInputImages}`,
  );
  return refs.slice(0, maxInputImages);
}

function imageReferenceDedupeKey(value: string) {
  const localKey = localStaticKey(value);
  if (localKey) return `static:${localKey}`;
  try {
    const url = new URL(value);
    url.hash = '';
    if (url.pathname.startsWith('/static/')) {
      return `static:${decodeURIComponent(url.pathname.slice('/static/'.length))}`;
    }
    return url.toString();
  } catch {
    return value.trim();
  }
}

function gptImageHistoryRecoveryMs() {
  const value = Number(process.env.PIAPI_GPT_IMAGE_HISTORY_RECOVERY_MS);
  return Number.isFinite(value) ? value : PIAPI_GPT_IMAGE_HISTORY_RECOVERY_MS;
}

function isRecoverableGptImageTransportError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof ProviderError) {
    // Все попытки оборвались до первого байта ответа: запрос не дошёл до PiAPI, задача
    // не создана и в history никогда не появится. Recovery бессмысленен — пусть проект
    // сразу честно упадёт с refund, а не висит 15 минут на 95% до SYNC_LOST.
    if (error.meta?.neverReachedProvider === true) return false;
    return error.code === 'PIAPI_TIMEOUT'
      || error.code === 'PIAPI_NETWORK_ERROR'
      || (typeof error.status === 'number' && error.status >= 520 && error.status <= 524)
      || /ECONNRESET|socket hang up|EPIPE|ETIMEDOUT|ECONNREFUSED/i.test(message);
  }
  return /ECONNRESET|socket hang up|EPIPE|ETIMEDOUT|ECONNREFUSED|timed out/i.test(message);
}

function uniqueHistoryTasks<T extends PiAPIHistoryTask>(tasks: T[]): T[] {
  const seen = new Set<string>();
  return tasks.filter((task) => {
    const key = task.taskId ?? task.outputUrl;
    if (!key) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isGptImageHistoryCandidate(task: PiAPIHistoryTask, expectedModel: string, startedAtSec: number) {
  if (task.createdAt && Math.floor(task.createdAt.getTime() / 1000) < startedAtSec) return false;
  if (task.outputUrl && /\.(mp4|mov|webm)(?:$|\?)/i.test(task.outputUrl)) return false;

  const modelText = [
    task.model,
    task.taskType,
    readNestedString(task.input, ['model']),
    readNestedString(task.raw, ['model']),
    readNestedString(task.raw, ['data', 'model']),
    readNestedString(task.raw, ['input', 'model']),
  ].filter(Boolean).join(' ').toLowerCase();

  if (!modelText) return true;
  return modelText.includes(expectedModel.toLowerCase()) || modelText.includes('gpt');
}

function historyPrompt(task: PiAPIHistoryTask): string | undefined {
  return readNestedString(task.input, ['prompt'])
    ?? readNestedString(task.raw, ['prompt'])
    ?? readNestedString(task.raw, ['input', 'prompt'])
    ?? readNestedString(task.raw, ['request', 'prompt'])
    ?? readNestedString(task.raw, ['request', 'input', 'prompt'])
    ?? readNestedString(task.raw, ['data', 'input', 'prompt']);
}

function normalisePrompt(value: string | undefined) {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function sortHistoryNewestFirst(a: PiAPIHistoryTask, b: PiAPIHistoryTask) {
  return (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0);
}

function readNestedString(source: Record<string, unknown> | undefined, pathParts: string[]): string | undefined {
  const value = pathParts.reduce<unknown>((current, part) => {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined;
    return (current as Record<string, unknown>)[part];
  }, source);
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function normalizeAspectRatio(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (value === 'auto' || value === 'input') return 'auto';
  return SUPPORTED_ASPECT_RATIOS.has(value) ? value : undefined;
}

function gptImageSizeForAspect(aspect: string | undefined) {
  const sizeByAspect: Record<string, string> = {
    '1:1': '1024x1024',
    '9:16': '1024x1536',
    '3:4': '1024x1536',
    '9:21': '1024x1536',
    '16:9': '1536x1024',
    '4:3': '1536x1024',
    '21:9': '1536x1024',
  };
  return sizeByAspect[aspect ?? ''] ?? '1024x1024';
}

function normalizeGptImageOutputFormat(value: string | undefined): 'jpeg' | 'png' | 'webp' {
  if (value === 'png' || value === 'webp') return value;
  return 'jpeg';
}

// Maps our own public "/static/<key>" URL to the storage key so the worker can read the file locally.
function localStaticKey(url: string): string | null {
  const marker = '/static/';
  const index = url.indexOf(marker);
  if (index === -1) return null;
  const key = decodeURIComponent(url.slice(index + marker.length).replace(/^\/+/, ''));
  if (!key || key.includes('..')) return null;
  return key;
}

function imageContentTypeForPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  return 'image/jpeg';
}

// Downscale + re-encode a gpt-image reference so the multipart upload body stays small.
// Raw user uploads (big PNG/JPG) otherwise make the VM->PiAPI upload connection drop (ECONNRESET).
// On any sharp failure we fall back to the original bytes rather than failing the generation.
async function normalizeGptImageReference(
  raw: { buffer: Buffer; contentType: string },
  logger: Logger,
): Promise<{ buffer: Buffer; contentType: string }> {
  let best: { buffer: Buffer; contentType: string } | undefined;
  try {
    for (const variant of GPT_IMAGE_REF_VARIANTS) {
      const buffer = await sharp(raw.buffer)
        .rotate()
        .resize({
          width: variant.px,
          height: variant.px,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({ quality: variant.quality })
        .toBuffer();
      if (!best || buffer.length < best.buffer.length) {
        best = { buffer, contentType: 'image/jpeg' };
      }
      if (buffer.length <= GPT_IMAGE_REF_TARGET_BYTES) break;
    }
  } catch (err) {
    logger.warn('[piapi] gpt-image reference normalization failed; falling back to original bytes', err);
  }

  // Already small (e.g. a tiny library asset): re-encoding gained nothing, keep the original.
  const candidate = best && best.buffer.length < raw.buffer.length ? best : raw;
  if (candidate.buffer.length > GPT_IMAGE_REF_HARD_LIMIT_BYTES) {
    // Тело такого размера гарантированно не доживёт до ответа через наш egress:
    // честная ошибка с refund вместо обречённого upload + 5 минут history recovery.
    throw new ProviderError(
      'GPT_IMAGE_REF_UNPROCESSABLE',
      `gpt-image reference is ${candidate.buffer.length} bytes and could not be re-encoded below ${GPT_IMAGE_REF_HARD_LIMIT_BYTES}`,
    );
  }
  return candidate;
}

// PiAPI gpt-image quality allows: low | standard | high | auto (per the PiAPI GPT Image docs).
// Anything else falls back to "auto".
function normalizeGptImageQuality(value: string | undefined): 'auto' | 'high' | 'standard' | 'low' {
  if (value === 'high' || value === 'standard' || value === 'low' || value === 'auto') return value;
  if (value === 'medium') return 'high';
  return 'auto';
}

function normalizeHailuoResolution(value: string | undefined): '768P' | '1080P' {
  if (value === '1080P' || value === '1080p') return '1080P';
  return '768P';
}

function estimatedCostForModel(slug: string, params: Record<string, unknown>, fallback: number) {
  const estimated = estimateModelCostUsd({
    slug,
    title: slug,
    tierHint: 'both',
    estimatedCostCoins: 0,
    estimatedCostUsd: fallback,
    provider: 'piapi',
  }, params);
  return estimated > 0 ? estimated : fallback;
}

function readStringList(source: Record<string, unknown> | undefined, key: string): string[] {
  const value = source?.[key];
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string' && item.length > 0);
  }
  if (typeof value === 'string') {
    return value.split(',').map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function readJsonArray(source: Record<string, unknown> | undefined, key: string): unknown[] | undefined {
  const value = source?.[key];
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || value.trim().length === 0) return undefined;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

function optionalSeed(source: Record<string, unknown> | undefined): number | undefined {
  const value = source?.seed;
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return value;
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value);
  return undefined;
}

function providerAspectRatio(value: string | undefined, fallback = '16:9') {
  return value && value !== 'auto' ? value : fallback;
}

// Возвращает формат ТОЛЬКО когда юзер выбрал его явно (не «авто»/пусто). Используется
// в omni-ветках, где при «авто» поле aspect_ratio лучше опустить, чтобы модель взяла
// формат из загруженного референса (сцена/видео), а не форсила 16:9.
function explicitAspectRatio(value: string | undefined): string | undefined {
  return value && value !== 'auto' ? value : undefined;
}

function hailuoModelSlug(model: string) {
  return model.includes('fast') ? 'v2.3-fast' : 'v2.3';
}

function boundedHailuoDuration(durationSec: number) {
  return durationSec <= 6 ? 6 : 10;
}

function veoTaskType(model: string) {
  return model.includes('fast') ? 'veo3.1-video-fast' : 'veo3.1-video';
}

function seedanceTaskType(model: string) {
  if (model.includes('fast-less-restriction')) return 'seedance-2-fast-less-restriction';
  if (model.includes('less-restriction')) return 'seedance-2-less-restriction';
  return model.includes('fast') ? 'seedance-2-fast' : 'seedance-2';
}

// Talking-avatar / lip-sync payloads. OmniHuman 1.5: image_url + audio_url + prompt (audio <35s).
// Kling lip-sync: image_url + local_dubbing_url (mp3/wav/flac/ogg <60s) + mode/duration/aspect.
function buildTalkingAvatarPayload(
  model: string,
  input: { imageUrl: string; audioUrl: string; prompt?: string; params?: Record<string, unknown> },
) {
  if (model === 'omnihuman-1.5') {
    const fastMode = readBoolean(input.params, 'fast_mode');
    return {
      model: 'omni-human',
      task_type: 'omni-human-1.5',
      input: {
        image_url: input.imageUrl,
        audio_url: input.audioUrl,
        ...(input.prompt && input.prompt.trim() ? { prompt: input.prompt.trim() } : {}),
        fast_mode: fastMode ?? true,
      },
    };
  }
  // Kling lip-sync (task_type lip_sync) requires a pre-existing video (origin_task_id/video_url),
  // not a bare image, so it cannot do image->talking-avatar; only OmniHuman is supported here.
  throw new ProviderError('UNSUPPORTED_MODEL', `Unsupported talking-avatar model: ${model}`);
}

function buildImageToVideoPayload(
  model: string,
  input: {
    prompt: string;
    durationSec: number;
    imageUrl: string;
    aspectRatio?: string;
    params?: Record<string, unknown>;
  },
) {
  const klingModel = KLING_PRICE_5S[model];
  if (klingModel) {
    return {
      model: 'kling',
      task_type: 'video_generation',
      input: {
        mode: klingModel.mode,
        duration: input.durationSec,
        image_url: input.imageUrl,
        prompt: input.prompt,
        negative_prompt: readString(input.params, 'negative_prompt') ?? '',
        ...(klingModel.version ? { version: klingModel.version } : {}),
        ...(readString(input.params, 'resolution') ? { resolution: readString(input.params, 'resolution') } : {}),
        ...(readString(input.params, 'camera_control') ? { camera_control: readString(input.params, 'camera_control') } : {}),
        ...(readBoolean(input.params, 'enable_audio') !== undefined ? { enable_audio: readBoolean(input.params, 'enable_audio') } : {}),
        ...(readBoolean(input.params, 'prefer_multi_shots') !== undefined ? { prefer_multi_shots: readBoolean(input.params, 'prefer_multi_shots') } : {}),
        ...(readJsonArray(input.params, 'multi_shots') ? { multi_shots: readJsonArray(input.params, 'multi_shots') } : {}),
        ...(input.aspectRatio ? { aspect_ratio: input.aspectRatio } : {}),
      },
    };
  }

  if (HAILUO_MODELS.has(model)) {
    return {
      model: 'hailuo',
      task_type: 'video_generation',
      input: {
        prompt: input.prompt,
        image_url: input.imageUrl,
        model: hailuoModelSlug(model),
        duration: boundedHailuoDuration(input.durationSec),
        resolution: normalizeHailuoResolution(readString(input.params, 'resolution')),
        expand_prompt: readBoolean(input.params, 'expand_prompt') ?? true,
      },
    };
  }

  if (VEO_IMAGE_TO_VIDEO_MODELS.has(model)) {
    return {
      model: 'veo3.1',
      task_type: veoTaskType(model),
      input: {
        prompt: input.prompt,
        image_url: input.imageUrl,
        duration: `${input.durationSec}s`,
        aspect_ratio: providerAspectRatio(input.aspectRatio),
        generate_audio: readBoolean(input.params, 'generate_audio') ?? false,
        ...(readString(input.params, 'resolution') ? { resolution: readString(input.params, 'resolution') } : {}),
        ...(readString(input.params, 'negative_prompt') ? { negative_prompt: readString(input.params, 'negative_prompt') } : {}),
        ...(readString(input.params, 'tail_image_url') ? { tail_image_url: readString(input.params, 'tail_image_url') } : {}),
      },
    };
  }

  if (SEEDANCE_IMAGE_TO_VIDEO_MODELS.has(model)) {
    const tailImageUrl = readString(input.params, 'tail_image_url');
    return {
      model: 'seedance',
      task_type: seedanceTaskType(model),
      input: {
        prompt: input.prompt,
        mode: 'first_last_frames',
        image_urls: tailImageUrl ? [input.imageUrl, tailImageUrl] : [input.imageUrl],
        duration: input.durationSec,
        aspect_ratio: providerAspectRatio(input.aspectRatio),
        resolution: readString(input.params, 'resolution') ?? '720p',
        ...(optionalSeed(input.params) !== undefined ? { seed: optionalSeed(input.params) } : {}),
      },
    };
  }

  return {
    model: 'wan',
    task_type: 'wan26-i2v',
    input: {
      prompt: input.prompt,
      image_url: input.imageUrl,
      duration: input.durationSec,
      aspect_ratio: providerAspectRatio(input.aspectRatio),
      resolution: readString(input.params, 'resolution') ?? '720p',
      ...(readString(input.params, 'negative_prompt') ? { negative_prompt: readString(input.params, 'negative_prompt') } : {}),
      ...(readBoolean(input.params, 'expand_prompt') !== undefined ? { prompt_extend: readBoolean(input.params, 'expand_prompt') } : {}),
      ...(readString(input.params, 'shot_type') ? { shot_type: readString(input.params, 'shot_type') } : {}),
      ...(readString(input.params, 'audio_url') ? { audio_url: readString(input.params, 'audio_url') } : {}),
      ...(readBoolean(input.params, 'watermark') !== undefined ? { watermark: readBoolean(input.params, 'watermark') } : {}),
      ...(optionalSeed(input.params) !== undefined ? { seed: optionalSeed(input.params) } : {}),
    },
  };
}

function buildTextToVideoPayload(
  model: string,
  input: {
    prompt: string;
    durationSec: number;
    aspectRatio?: string;
    resolution?: string;
    generateAudio: boolean;
    params?: Record<string, unknown>;
  },
) {
  if (model === 'kling-3-omni') {
    const images = readStringList(input.params, 'images');
    const video = readString(input.params, 'video');
    const explicit = explicitAspectRatio(input.aspectRatio);
    return {
      model: 'kling',
      task_type: 'omni_video_generation',
      input: {
        prompt: input.prompt,
        duration: input.durationSec,
        // Omni следует загруженной сцене (фото-кадр/видео-референс). Жёсткий формат шлём
        // ТОЛЬКО когда юзер выбрал его явно; при «авто» поле опускаем, чтобы модель взяла
        // формат из референса, а не дефолтила в 16:9.
        ...(explicit ? { aspect_ratio: explicit } : {}),
        resolution: input.resolution ?? '720p',
        version: '3.0',
        enable_audio: readBoolean(input.params, 'enable_audio') ?? input.generateAudio,
        ...(images.length > 0 ? { images } : {}),
        ...(video ? { video } : {}),
        ...(readBoolean(input.params, 'keep_original_audio') !== undefined ? { keep_original_audio: readBoolean(input.params, 'keep_original_audio') } : {}),
        ...(readBoolean(input.params, 'prefer_multi_shots') !== undefined ? { prefer_multi_shots: readBoolean(input.params, 'prefer_multi_shots') } : {}),
        ...(readJsonArray(input.params, 'multi_shots') ? { multi_shots: readJsonArray(input.params, 'multi_shots') } : {}),
      },
    };
  }

  if (model.startsWith('seedance-2')) {
    const isOmni = model.endsWith('-omni') || readString(input.params, 'mode') === 'omni_reference';
    const imageUrls = readStringList(input.params, 'image_urls');
    const videoUrls = readStringList(input.params, 'video_urls');
    const audioUrls = readStringList(input.params, 'audio_urls');
    const explicit = explicitAspectRatio(input.aspectRatio);
    return {
      model: 'seedance',
      task_type: seedanceTaskType(model),
      input: {
        prompt: input.prompt,
        mode: isOmni ? 'omni_reference' : 'text_to_video',
        duration: input.durationSec,
        // Omni следует референсу: при «авто» опускаем формат (а не дефолтим в 16:9).
        // Для чистого text-to-video (без референса) оставляем дефолт.
        ...(isOmni
          ? (explicit ? { aspect_ratio: explicit } : {})
          : { aspect_ratio: providerAspectRatio(input.aspectRatio) }),
        resolution: input.resolution ?? '720p',
        ...(imageUrls.length > 0 ? { image_urls: imageUrls } : {}),
        ...(videoUrls.length > 0 ? { video_urls: videoUrls } : {}),
        ...(audioUrls.length > 0 ? { audio_urls: audioUrls } : {}),
        ...(optionalSeed(input.params) !== undefined ? { seed: optionalSeed(input.params) } : {}),
      },
    };
  }

  if (model.startsWith('hailuo-2.3')) {
    return {
      model: 'hailuo',
      task_type: 'video_generation',
      input: {
        prompt: input.prompt,
        model: hailuoModelSlug(model),
        duration: boundedHailuoDuration(input.durationSec),
        resolution: normalizeHailuoResolution(input.resolution),
        expand_prompt: readBoolean(input.params, 'expand_prompt') ?? true,
      },
    };
  }

  if (model === 'veo-3.1' || model === 'veo-3.1-fast') {
    return {
      model: 'veo3.1',
      task_type: veoTaskType(model),
      input: {
        prompt: input.prompt,
        duration: `${input.durationSec}s`,
        aspect_ratio: providerAspectRatio(input.aspectRatio),
        generate_audio: input.generateAudio,
        ...(input.resolution ? { resolution: input.resolution } : {}),
        ...(readString(input.params, 'negative_prompt') ? { negative_prompt: readString(input.params, 'negative_prompt') } : {}),
      },
    };
  }

  if (model === 'wan-2.6') {
    return {
      model: 'wan',
      task_type: 'wan26-t2v',
      input: {
        prompt: input.prompt,
        duration: input.durationSec,
        aspect_ratio: providerAspectRatio(input.aspectRatio),
        resolution: input.resolution ?? '720p',
        ...(readString(input.params, 'negative_prompt') ? { negative_prompt: readString(input.params, 'negative_prompt') } : {}),
        ...(readBoolean(input.params, 'expand_prompt') !== undefined ? { prompt_extend: readBoolean(input.params, 'expand_prompt') } : {}),
        ...(readString(input.params, 'shot_type') ? { shot_type: readString(input.params, 'shot_type') } : {}),
        ...(readString(input.params, 'audio_url') ? { audio_url: readString(input.params, 'audio_url') } : {}),
        ...(readBoolean(input.params, 'watermark') !== undefined ? { watermark: readBoolean(input.params, 'watermark') } : {}),
        ...(optionalSeed(input.params) !== undefined ? { seed: optionalSeed(input.params) } : {}),
      },
    };
  }

  return {
    model: 'sora2',
    task_type: model === 'sora-2-pro' ? 'sora2-pro-video' : 'sora2-video',
    input: {
      prompt: input.prompt,
      duration: input.durationSec,
      aspect_ratio: providerAspectRatio(input.aspectRatio),
      ...(input.resolution ? { resolution: input.resolution } : {}),
    },
  };
}

function buildImageEditPayload(input: {
  modelSlug: string;
  modelConfig: { providerModel: string; taskType: string; supportsImageInput: boolean; estimatedCostUsd: number };
  prompt: string;
  imageUrls: string[];
  resolution: string;
  aspectRatio?: string;
  negativePrompt?: string;
  strength?: number;
  params?: Record<string, unknown>;
}) {
  const { modelSlug, modelConfig } = input;
  const ar = input.aspectRatio && input.aspectRatio !== 'auto' ? input.aspectRatio : undefined;
  const outputFormat = readString(input.params, 'output_format') ?? 'jpg';

  if (modelSlug === 'nano-banana') {
    const imageUrls = input.imageUrls;
    return {
      model: modelConfig.providerModel,
      task_type: modelConfig.taskType,
      input: {
        prompt: input.prompt,
        output_format: outputFormat,
        resolution: input.resolution,
        ...(imageUrls.length > 0 ? { image_urls: imageUrls } : {}),
        ...(ar ? { aspect_ratio: ar } : {}),
      },
    };
  }

  return {
    model: modelConfig.providerModel,
    task_type: modelConfig.taskType,
    input: {
      prompt: input.prompt,
      ...(input.negativePrompt ? { negative_prompt: input.negativePrompt } : {}),
      ...(ar ? { aspect_ratio: ar } : {}),
      output_format: outputFormat,
      ...(readNumber(input.params, 'guidance_scale') !== undefined ? { guidance_scale: readNumber(input.params, 'guidance_scale') } : {}),
      ...(readNumber(input.params, 'steps') !== undefined ? { steps: readNumber(input.params, 'steps') } : {}),
    },
  };
}

function buildWatermarkPayload(videoUrl: string, durationSec?: number) {
  return {
    model: 'seedance',
    task_type: 'remove-watermark',
    input: {
      video_url: videoUrl,
      ...(durationSec ? { duration: Math.ceil(durationSec) } : {}),
    },
  };
}

function buildVideoUpscalePayload(videoUrl: string) {
  return {
    model: 'Qubico/video-toolkit',
    task_type: 'upscale',
    input: {
      video: videoUrl,
    },
  };
}

export const __piapiPayloadBuildersForTests = {
  buildImageToVideoPayload,
  buildTextToVideoPayload,
  buildImageEditPayload,
  buildWatermarkPayload,
  buildVideoUpscalePayload,
  normalizeGptImageReference,
  uniqueImageReferenceUrls,
  limitImageReferences,
};

function aspectRatioFromDimensions(width: number, height: number): '9:16' | '16:9' | '1:1' {
  const ratio = width / height;
  if (ratio < 0.85) return '9:16';
  if (ratio > 1.25) return '16:9';
  return '1:1';
}

function ffprobeVideoDimensions(url: string): Promise<{ width: number; height: number } | undefined> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    };
    const succeed = (value: { width: number; height: number } | undefined) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const child = spawn('ffprobe', [
      '-v',
      'error',
      '-select_streams',
      'v:0',
      '-show_entries',
      'stream=width,height',
      '-of',
      'json',
      url,
    ], { windowsHide: true });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      fail(new Error('ffprobe timed out'));
    }, 10_000);
    child.stdout.on('data', (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr.on('data', (chunk) => stderr.push(Buffer.from(chunk)));
    child.on('error', fail);
    child.on('close', (code) => {
      if (code !== 0) {
        fail(new Error(Buffer.concat(stderr).toString('utf8') || 'ffprobe failed'));
        return;
      }
      try {
        const parsed = JSON.parse(Buffer.concat(stdout).toString('utf8')) as {
          streams?: Array<{ width?: number; height?: number }>;
        };
        const stream = parsed.streams?.[0];
        if (stream?.width && stream.height) {
          succeed({ width: stream.width, height: stream.height });
          return;
        }
        succeed(undefined);
      } catch (err) {
        fail(err as Error);
      }
    });
  });
}

function costUsdFromActualOrEstimate(status: PiAPITaskStatus, fallback: number) {
  if (status.actualCostUsd !== null) return status.actualCostUsd;
  console.warn(`[piapi] actualCostUsd missing for taskId=${status.taskId}; falling back to estimatedCost=$${fallback.toFixed(4)}`);
  return fallback;
}

function extFor(contentType: string, url: string, fallback: string) {
  if (contentType === 'video/mp4') return 'mp4';
  if (contentType === 'video/webm') return 'webm';
  if (contentType === 'video/quicktime') return 'mov';
  if (contentType === 'image/jpeg') return 'jpg';
  if (contentType === 'image/png') return 'png';
  if (contentType === 'image/webp') return 'webp';
  const ext = path.extname(new URL(url).pathname).replace(/^\./, '');
  return ext || fallback;
}

function contentTypeForUrl(url: string, fallback: string) {
  const clean = url.split('?')[0]?.toLowerCase() ?? '';
  if (clean.endsWith('.mp4')) return 'video/mp4';
  if (clean.endsWith('.webm')) return 'video/webm';
  if (clean.endsWith('.mov')) return 'video/quicktime';
  if (clean.endsWith('.jpg') || clean.endsWith('.jpeg')) return 'image/jpeg';
  if (clean.endsWith('.png')) return 'image/png';
  if (clean.endsWith('.webp')) return 'image/webp';
  if (clean.endsWith('.mp3')) return 'audio/mpeg';
  if (clean.endsWith('.wav')) return 'audio/wav';
  if (clean.endsWith('.ogg')) return 'audio/ogg';
  return fallback;
}
