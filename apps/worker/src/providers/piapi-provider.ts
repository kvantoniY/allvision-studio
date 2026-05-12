import { spawn } from 'node:child_process';
import path from 'node:path';
import sharp from 'sharp';
import type { StorageProvider } from '@allvision/shared';
import type { AIProvider, ProviderResult, ProviderRunContext } from './ai-provider';
import { PiAPIClient, type PiAPITaskStatus } from './piapi-client';
import { ProviderError } from './provider-errors';
import type { FilePublisher } from './file-publisher';
import { assertPiAPIDailyCap, createAIUsageLog } from './usage-limits';

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

const KLING_PRICE_5S: Record<string, { mode: 'std' | 'pro'; costUsd: number }> = {
  'kling-std': { mode: 'std', costUsd: 0.20 },
  'kling-pro': { mode: 'pro', costUsd: 0.33 },
};

const FACE_SWAP_MODEL = 'qubico-video-toolkit';
const FACE_SWAP_COST_PER_FRAME_USD = 0.004;
const DEFAULT_FACE_SWAP_DURATION_SEC = 5;
const DEFAULT_FACE_SWAP_FPS = 24;
const PIAPI_VIDEO_TIMEOUT_MS = 15 * 60 * 1000;
const PIAPI_IMAGE_EDIT_TIMEOUT_MS = 5 * 60 * 1000;
const NANO_BANANA_COST_USD: Record<string, number> = {
  '1K': 0.06,
  '2K': 0.08,
  '4K': 0.12,
};
const SUPPORTED_ASPECT_RATIOS = new Set(['9:16', '16:9', '1:1']);

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
    imageUrl: string;
    prompt: string;
    model: string;
    negativePrompt?: string;
    strength?: number;
    params?: Record<string, unknown>;
    context: ProviderRunContext;
  }): Promise<ProviderResult> {
    if (input.model !== 'nano-banana') {
      throw new ProviderError('UNSUPPORTED_MODEL', `Unsupported image-edit model: ${input.model}`);
    }
    const resolution = readString(input.params, 'resolution') ?? '1K';
    const estimatedCost = NANO_BANANA_COST_USD[resolution] ?? NANO_BANANA_COST_USD['1K'];
    await this.ensureCanCall(estimatedCost);

    const startedAt = Date.now();
    let taskId: string | undefined;
    let completedTask: PiAPITaskStatus | undefined;
    try {
      const published = await this.publisher.publishImageUrl(input.imageUrl, 1);
      const aspectRatio = normalizeAspectRatio(readString(input.params, 'aspect_ratio'));
      const payload = {
        model: 'gemini',
        task_type: 'nano-banana-2',
        input: {
          prompt: input.prompt,
          image_urls: [published.publicUrl],
          output_format: readString(input.params, 'output_format') ?? 'jpg',
          resolution,
          ...(aspectRatio && aspectRatio !== 'auto' ? { aspect_ratio: aspectRatio } : {}),
        },
      };
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
    const model = KLING_PRICE_5S[input.model];
    if (!model) throw new ProviderError('UNSUPPORTED_MODEL', `Unsupported Kling model: ${input.model}`);
    const estimatedCost = model.costUsd * Math.max(1, Math.ceil(input.durationSec / 5));
    await this.ensureCanCall(estimatedCost);

    const startedAt = Date.now();
    let taskId: string | undefined;
    let completedTask: PiAPITaskStatus | undefined;
    try {
      const published = await this.publisher.publishImageUrl(input.imageUrl, 1);
      const aspectRatio = await this.resolveImageAspectRatio(input.imageUrl, input.params);
      const payload = {
        model: 'kling',
        task_type: 'video_generation',
        input: {
          mode: model.mode,
          duration: input.durationSec,
          image_url: published.publicUrl,
          prompt: input.prompt ?? '',
          negative_prompt: '',
          ...(aspectRatio ? { aspect_ratio: aspectRatio } : {}),
        },
      };
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

  private async ensureCanCall(nextCostUsd: number) {
    if (this.lowBalance) {
      throw new ProviderError('LOW_PROVIDER_BALANCE', 'PiAPI account balance is too low');
    }
    await assertPiAPIDailyCap(nextCostUsd, this.dailyCapUsd);
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

function normalizeAspectRatio(value: string | undefined): 'auto' | '9:16' | '16:9' | '1:1' | undefined {
  if (!value) return undefined;
  if (value === 'auto' || value === 'input') return 'auto';
  return SUPPORTED_ASPECT_RATIOS.has(value) ? value as '9:16' | '16:9' | '1:1' : undefined;
}

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
