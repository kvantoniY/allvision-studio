import { HttpError } from '../utils/http-error';

export interface PiAPIHistoryTask {
  taskId?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  model?: string;
  taskType?: string;
  input?: Record<string, unknown>;
  outputUrl?: string;
  createdAt?: Date;
  raw: Record<string, unknown>;
}

export class PiAPIAccountClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(options: { apiKey: string; baseUrl?: string }) {
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? 'https://api.piapi.ai').replace(/\/+$/, '');
  }

  async getAccountInfo(): Promise<{ equivalentUsd: number; raw: Record<string, unknown> }> {
    const res = await fetch(`${this.baseUrl}/account/info`, {
      headers: { 'X-API-Key': this.apiKey },
    });
    const raw = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new HttpError(res.status, `PIAPI_HTTP_${res.status}`, readMessage(raw) ?? res.statusText);
    }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new HttpError(502, 'PIAPI_BAD_RESPONSE', 'PiAPI account response is invalid');
    }
    return {
      equivalentUsd: readNumber(raw as Record<string, unknown>, ['equivalent_in_usd'])
        ?? readNumber(raw as Record<string, unknown>, ['data', 'equivalent_in_usd'])
        ?? readNumber(raw as Record<string, unknown>, ['balance', 'equivalent_in_usd'])
        ?? 0,
      raw: raw as Record<string, unknown>,
    };
  }

  async getTask(taskId: string): Promise<Record<string, unknown>> {
    const res = await fetch(`${this.baseUrl}/api/v1/task/${encodeURIComponent(taskId)}`, {
      headers: { 'X-API-Key': this.apiKey },
    });
    const raw = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new HttpError(res.status, `PIAPI_HTTP_${res.status}`, readMessage(raw) ?? res.statusText);
    }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new HttpError(502, 'PIAPI_BAD_RESPONSE', 'PiAPI task response is invalid');
    }
    return raw as Record<string, unknown>;
  }

  async getUserTaskHistory(params: {
    page?: number;
    pageSize?: number;
    model?: string;
    startTimeSec?: number;
    endTimeSec?: number;
  } = {}): Promise<{ tasks: PiAPIHistoryTask[]; raw: Record<string, unknown> }> {
    const query = new URLSearchParams();
    query.set('page', String(params.page ?? 1));
    query.set('page_size', String(params.pageSize ?? 20));
    if (params.model) query.set('model', params.model);
    if (params.startTimeSec) query.set('start_time', String(params.startTimeSec));
    if (params.endTimeSec) query.set('end_time', String(params.endTimeSec));

    const res = await fetch(`${this.baseUrl}/api/open/tasks/histories?${query.toString()}`, {
      headers: { 'X-API-Key': this.apiKey },
    });
    const raw = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new HttpError(res.status, `PIAPI_HTTP_${res.status}`, readMessage(raw) ?? res.statusText);
    }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new HttpError(502, 'PIAPI_BAD_RESPONSE', 'PiAPI history response is invalid');
    }
    const record = raw as Record<string, unknown>;
    return {
      raw: record,
      tasks: extractHistoryRecords(record).map(normaliseHistoryTask),
    };
  }
}

function readMessage(raw: unknown) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  return readString(raw as Record<string, unknown>, ['message'])
    ?? readString(raw as Record<string, unknown>, ['error', 'message']);
}

function readString(source: Record<string, unknown>, path: string[]) {
  const value = readPath(source, path);
  return typeof value === 'string' ? value : undefined;
}

function readNumber(source: Record<string, unknown>, path: string[]) {
  const value = readPath(source, path);
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

function normaliseHistoryTask(raw: Record<string, unknown>): PiAPIHistoryTask {
  const data = readObject(raw, ['data']) ?? raw;
  const input = readObject(data, ['input'])
    ?? readObject(data, ['request', 'input'])
    ?? readObject(data, ['request']);
  const statusRaw = readString(data, ['status'])
    ?? readString(data, ['task_status'])
    ?? readString(raw, ['status'])
    ?? 'processing';
  return {
    taskId: readString(data, ['task_id'])
      ?? readString(data, ['id'])
      ?? readString(raw, ['task_id'])
      ?? readString(raw, ['id']),
    status: mapStatus(statusRaw),
    model: readString(data, ['model'])
      ?? readString(input ?? {}, ['model'])
      ?? readString(raw, ['model']),
    taskType: readString(data, ['task_type'])
      ?? readString(raw, ['task_type']),
    input,
    outputUrl: findOutputUrl(data) ?? findOutputUrl(raw),
    createdAt: readDate(data, [
      ['meta', 'created_at'],
      ['created_at'],
      ['createdAt'],
      ['created_time'],
      ['create_time'],
      ['created'],
    ]),
    raw,
  };
}

function extractHistoryRecords(raw: Record<string, unknown>): Record<string, unknown>[] {
  const candidates = [
    readPath(raw, ['data', 'items']),
    readPath(raw, ['data', 'records']),
    readPath(raw, ['data', 'list']),
    readPath(raw, ['data', 'tasks']),
    readPath(raw, ['data', 'histories']),
    readPath(raw, ['data', 'data']),
    readPath(raw, ['items']),
    readPath(raw, ['records']),
    readPath(raw, ['list']),
    readPath(raw, ['tasks']),
    readPath(raw, ['histories']),
    readPath(raw, ['data']),
  ];

  for (const value of candidates) {
    if (!Array.isArray(value)) continue;
    const records = value.filter((item): item is Record<string, unknown> =>
      Boolean(item) && typeof item === 'object' && !Array.isArray(item)
    );
    if (records.length > 0) return records;
  }

  return [];
}

function findOutputUrl(data: Record<string, unknown>): string | undefined {
  return findFirstString(data, [
    ['output', 'video_url'],
    ['output', 'image_url'],
    ['output', 'url'],
    ['output', 'result_url'],
    ['output', 'result'],
    ['output', 'video'],
    ['output', 'image'],
    ['response', 'url'],
    ['result', 'url'],
    ['output_url'],
    ['video_url'],
    ['image_url'],
    ['result_url'],
    ['url'],
  ]) ?? findFirstArrayString(data, [
    ['output', 'image_urls'],
    ['output', 'video_urls'],
    ['image_urls'],
    ['video_urls'],
  ]) ?? findFirstArrayObjectString(data, [
    ['output', 'data'],
    ['response', 'data'],
    ['result', 'data'],
    ['data'],
  ]);
}

function mapStatus(value: string): PiAPIHistoryTask['status'] {
  const status = value.toLowerCase();
  if (status === 'completed' || status === 'success' || status === 'succeeded') return 'completed';
  if (status === 'failed' || status === 'error') return 'failed';
  if (status === 'pending' || status === 'queued') return 'pending';
  return 'processing';
}

function readObject(source: Record<string, unknown>, path: string[]): Record<string, unknown> | undefined {
  const value = readPath(source, path);
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function findFirstString(source: Record<string, unknown>, paths: string[][]): string | undefined {
  for (const path of paths) {
    const value = readString(source, path);
    if (value) return value;
  }
  return undefined;
}

function findFirstArrayString(source: Record<string, unknown>, paths: string[][]): string | undefined {
  for (const path of paths) {
    const value = readPath(source, path);
    if (!Array.isArray(value)) continue;
    const first = value.find((item) => typeof item === 'string' && item.trim().length > 0);
    if (typeof first === 'string') return first;
  }
  return undefined;
}

function findFirstArrayObjectString(source: Record<string, unknown>, paths: string[][]): string | undefined {
  for (const path of paths) {
    const value = readPath(source, path);
    if (!Array.isArray(value)) continue;
    for (const item of value) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      const record = item as Record<string, unknown>;
      const url = readString(record, ['url'])
        ?? readString(record, ['image_url'])
        ?? readString(record, ['video_url'])
        ?? readString(record, ['result_url']);
      if (url) return url;
    }
  }
  return undefined;
}

function readDate(source: Record<string, unknown>, paths: string[][]): Date | undefined {
  for (const path of paths) {
    const value = readPath(source, path);
    if (typeof value === 'number' && Number.isFinite(value)) {
      const ms = value < 10_000_000_000 ? value * 1000 : value;
      return new Date(ms);
    }
    if (typeof value === 'string' && value.trim().length > 0) {
      const numeric = Number(value);
      if (Number.isFinite(numeric)) {
        const ms = numeric < 10_000_000_000 ? numeric * 1000 : numeric;
        return new Date(ms);
      }
      const parsed = Date.parse(value);
      if (Number.isFinite(parsed)) return new Date(parsed);
    }
  }
  return undefined;
}

function readPath(source: Record<string, unknown>, path: string[]): unknown {
  return path.reduce<unknown>((current, part) => {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined;
    return (current as Record<string, unknown>)[part];
  }, source);
}
