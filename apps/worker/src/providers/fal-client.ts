import { ProviderError } from './provider-errors';

/**
 * Минимальный клиент fal.ai queue API.
 *
 * Поток (https://fal.ai/docs/model-apis/queue):
 *   1. submit:  POST https://queue.fal.run/{modelId}      -> { request_id, status_url, response_url }
 *   2. status:  GET  {status_url}                          -> { status: IN_QUEUE|IN_PROGRESS|COMPLETED }
 *   3. result:  GET  {response_url}                        -> output JSON модели (images[]/video{}/...)
 *
 * Аутентификация: заголовок `Authorization: Key <FAL_KEY>`.
 *
 * Почему это надёжнее PiAPI на нашей РФ-ВМ: submit/status/result — короткие запросы, никаких
 * длинных синхронных multipart-соединений (главный убийца gpt-image edits на PiAPI). Входные
 * файлы передаём как публичные URL (наш /static уже публичен) или base64 data-uri, поэтому
 * publish-to-R2/nginx и прокси-SPOF здесь не нужны.
 */

const DEFAULT_QUEUE_BASE = 'https://queue.fal.run';
// REST-хост fal для storage upload (загрузка видео-входов). Переопределяется через env,
// если fal сменит домен, без пересборки образа.
const REST_API_BASE = (process.env.FAL_REST_BASE_URL || 'https://rest.alpha.fal.ai').replace(/\/+$/, '');
const UPLOAD_TIMEOUT_MS = 120_000;
const UPLOAD_MAX_ATTEMPTS = 5;

export type FalQueueStatus = 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';

export interface FalClientOptions {
  apiKey: string;
  queueBaseUrl?: string;
  requestTimeoutMs?: number;
  /** Сколько всего заходов на скачивание готового результата (default env FAL_DOWNLOAD_RETRY_ATTEMPTS | 5). */
  downloadRetryAttempts?: number;
  /** Бэкофф между заходами скачивания; последний элемент повторяется. */
  downloadRetryBackoffMs?: number[];
}

export interface FalSubmitResult {
  requestId: string;
  statusUrl: string;
  responseUrl: string;
  raw: unknown;
}

export interface FalCompletedResult {
  /** Сырой output модели — структура зависит от модели (images[], video{url}, image{url} и т.п.). */
  output: Record<string, unknown>;
  /** Стоимость запроса в USD, если fal вернул её в логах/метаданных. */
  costUsd?: number;
  raw: unknown;
}

interface PollOptions {
  timeoutMs: number;
  /** Ожидаемая длительность для плавного прогресса (видео ~минуты, картинки ~секунды). */
  expectedDurationMs?: number;
  onProgress?: (percent: number) => Promise<void> | void;
  /** Вызывается при смене статуса очереди fal (IN_QUEUE -> IN_PROGRESS). */
  onStage?: (stage: FalQueueStatus) => Promise<void> | void;
}

const TRANSIENT_CONNECTION_RE = /ECONNRESET|socket hang up|EPIPE|ETIMEDOUT|ECONNREFUSED|UND_ERR|fetch failed|network/i;

export class FalClient {
  private apiKey: string;
  private queueBaseUrl: string;
  private requestTimeoutMs: number;
  private downloadRetryAttempts: number;
  private downloadRetryBackoffMs: number[];
  private priceCache = new Map<string, { price: { unitPrice: number; unit: string }; exp: number }>();

  constructor(options: FalClientOptions) {
    if (!options.apiKey) {
      throw new Error('FAL_KEY is required for FalClient');
    }
    this.apiKey = options.apiKey;
    // ВАЖНО: || (не ??) — пустая строка из env (FAL_QUEUE_BASE_URL=) должна падать на DEFAULT,
    // иначе queueBaseUrl='' и URL получается относительным ('/fal-ai/...') -> fetch не парсит.
    this.queueBaseUrl = (options.queueBaseUrl || DEFAULT_QUEUE_BASE).replace(/\/+$/, '');
    this.requestTimeoutMs = options.requestTimeoutMs ?? 60_000;
    this.downloadRetryAttempts = options.downloadRetryAttempts
      ?? Math.max(1, Number(process.env.FAL_DOWNLOAD_RETRY_ATTEMPTS ?? '5') || 5);
    this.downloadRetryBackoffMs = options.downloadRetryBackoffMs ?? [3_000, 10_000, 25_000, 60_000];
  }

  /** Ставит задачу в очередь fal. modelId — например 'fal-ai/veo3.1' или 'fal-ai/nano-banana/edit'. */
  async submit(modelId: string, input: Record<string, unknown>): Promise<FalSubmitResult> {
    const url = `${this.queueBaseUrl}/${modelId.replace(/^\/+/, '')}`;
    const res = await this.fetchWithRetry(url, {
      method: 'POST',
      headers: this.jsonHeaders(),
      body: JSON.stringify(input),
    }, { connectionRetries: 3, retries: 0 });

    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      throw new ProviderError(
        'FAL_SUBMIT_FAILED',
        `fal submit failed (${res.status}): ${truncate(JSON.stringify(json))}`,
        res.status,
      );
    }
    const requestId = readString(json, 'request_id');
    const statusUrl = readString(json, 'status_url');
    const responseUrl = readString(json, 'response_url');
    if (!requestId || !statusUrl || !responseUrl) {
      throw new ProviderError('FAL_SUBMIT_MALFORMED', `fal submit returned no request handles: ${truncate(JSON.stringify(json))}`);
    }
    return { requestId, statusUrl, responseUrl, raw: json };
  }

  /** Поллит статус до COMPLETED и возвращает output модели. */
  async pollUntilDone(submit: FalSubmitResult, opts: PollOptions): Promise<FalCompletedResult> {
    const deadline = Date.now() + opts.timeoutMs;
    const expected = opts.expectedDurationMs ?? 60_000;
    const startedAt = Date.now();
    let delayMs = 1_000;
    let lastStage: FalQueueStatus | undefined;

    while (Date.now() <= deadline) {
      const status = await this.getStatus(submit.statusUrl);
      if (status.status !== lastStage) {
        lastStage = status.status;
        await opts.onStage?.(status.status);
      }
      if (status.status === 'COMPLETED') {
        await opts.onProgress?.(99);
        return this.getResult(submit.responseUrl);
      }
      if (status.status === 'FAILED') {
        const policy = findContentPolicyViolation(status.raw);
        if (policy) {
          throw new ProviderError('FAL_CONTENT_POLICY', policy.message, undefined, { audio: policy.audio });
        }
        throw new ProviderError('FAL_TASK_FAILED', `fal task ${submit.requestId} failed: ${truncate(JSON.stringify(status.raw))}`);
      }
      // Плавный прогресс по прошедшему времени относительно ожидаемого.
      const elapsed = Date.now() - startedAt;
      const pct = Math.min(95, Math.round((elapsed / expected) * 90) + 5);
      await opts.onProgress?.(pct);

      await delay(Math.min(delayMs, Math.max(0, deadline - Date.now())));
      delayMs = Math.min(5_000, Math.round(delayMs * 1.4));
    }
    throw new ProviderError('FAL_TIMEOUT', `fal task ${submit.requestId} did not complete within ${opts.timeoutMs}ms`);
  }

  private async getStatus(statusUrl: string): Promise<{ status: FalQueueStatus; raw: unknown }> {
    const res = await this.fetchWithRetry(statusUrl, {
      method: 'GET',
      headers: { Authorization: `Key ${this.apiKey}` },
    }, { connectionRetries: 3, retries: 2 });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      throw new ProviderError('FAL_STATUS_FAILED', `fal status failed (${res.status})`, res.status);
    }
    const raw = readString(json, 'status') ?? '';
    const status: FalQueueStatus = raw === 'COMPLETED' || raw === 'IN_PROGRESS' || raw === 'IN_QUEUE' || raw === 'FAILED'
      ? raw
      : 'IN_PROGRESS';
    return { status, raw: json };
  }

  private async getResult(responseUrl: string): Promise<FalCompletedResult> {
    const res = await this.fetchWithRetry(responseUrl, {
      method: 'GET',
      headers: { Authorization: `Key ${this.apiKey}` },
    }, { connectionRetries: 3, retries: 2 });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const policy = findContentPolicyViolation(json);
      if (policy) {
        throw new ProviderError('FAL_CONTENT_POLICY', policy.message, res.status, { audio: policy.audio });
      }
      throw new ProviderError('FAL_RESULT_FAILED', `fal result fetch failed (${res.status}): ${truncate(JSON.stringify(json))}`, res.status);
    }
    return { output: json, costUsd: extractFalCost(json), raw: json };
  }

  /**
   * Реальная цена модели из fal Platform API (api.fal.ai/v1/models/pricing).
   * Возвращает { unitPrice, unit } (unit: 'seconds' | 'images' | 'megapixels' | 'compute_seconds' ...).
   * Кэш на 1 час, чтобы не дёргать на каждый вызов.
   */
  async getEndpointPricing(endpoint: string): Promise<{ unitPrice: number; unit: string } | undefined> {
    const key = endpoint.replace(/^\/+/, '');
    const cached = this.priceCache.get(key);
    if (cached && cached.exp > Date.now()) return cached.price;
    try {
      const url = `https://api.fal.ai/v1/models/pricing?endpoint_id=${encodeURIComponent(key)}`;
      const res = await this.fetchWithRetry(url, {
        method: 'GET',
        headers: { Authorization: `Key ${this.apiKey}` },
      }, { connectionRetries: 2, retries: 1 });
      if (!res.ok) return undefined;
      const json = (await res.json().catch(() => ({}))) as { prices?: Array<{ endpoint_id?: string; unit_price?: number; unit?: string }> };
      // Только точное совпадение endpoint: на неизвестный endpoint_id fal может вернуть общий
      // список цен, и первая строка — цена чужой модели (ложная себестоимость в AIUsageLog).
      const row = Array.isArray(json.prices)
        ? json.prices.find((p) => p.endpoint_id === key)
        : undefined;
      if (row && typeof row.unit_price === 'number') {
        const price = { unitPrice: row.unit_price, unit: String(row.unit ?? '') };
        this.priceCache.set(key, { price, exp: Date.now() + 60 * 60 * 1000 });
        return price;
      }
    } catch {
      // сеть/парсинг — молча падаем на estimate
    }
    return undefined;
  }

  /**
   * Скачивает итоговый файл (картинку/видео) с fal CDN.
   *
   * Результат к этому моменту уже сгенерирован и ОПЛАЧЕН на fal, поэтому сдаваться из-за флапа
   * egress РФ-ВМ -> fal.media (UND_ERR_CONNECT_TIMEOUT, прод-инцидент 05.07) слишком дорого:
   * повторяем скачивание с крупным бэкоффом (суммарно ~2-3 минуты). Каждый заход — свежее
   * соединение: DNS может отдать другой, достижимый CDN-хост. 4xx (результат недоступен/удалён)
   * не ретраим — это не транспортная проблема.
   */
  async download(url: string): Promise<{ buffer: Buffer; contentType: string }> {
    let lastErr: unknown;
    for (let attempt = 0; attempt < this.downloadRetryAttempts; attempt += 1) {
      if (attempt > 0) {
        const backoff = this.downloadRetryBackoffMs[Math.min(attempt - 1, this.downloadRetryBackoffMs.length - 1)];
        await delay(backoff);
      }
      try {
        return await this.downloadOnce(url);
      } catch (err) {
        lastErr = err;
        if (!isRetriableDownloadError(err)) throw err;
      }
    }
    throw lastErr instanceof Error ? lastErr : new ProviderError('FAL_DOWNLOAD_FAILED', 'fal download failed');
  }

  private async downloadOnce(url: string): Promise<{ buffer: Buffer; contentType: string }> {
    // Внутренние ретраи маленькие: политикой повторов владеет внешний цикл download().
    const res = await this.fetchWithRetry(url, { method: 'GET', headers: {} }, { connectionRetries: 1, retries: 0 });
    if (!res.ok) {
      throw new ProviderError('FAL_DOWNLOAD_FAILED', `fal download failed (${res.status})`, res.status);
    }
    const contentType = res.headers.get('content-type')?.split(';')[0]?.trim() ?? 'application/octet-stream';
    return { buffer: Buffer.from(await res.arrayBuffer()), contentType };
  }

  /** Проверка доступности/баланса. fal не даёт публичного balance endpoint в queue API — */
  /** делаем лёгкий ping к queue base, чтобы убедиться, что egress до fal жив. */
  async ping(): Promise<boolean> {
    try {
      const res = await this.fetchWithRetry(`${this.queueBaseUrl}/`, {
        method: 'GET',
        headers: { Authorization: `Key ${this.apiKey}` },
      }, { connectionRetries: 1, retries: 0 });
      // Любой HTTP-ответ (даже 404) означает, что сеть до fal работает.
      return res.status > 0;
    } catch {
      return false;
    }
  }

  /**
   * Загружает файл в хранилище fal (fal CDN) и возвращает публичный URL.
   * Нужно для видео-входов: base64-инлайн крупных файлов в JSON submit-запроса fal-очередь
   * отбивает как «payload too large» («ошибка размера»), даже если сам файл небольшой.
   * Поток fal (как в @fal-ai/client): POST /storage/upload/initiate -> { upload_url, file_url },
   * затем PUT байтов на upload_url; на вход моделей отдаём file_url.
   */
  async uploadToStorage(body: Buffer, contentType: string, fileName: string): Promise<string> {
    // Egress к fal.media (CDN) с RU-ВМ флапает, причём КОНКРЕТНЫЙ upload_url-хост (v3b/v3c/…) бывает
    // недоступен. Поэтому на обрыв повторяем ВЕСЬ цикл initiate+PUT: свежий initiate может вернуть
    // upload_url на другом, достижимом хосте. Долбить один и тот же недоступный хост бесполезно.
    let lastErr: unknown;
    for (let attempt = 0; attempt < UPLOAD_MAX_ATTEMPTS; attempt += 1) {
      try {
        return await this.uploadToStorageOnce(body, contentType, fileName);
      } catch (err) {
        lastErr = err;
        const message = (err as Error)?.message ?? '';
        const retriable = err instanceof ProviderError
          && (err.code === 'FAL_UPLOAD_NETWORK' || err.code === 'FAL_UPLOAD_INITIATE_FAILED')
          && !/timed out/.test(message);
        if (!retriable || attempt === UPLOAD_MAX_ATTEMPTS - 1) break;
        await delay(backoff(attempt + 1));
      }
    }
    throw lastErr instanceof Error ? lastErr : new ProviderError('FAL_UPLOAD_NETWORK', 'fal storage upload failed');
  }

  private async uploadToStorageOnce(body: Buffer, contentType: string, fileName: string): Promise<string> {
    const initiateUrl = `${REST_API_BASE}/storage/upload/initiate?storage_type=fal-cdn-v3`;
    let initiateRes: Response;
    try {
      initiateRes = await this.fetchWithRetry(initiateUrl, {
        method: 'POST',
        headers: this.jsonHeaders(),
        body: JSON.stringify({ content_type: contentType, file_name: fileName }),
      }, { connectionRetries: 2, retries: 1 });
    } catch (err) {
      throw new ProviderError('FAL_UPLOAD_INITIATE_FAILED', `fal storage initiate failed: ${(err as Error)?.message ?? 'unknown'}`);
    }
    const initiateJson = (await initiateRes.json().catch(() => ({}))) as Record<string, unknown>;
    if (!initiateRes.ok) {
      throw new ProviderError('FAL_UPLOAD_INITIATE_FAILED', `fal storage initiate failed (${initiateRes.status}): ${truncate(JSON.stringify(initiateJson))}`, initiateRes.status);
    }
    const uploadUrl = readString(initiateJson, 'upload_url');
    const fileUrl = readString(initiateJson, 'file_url');
    if (!uploadUrl || !fileUrl) {
      throw new ProviderError('FAL_UPLOAD_MALFORMED', `fal storage initiate returned no urls: ${truncate(JSON.stringify(initiateJson))}`);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
    try {
      const putRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': contentType },
        body: body as unknown as BodyInit,
        signal: controller.signal,
      });
      if (!putRes.ok) {
        throw new ProviderError('FAL_UPLOAD_PUT_FAILED', `fal storage upload failed (${putRes.status})`, putRes.status);
      }
      return fileUrl;
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      if ((err as Error)?.name === 'AbortError') {
        throw new ProviderError('FAL_UPLOAD_TIMEOUT', `fal storage upload timed out after ${UPLOAD_TIMEOUT_MS}ms`);
      }
      throw new ProviderError('FAL_UPLOAD_NETWORK', `fal storage upload failed: ${(err as Error)?.message ?? 'unknown'}`);
    } finally {
      clearTimeout(timer);
    }
  }

  private jsonHeaders() {
    return {
      'Content-Type': 'application/json',
      Authorization: `Key ${this.apiKey}`,
    };
  }

  /**
   * retries — повтор на HTTP 5xx (ответ пришёл = запрос дошёл).
   * connectionRetries — повтор ТОЛЬКО на transport-обрыв (fetch бросил, ответа не было).
   * Наш AbortController-таймаут не повторяется.
   */
  private async fetchWithRetry(
    url: string,
    init: RequestInit,
    opts: { retries: number; connectionRetries: number },
  ): Promise<Response> {
    let lastErr: unknown;
    let httpAttempts = 0;
    let connAttempts = 0;
    for (let i = 0; i < 1 + opts.retries + opts.connectionRetries; i += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.requestTimeoutMs);
      try {
        const res = await fetch(url, { ...init, signal: controller.signal });
        if (res.status >= 500 && httpAttempts < opts.retries) {
          httpAttempts += 1;
          await delay(backoff(httpAttempts));
          continue;
        }
        return res;
      } catch (err) {
        lastErr = err;
        const message = (err as Error)?.message ?? '';
        const isAbort = (err as Error)?.name === 'AbortError';
        const isTransient = !isAbort && TRANSIENT_CONNECTION_RE.test(message);
        if (isTransient && connAttempts < opts.connectionRetries) {
          connAttempts += 1;
          await delay(backoff(connAttempts));
          continue;
        }
        if (isAbort) {
          throw new ProviderError('FAL_TIMEOUT', `fal request timed out after ${this.requestTimeoutMs}ms: ${url}`);
        }
        throw new ProviderError('FAL_NETWORK_ERROR', `fal request failed: ${message}`, undefined, {
          cause: (err as { cause?: { code?: string } })?.cause?.code,
        });
      } finally {
        clearTimeout(timer);
      }
    }
    throw new ProviderError('FAL_NETWORK_ERROR', `fal request failed after retries: ${(lastErr as Error)?.message ?? 'unknown'}`);
  }
}

function backoff(attempt: number) {
  return Math.min(8_000, 500 * 2 ** (attempt - 1));
}

/** Транспортные обрывы/таймауты и 5xx ретраим; 4xx (нет файла/доступа) — нет. */
function isRetriableDownloadError(err: unknown): boolean {
  if (!(err instanceof ProviderError)) return false;
  if (err.code === 'FAL_NETWORK_ERROR' || err.code === 'FAL_TIMEOUT') return true;
  return err.code === 'FAL_DOWNLOAD_FAILED' && typeof err.status === 'number' && err.status >= 500;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

function readString(obj: Record<string, unknown>, key: string): string | undefined {
  const value = obj[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function truncate(value: string, max = 500) {
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

/**
 * fal возвращает стоимость по-разному в зависимости от модели; нередко её нет в output.
 * Пытаемся достать из распространённых полей, иначе undefined (упадём на estimate).
 */
/** Ищет content_policy_violation в теле ошибки fal (detail[]) и определяет, про аудио ли это. */
function findContentPolicyViolation(raw: unknown): { message: string; audio: boolean } | undefined {
  const obj = raw as Record<string, unknown> | undefined;
  const detail = obj?.detail;
  const items = Array.isArray(detail) ? detail : [];
  for (const item of items) {
    const it = item as Record<string, unknown>;
    if (it?.type === 'content_policy_violation') {
      const msg = typeof it.msg === 'string' ? it.msg : 'content policy violation';
      const loc = Array.isArray(it.loc) ? it.loc.join('.') : '';
      const audio = /audio/i.test(msg) || /audio/i.test(loc);
      return { message: msg, audio };
    }
  }
  return undefined;
}

function extractFalCost(json: Record<string, unknown>): number | undefined {
  const candidates = [
    (json.metrics as Record<string, unknown> | undefined)?.cost,
    (json as Record<string, unknown>).cost,
    (json as Record<string, unknown>).price,
  ];
  for (const c of candidates) {
    if (typeof c === 'number' && Number.isFinite(c) && c >= 0) return c;
  }
  return undefined;
}
