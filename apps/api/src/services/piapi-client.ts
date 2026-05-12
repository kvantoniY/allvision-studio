import { HttpError } from '../utils/http-error';

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

function readPath(source: Record<string, unknown>, path: string[]): unknown {
  return path.reduce<unknown>((current, part) => {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined;
    return (current as Record<string, unknown>)[part];
  }, source);
}
