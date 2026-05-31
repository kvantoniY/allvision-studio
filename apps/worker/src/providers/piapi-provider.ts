import { spawn } from 'node:child_process';
import path from 'node:path';
import sharp from 'sharp';
import { estimateModelCostUsd, type StorageProvider } from '@allvision/shared';
import type { AIProvider, ProviderResult, ProviderRunContext } from './ai-provider';
import { PiAPIClient, type PiAPITaskStatus } from './piapi-client';
import { ProviderError } from './provider-errors';
import type { FilePublisher } from './file-publisher';
import { createAIUsageLog } from './usage-limits';

type Logger = {
  info: (message: string, meta?: unknown) => void;
  warn: (message: string, meta?: unknown) => void;
  error: (message: string, meta?: unknown) => void;
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
  'kling-3-pro': { mode: 'pro', costUsd: 1.30, version: '3.0' },
};

const FACE_SWAP_MODEL = 'qubico-video-toolkit';
const FACE_SWAP_COST_PER_FRAME_USD = 0.004;
const DEFAULT_FACE_SWAP_DURATION_SEC = 5;
const DEFAULT_FACE_SWAP_FPS = 24;
const WATERMARK_COST_PER_SEC_USD = 0.008;
const PIAPI_VIDEO_TIMEOUT_MS = 15 * 60 * 1000;
const PIAPI_IMAGE_EDIT_TIMEOUT_MS = 5 * 60 * 1000;
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

const IMAGE_EDIT_MODELS_BY_PROVIDER: Record<string, { providerModel: string; taskType: string; supportsImageInput: boolean; estimatedCostUsd: number }> = {
  'nano-banana': { providerModel: 'gemini', taskType: 'nano-banana-2', supportsImageInput: true, estimatedCostUsd: 0.06 },
  'flux-schnell': { providerModel: 'Qubico/flux1-schnell', taskType: 'txt2img', supportsImageInput: false, estimatedCostUsd: 0.003 },
  'flux-dev': { providerModel: 'Qubico/flux1-dev', taskType: 'txt2img', supportsImageInput: false, estimatedCostUsd: 0.025 },
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
    try {
      const aspectRatio = normalizeAspectRatio(readString(input.params, 'aspect_ratio'));
      const published = input.imageUrl ? await this.publisher.publishImageUrl(input.imageUrl, 1) : undefined;
      const extraImageUrls = readStringList(input.params, 'image_urls');
      const payload = buildImageEditPayload({
        modelSlug: input.model,
        modelConfig,
        prompt: input.prompt,
        publishedUrl: published?.publicUrl,
        extraImageUrls,
        resolution,
        aspectRatio,
        negativePrompt: input.negativePrompt,
        strength: input.strength,
        params: input.params,
      });
      const created = await this.client.createTask(payload);
      taskId = created.taskId;
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
      await this.logUsage(input.context, input.model, taskId, 'success', costUsd, durationMs);
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
      await this.logProviderFailure(input.context, input.model, taskId, durationMs, err, completedTask, estimatedCost);
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
      const created = await this.client.createTask(payload);
      taskId = created.taskId;
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
      await this.logUsage(input.context, input.model, taskId, 'success', costUsd, durationMs);
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
      await this.logProviderFailure(input.context, input.model, taskId, durationMs, err, completedTask, estimatedCost);
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
    try {
      const aspectRatio = normalizeAspectRatio(readString(input.params, 'aspect_ratio'));
      const payload = buildTextToVideoPayload(input.model, {
        prompt: input.prompt,
        durationSec: input.durationSec,
        aspectRatio,
        resolution: readString(input.params, 'resolution'),
        generateAudio: readBoolean(input.params, 'generate_audio') ?? false,
        params: input.params,
      });
      const created = await this.client.createTask(payload);
      taskId = created.taskId;
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
      await this.logUsage(input.context, input.model, taskId, 'success', costUsd, durationMs);
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
      await this.logProviderFailure(input.context, input.model, taskId, durationMs, err, completedTask, estimatedCost);
      throw err;
    }
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
    try {
      const published = await this.publisher.publishImageUrl(input.swapImageUrl, 1);
      const aspectRatio = await this.resolveTargetVideoAspectRatio(input.targetVideoUrl, input.params);
      const payload = {
        model: 'Qubico/video-toolkit',
        task_type: 'face-swap',
        input: {
          swap_image: published.publicUrl,
          target_video: input.targetVideoUrl,
          ...(readString(input.params, 'swap_faces_index') ? { swap_faces_index: readString(input.params, 'swap_faces_index') } : {}),
          ...(readString(input.params, 'target_faces_index') ? { target_faces_index: readString(input.params, 'target_faces_index') } : {}),
        },
      };
      const created = await this.client.createTask(payload);
      taskId = created.taskId;
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
      await this.logUsage(input.context, input.model, taskId, 'success', costUsd, durationMs);
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
      await this.logProviderFailure(input.context, input.model, taskId, durationMs, err, completedTask, estimatedCost);
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
      const created = await this.client.createTask(payload);
      taskId = created.taskId;
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
      await this.logUsage(input.context, input.model, taskId, 'success', costUsd, durationMs);
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
      await this.logProviderFailure(input.context, input.model, taskId, durationMs, err, completedTask, estimatedCost);
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
    try {
      const payload = buildWatermarkPayload(input.videoUrl, input.durationSec);
      const created = await this.client.createTask(payload);
      taskId = created.taskId;
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
      await this.logUsage(input.context, input.model, taskId, 'success', costUsd, durationMs);
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
      await this.logProviderFailure(input.context, input.model, taskId, durationMs, err, completedTask, estimatedCost);
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
    try {
      const publishedImage = await this.publisher.publishImageUrl(input.inputImageUrl, 1);
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
          ...(input.drivingVideoUrl ? { video_url: input.drivingVideoUrl } : {}),
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
      const created = await this.client.createTask(payload);
      taskId = created.taskId;
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
      await this.logUsage(input.context, input.model, taskId, 'success', costUsd, durationMs);
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
      await this.logProviderFailure(input.context, input.model, taskId, durationMs, err, completedTask, estimatedCost);
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
    error?: unknown,
    recoverableOutputUrl?: string,
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
      errorCode: error instanceof ProviderError ? error.code : undefined,
      errorMessage: error ? (error as Error).message : undefined,
      recoverableOutputUrl,
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
  ) {
    if (completedTask?.status === 'completed') {
      await this.logUsage(
        context,
        model,
        taskId,
        'failed',
        costUsdFromActualOrEstimate(completedTask, estimatedCost ?? 0),
        durationMs,
        error,
        completedTask.outputUrl,
      );
      return;
    }

    if (!(error instanceof ProviderError) || error.code !== 'PIAPI_TIMEOUT') {
      await this.logUsage(context, model, taskId, 'failed', 0, durationMs, error);
      return;
    }

    if (!taskId) {
      await this.logUsage(context, model, taskId, 'timeout', 0, durationMs, error);
      return;
    }

    let latest: PiAPITaskStatus;
    try {
      latest = await this.client.getTask(taskId);
    } catch (finalCheckError) {
      this.logger.warn(`[piapi] Final timeout getTask failed for taskId=${taskId}`, finalCheckError);
      await this.logUsage(context, model, taskId, 'timeout_pending', 0, durationMs, error);
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
        error,
        latest.outputUrl,
      );
      return;
    }

    if (latest.status === 'failed') {
      const taskError = new ProviderError(
        latest.errorCode ?? error.code,
        latest.errorMessage ?? error.message,
      );
      await this.logUsage(context, model, taskId, 'timeout', 0, durationMs, taskError);
      return;
    }

    await this.logUsage(context, model, taskId, 'timeout_pending', 0, durationMs, error);
  }
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

function normalizeAspectRatio(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (value === 'auto' || value === 'input') return 'auto';
  return SUPPORTED_ASPECT_RATIOS.has(value) ? value : undefined;
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

function optionalSeed(source: Record<string, unknown> | undefined): number | undefined {
  const value = source?.seed;
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return value;
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value);
  return undefined;
}

function providerAspectRatio(value: string | undefined, fallback = '16:9') {
  return value && value !== 'auto' ? value : fallback;
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
  return model.includes('fast') ? 'seedance-2-fast' : 'seedance-2';
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
    return {
      model: 'kling',
      task_type: 'omni_video_generation',
      input: {
        prompt: input.prompt,
        duration: input.durationSec,
        aspect_ratio: providerAspectRatio(input.aspectRatio),
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
    return {
      model: 'seedance',
      task_type: seedanceTaskType(model),
      input: {
        prompt: input.prompt,
        mode: isOmni ? 'omni_reference' : 'text_to_video',
        duration: input.durationSec,
        aspect_ratio: providerAspectRatio(input.aspectRatio),
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
  publishedUrl?: string;
  extraImageUrls: string[];
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
    const imageUrls = [...(input.publishedUrl ? [input.publishedUrl] : []), ...input.extraImageUrls];
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

export const __piapiPayloadBuildersForTests = {
  buildImageToVideoPayload,
  buildTextToVideoPayload,
  buildImageEditPayload,
  buildWatermarkPayload,
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
