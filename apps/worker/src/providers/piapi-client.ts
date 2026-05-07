import { ProviderError } from './provider-errors';

export interface PiAPITaskStatus {
  taskId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress?: number;
  outputUrl?: string;
  raw: Record<string, unknown>;
  errorCode?: string;
  errorMessage?: string;
}

export interface PiAPIPollOptions {
  timeoutMs: number;
  expectedDurationMs: number;
  onProgress?: (progress: number) => Promise<void>;
}

export interface PiAPIClientOptions {
  apiKey: string;
  baseUrl?: string;
  requestTimeoutMs?: number;
}

const TRANSIENT_RETRIES = 3;

export class PiAPIClient {
  private baseUrl: string;
  private apiKey: string;
  private requestTimeoutMs: number;

  constructor(options: PiAPIClientOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? 'https://api.piapi.ai').replace(/\/+$/, '');
    this.requestTimeoutMs = options.requestTimeoutMs ?? 30_000;
  }

  async createTask(payload: unknown): Promise<{ taskId: string; raw: Record<string, unknown> }> {
    const raw = await this.requestJson('/api/v1/task', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const taskId = readString(raw, ['task_id'])
      ?? readString(raw, ['data', 'task_id'])
      ?? readString(raw, ['task', 'id'])
      ?? readString(raw, ['id']);
    if (!taskId) throw new ProviderError('PIAPI_BAD_RESPONSE', 'PiAPI create task response does not contain task_id');
    return { taskId, raw };
  }

  async getTask(taskId: string): Promise<PiAPITaskStatus> {
    const raw = await this.requestJson(`/api/v1/task/${encodeURIComponent(taskId)}`, { method: 'GET' });
    return normaliseTaskStatus(taskId, raw);
  }

  async pollUntilDone(taskId: string, opts: PiAPIPollOptions): Promise<PiAPITaskStatus> {
    const startedAt = Date.now();
    let intervalMs = 5_000;

    while (Date.now() - startedAt < opts.timeoutMs) {
      const status = await this.getTask(taskId);
      const elapsed = Date.now() - startedAt;
      const fallbackProgress = Math.min(95, Math.round((elapsed / opts.expectedDurationMs) * 95));
      const progress = typeof status.progress === 'number'
        ? Math.min(95, Math.max(0, status.progress))
        : fallbackProgress;

      if (status.status === 'pending' || status.status === 'processing') {
        await opts.onProgress?.(progress);
        await delay(intervalMs);
        intervalMs = Math.min(30_000, Math.round(intervalMs * 1.5));
        continue;
      }

      if (status.status === 'completed') {
        await opts.onProgress?.(100);
        return status;
      }

      throw new ProviderError(
        status.errorCode ?? 'PIAPI_TASK_FAILED',
        status.errorMessage ?? 'PiAPI task failed',
      );
    }

    throw new ProviderError('PIAPI_TIMEOUT', `PiAPI task ${taskId} timed out`);
  }

  async getAccountInfo(): Promise<{ equivalentUsd: number; raw: Record<string, unknown> }> {
    const raw = await this.requestJson('/account/info', { method: 'GET' });
    const equivalentUsd = readNumber(raw, ['equivalent_in_usd'])
      ?? readNumber(raw, ['data', 'equivalent_in_usd'])
      ?? readNumber(raw, ['balance', 'equivalent_in_usd'])
      ?? 0;
    return { equivalentUsd, raw };
  }

  async download(url: string): Promise<{ buffer: Buffer; contentType: string }> {
    const res = await this.fetchWithRetry(url, { method: 'GET', headers: {} }, false);
    const contentType = res.headers.get('content-type')?.split(';')[0]?.trim() ?? 'application/octet-stream';
    return { buffer: Buffer.from(await res.arrayBuffer()), contentType };
  }

  private async requestJson(path: string, init: RequestInit): Promise<Record<string, unknown>> {
    const res = await this.fetchWithRetry(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey,
        ...(init.headers ?? {}),
      },
    }, true);
    const json = await res.json().catch(() => ({}));
    if (!json || typeof json !== 'object' || Array.isArray(json)) {
      throw new ProviderError('PIAPI_BAD_RESPONSE', 'PiAPI returned non-object JSON');
    }
    return json as Record<string, unknown>;
  }

  private async fetchWithRetry(url: string, init: RequestInit, parseErrorJson: boolean): Promise<Response> {
    let lastError: unknown;
    for (let attempt = 0; attempt < TRANSIENT_RETRIES; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.requestTimeoutMs);
      try {
        const res = await fetch(url, { ...init, signal: controller.signal });
        if (res.ok) return res;
        if (res.status >= 400 && res.status < 500) {
          const message = parseErrorJson ? await readErrorMessage(res) : res.statusText;
          throw new ProviderError(`PIAPI_HTTP_${res.status}`, message || res.statusText, res.status);
        }
        lastError = new ProviderError(`PIAPI_HTTP_${res.status}`, res.statusText, res.status);
      } catch (err) {
        if (err instanceof ProviderError && err.status && err.status < 500) throw err;
        lastError = err;
      } finally {
        clearTimeout(timer);
      }

      await delay(500 * (attempt + 1));
    }

    if (lastError instanceof ProviderError) throw lastError;
    throw new ProviderError('PIAPI_NETWORK_ERROR', (lastError as Error)?.message ?? 'PiAPI network error');
  }
}

function normaliseTaskStatus(taskId: string, raw: Record<string, unknown>): PiAPITaskStatus {
  const data = readObject(raw, ['data']) ?? raw;
  const statusRaw = readString(data, ['status'])
    ?? readString(data, ['task_status'])
    ?? readString(raw, ['status'])
    ?? 'processing';
  const status = mapStatus(statusRaw);
  const outputUrl = findFirstString(data, [
    ['output', 'video_url'],
    ['output', 'image_url'],
    ['output', 'url'],
    ['output', 'result_url'],
    ['output', 'result'],
    ['output', 'video'],
    ['output', 'image'],
    ['output_url'],
    ['video_url'],
    ['image_url'],
    ['result_url'],
  ]) ?? readKlingWorkUrl(data);
  const progress = readNumber(data, ['progress']) ?? readNumber(data, ['meta', 'progress']);
  const errorMessage = readString(data, ['error', 'message'])
    ?? readString(data, ['error_message'])
    ?? readString(data, ['message']);
  const errorCode = readString(data, ['error', 'code']) ?? readString(data, ['error_code']);
  return { taskId, status, progress, outputUrl, raw, errorCode, errorMessage };
}

function readKlingWorkUrl(source: Record<string, unknown>): string | undefined {
  const output = readObject(source, ['output']);
  const works = output?.works;
  if (!Array.isArray(works)) return undefined;
  const first = works.find((item) => item && typeof item === 'object') as Record<string, unknown> | undefined;
  if (!first) return undefined;
  return readString(first, ['video', 'resource_without_watermark'])
    ?? readString(first, ['video', 'resource'])
    ?? readString(first, ['cover', 'resource']);
}

function mapStatus(value: string): PiAPITaskStatus['status'] {
  const status = value.toLowerCase();
  if (status === 'completed' || status === 'success' || status === 'succeeded') return 'completed';
  if (status === 'failed' || status === 'error') return 'failed';
  if (status === 'pending' || status === 'queued') return 'pending';
  return 'processing';
}

async function readErrorMessage(res: Response) {
  const json = await res.json().catch(() => undefined);
  if (json && typeof json === 'object') {
    return readString(json as Record<string, unknown>, ['message'])
      ?? readString(json as Record<string, unknown>, ['error', 'message'])
      ?? readString(json as Record<string, unknown>, ['data', 'message']);
  }
  return res.statusText;
}

function readObject(source: Record<string, unknown>, path: string[]): Record<string, unknown> | undefined {
  const value = readPath(source, path);
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function readString(source: Record<string, unknown>, path: string[]): string | undefined {
  const value = readPath(source, path);
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readNumber(source: Record<string, unknown>, path: string[]): number | undefined {
  const value = readPath(source, path);
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

function findFirstString(source: Record<string, unknown>, paths: string[][]): string | undefined {
  for (const path of paths) {
    const value = readString(source, path);
    if (value) return value;
  }
  return undefined;
}

function readPath(source: Record<string, unknown>, path: string[]): unknown {
  return path.reduce<unknown>((current, part) => {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined;
    return (current as Record<string, unknown>)[part];
  }, source);
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
