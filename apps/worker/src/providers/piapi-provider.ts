import path from 'node:path';
import type { StorageProvider } from '@allvision/shared';
import type { AIProvider, ProviderResult, ProviderRunContext } from './ai-provider';
import { PiAPIClient } from './piapi-client';
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
    try {
      const published = await this.publisher.publishImageUrl(input.imageUrl, 1);
      const aspectRatio = readString(input.params, 'aspect_ratio');
      const payload = {
        model: 'gemini',
        task_type: 'nano-banana-2',
        input: {
          prompt: input.prompt,
          image_urls: [published.publicUrl],
          output_format: readString(input.params, 'output_format') ?? 'jpg',
          resolution,
          ...(aspectRatio && aspectRatio !== 'input' ? { aspect_ratio: aspectRatio } : {}),
        },
      };
      const created = await this.client.createTask(payload);
      taskId = created.taskId;
      const completed = await this.client.pollUntilDone(taskId, {
        timeoutMs: PIAPI_IMAGE_EDIT_TIMEOUT_MS,
        expectedDurationMs: 60 * 1000,
        onProgress: input.context.reportProgress,
      });
      if (!completed.outputUrl) {
        throw new ProviderError('PIAPI_EMPTY_OUTPUT', 'PiAPI Nano Banana task completed without image URL');
      }
      const local = await this.persistProviderOutput(completed.outputUrl, input.context, 'jpg');
      const costUsd = extractCostUsd(completed.raw, estimatedCost);
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
        },
      };
    } catch (err) {
      const durationMs = Date.now() - startedAt;
      await this.logUsage(
        input.context,
        input.model,
        taskId,
        err instanceof ProviderError && err.code === 'PIAPI_TIMEOUT' ? 'timeout' : 'failed',
        0,
        durationMs,
        err,
      );
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
    try {
      const published = await this.publisher.publishImageUrl(input.imageUrl, 1);
      const payload = {
        model: 'kling',
        task_type: 'video_generation',
        input: {
          mode: model.mode,
          duration: input.durationSec,
          image_url: published.publicUrl,
          prompt: input.prompt ?? '',
          negative_prompt: '',
        },
      };
      const created = await this.client.createTask(payload);
      taskId = created.taskId;
      const completed = await this.client.pollUntilDone(taskId, {
        timeoutMs: PIAPI_VIDEO_TIMEOUT_MS,
        expectedDurationMs: 10 * 60 * 1000,
        onProgress: input.context.reportProgress,
      });
      if (!completed.outputUrl) {
        throw new ProviderError('PIAPI_EMPTY_OUTPUT', 'PiAPI Kling task completed without video_url');
      }
      const local = await this.persistProviderOutput(completed.outputUrl, input.context, 'mp4');
      const costUsd = extractCostUsd(completed.raw, estimatedCost);
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
      await this.logUsage(
        input.context,
        input.model,
        taskId,
        err instanceof ProviderError && err.code === 'PIAPI_TIMEOUT' ? 'timeout' : 'failed',
        0,
        durationMs,
        err,
      );
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
    try {
      const published = await this.publisher.publishImageUrl(input.swapImageUrl, 1);
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
      if (!completed.outputUrl) {
        throw new ProviderError('PIAPI_EMPTY_OUTPUT', 'PiAPI face-swap task completed without video URL');
      }
      const local = await this.persistProviderOutput(completed.outputUrl, input.context, 'mp4');
      const costUsd = extractCostUsd(completed.raw, estimatedCost);
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
        },
      };
    } catch (err) {
      const durationMs = Date.now() - startedAt;
      await this.logUsage(
        input.context,
        input.model,
        taskId,
        err instanceof ProviderError && err.code === 'PIAPI_TIMEOUT' ? 'timeout' : 'failed',
        0,
        durationMs,
        err,
      );
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

  private async logUsage(
    context: ProviderRunContext,
    model: string,
    taskId: string | undefined,
    status: 'success' | 'failed' | 'timeout',
    costUsd: number,
    durationMs: number,
    error?: unknown,
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
    }).catch((err) => {
      this.logger.warn('[piapi] Failed to write AIUsageLog', err);
    });
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

function extractCostUsd(raw: Record<string, unknown>, fallback: number) {
  const paths = [
    ['data', 'meta', 'cost_usd'],
    ['data', 'meta', 'usage', 'cost_usd'],
    ['data', 'meta', 'cost'],
    ['data', 'cost_usd'],
    ['meta', 'cost_usd'],
  ];
  for (const parts of paths) {
    const value = parts.reduce<unknown>((current, part) => {
      if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined;
      return (current as Record<string, unknown>)[part];
    }, raw);
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && Number.isFinite(Number(value))) return Number(value);
  }
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
