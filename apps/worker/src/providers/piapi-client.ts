import https from 'node:https';
import http from 'node:http';
import tls from 'node:tls';
import type { Socket } from 'node:net';
import crypto from 'node:crypto';
import { ProviderError } from './provider-errors';

// Опциональный прокси ТОЛЬКО для синхронного gpt-image edits: маршрут РФ ВМ -> api.piapi.ai
// интермиттентно рвёт длинное multipart-соединение (подтверждено: ~50% ECONNRESET напрямую,
// 0% через зарубежный прокси). Через прокси (зарубежный egress) запрос идёт стабильно.
// Async-модели (createTask/poll) надёжны и идут НАПРЯМУЮ, чтобы не зависеть от прокси.
// Реализовано на встроенных node-модулях (CONNECT-туннель), без внешних зависимостей,
// чтобы отсутствие пакета в образе не валило воркер.
const PIAPI_PROXY_URL = process.env.PIAPI_PROXY_URL?.trim() || undefined;

// Открывает HTTP CONNECT-туннель через прокси к target:port и отдаёт сырой сокет.
function openProxyTunnel(proxyUrl: string, targetHost: string, targetPort: number, timeoutMs: number): Promise<Socket> {
  const u = new URL(proxyUrl);
  const headers: Record<string, string> = { Host: `${targetHost}:${targetPort}` };
  if (u.username) {
    const cred = Buffer.from(`${decodeURIComponent(u.username)}:${decodeURIComponent(u.password)}`).toString('base64');
    headers['Proxy-Authorization'] = `Basic ${cred}`;
  }
  return new Promise<Socket>((resolve, reject) => {
    const req = http.request({
      host: u.hostname,
      port: Number(u.port) || 80,
      method: 'CONNECT',
      path: `${targetHost}:${targetPort}`,
      headers,
      timeout: timeoutMs,
    });
    req.once('connect', (res, socket) => {
      if (res.statusCode === 200) {
        resolve(socket);
      } else {
        socket.destroy();
        reject(new ProviderError('PIAPI_PROXY_CONNECT', `proxy CONNECT failed: HTTP ${res.statusCode}`));
      }
    });
    req.once('timeout', () => req.destroy(new ProviderError('PIAPI_PROXY_TIMEOUT', 'proxy CONNECT timed out')));
    req.once('error', (err) =>
      reject(err instanceof ProviderError ? err : new ProviderError('PIAPI_PROXY_ERROR', `proxy connect: ${(err as Error).message}`)),
    );
    req.end();
  });
}

export interface PiAPITaskStatus {
  taskId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress?: number;
  outputUrl?: string;
  actualCostUsd: number | null;
  raw: Record<string, unknown>;
  errorCode?: string;
  errorMessage?: string;
}

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

export interface PiAPIPollOptions {
  timeoutMs: number;
  expectedDurationMs: number;
  onProgress?: (progress: number) => Promise<void>;
}

export interface PiAPIClientOptions {
  apiKey: string;
  baseUrl?: string;
  requestTimeoutMs?: number;
  gptImageTimeoutMs?: number;
}

const TRANSIENT_RETRIES = 2;
// gpt-image edit: сколько раз пробуем заново при РАННЕМ обрыве соединения (RST до первого
// байта ответа). Такой обрыв означает, что запрос не дошёл до бэкенда PiAPI (задача не
// создаётся и не биллится), поэтому повтор безопасен. Обрыв интермиттентный — несколько
// попыток обычно дают успешную (наблюдение P9.4.4).
const GPT_IMAGE_EDIT_DEFAULT_ATTEMPTS = 4;
const GPT_IMAGE_EDIT_RETRY_DELAYS_MS = [2_000, 5_000, 10_000];
// Обрыв позже этого порога без ответа уже неоднозначен: генерация (40-100s) могла начаться
// на стороне провайдера. Такие не ретраим — отдаём в history recovery.
const GPT_IMAGE_EDIT_EARLY_RESET_WINDOW_MS = 30_000;
// Сколько раз повторять СОЗДАНИЕ unified-задачи при транспортном обрыве (запрос не дошёл).
const CREATE_TASK_CONNECTION_RETRIES = 3;
// Сколько ПОДРЯД неудачных статус-опросов pollUntilDone терпит, прежде чем сдаться.
// Каждый опрос внутри уже делает TRANSIENT_RETRIES сетевых попыток, так что 10 подряд
// означает несколько минут полной недоступности PiAPI, а не случайный обрыв.
const MAX_CONSECUTIVE_POLL_ERRORS = 10;
const PIAPI_COST_UNITS_PER_USD = 10_000_000;

export class PiAPIClient {
  private baseUrl: string;
  private apiKey: string;
  private requestTimeoutMs: number;
  // GPT Image идёт синхронным запросом: ответ приходит только когда изображение
  // уже сгенерировано, а это регулярно дольше обычных 30s. Поэтому отдельный,
  // более щедрый таймаут, иначе AbortController рвёт соединение, а PiAPI всё
  // равно успевает выполнить (и списать) задачу.
  private gptImageTimeoutMs: number;

  constructor(options: PiAPIClientOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? 'https://api.piapi.ai').replace(/\/+$/, '');
    this.requestTimeoutMs = options.requestTimeoutMs ?? 30_000;
    this.gptImageTimeoutMs = options.gptImageTimeoutMs
      ?? (Number(process.env.PIAPI_GPT_IMAGE_TIMEOUT_MS) || 300_000);
  }

  async createTask(payload: unknown): Promise<{ taskId: string; raw: Record<string, unknown> }> {
    // Транспортный обрыв запроса СОЗДАНИЯ задачи (fetch бросил, ответа не было) означает,
    // что задача не зарегистрировалась у PiAPI и не биллится — повтор безопасен. Поэтому
    // до 3 попыток ТОЛЬКО на connection-ошибки. HTTP-ответы (4xx/5xx) и наш таймаут не
    // повторяются (retries: 1): они означают, что запрос дошёл и задача могла создаться,
    // иначе словили бы дубль-генерацию. Это покрывает кейс «отправили в PiAPI, а он даже
    // не начал генерацию» для unified-моделей (nano-banana, kling, omni, seedance...).
    const raw = await this.requestJson('/api/v1/task', {
      method: 'POST',
      body: JSON.stringify(payload),
    }, { retries: 1, connectionRetries: CREATE_TASK_CONNECTION_RETRIES });
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
    let consecutivePollErrors = 0;

    while (Date.now() - startedAt < opts.timeoutMs) {
      let status: PiAPITaskStatus;
      try {
        status = await this.getTask(taskId);
        consecutivePollErrors = 0;
      } catch (err) {
        // Транзиентный сбой СТАТУС-опроса не должен ронять генерацию: задача на стороне
        // PiAPI продолжает выполняться, и следующий опрос обычно проходит. Жёсткие 4xx
        // (битый taskId / невалидный ключ) пробрасываем сразу — они не лечатся повтором.
        if (err instanceof ProviderError && err.status && err.status >= 400 && err.status < 500) throw err;
        consecutivePollErrors += 1;
        if (consecutivePollErrors >= MAX_CONSECUTIVE_POLL_ERRORS) throw err;
        console.warn(
          `[piapi] poll ${taskId}: status check failed (${consecutivePollErrors}/${MAX_CONSECUTIVE_POLL_ERRORS}), retrying: ${(err as Error).message}`,
        );
        await delay(intervalMs);
        intervalMs = Math.min(30_000, Math.round(intervalMs * 1.5));
        continue;
      }
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
        classifyFailureCode(status.errorCode, status.errorMessage),
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

    const raw = await this.requestJson(`/api/open/tasks/histories?${query.toString()}`, { method: 'GET' });
    return {
      raw,
      tasks: extractHistoryRecords(raw).map(normaliseHistoryTask),
    };
  }

  async download(url: string): Promise<{ buffer: Buffer; contentType: string }> {
    const res = await this.fetchWithRetry(url, { method: 'GET', headers: {} }, false);
    const contentType = res.headers.get('content-type')?.split(';')[0]?.trim() ?? 'application/octet-stream';
    return { buffer: Buffer.from(await res.arrayBuffer()), contentType };
  }

  // GPT Image (OpenAI через PiAPI) живёт НЕ на unified /api/v1/task, а на
  // OpenAI-совместимых эндпоинтах. Без референсов — /v1/images/generations (JSON),
  // с референсами — /v1/images/edits (multipart, каждое фото полем `image`).
  async generateGptImage(params: {
    model: string;
    prompt: string;
    images: Array<{ buffer: Buffer; contentType: string }>;
    size: string;
    quality: string;
    outputFormat?: string;
  }): Promise<{ url?: string; b64?: string }> {
    // Edits go through a raw https request (multipart with an explicit Content-Length + TCP keepalive).
    // The undici/fetch multipart upload was being reset by the gateway at ~15s (ECONNRESET) while the
    // generation waits ~60s; a clean, complete, content-length request behaves like the JSON one.
    if (params.images.length > 0) {
      return this.gptImageEditViaHttps(params);
    }
    const jsonBody = JSON.stringify({
      model: params.model,
      prompt: params.prompt,
      n: 1,
      size: params.size,
      quality: params.quality,
      ...(params.outputFormat ? { output_format: params.outputFormat } : {}),
      response_format: 'url',
    });
    // При заданном прокси generations (text-to-image: карусель, обложки) тоже идут через
    // зарубежный egress, иначе они остаются на нестабильном РФ-маршруте.
    let json: Record<string, unknown>;
    if (PIAPI_PROXY_URL) {
      json = await this.gptImageJsonViaHttps('/v1/images/generations', jsonBody);
    } else {
      const res = await this.fetchWithRetry(`${this.baseUrl}/v1/images/generations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
        body: jsonBody,
      }, true, { timeoutMs: this.gptImageTimeoutMs, retries: 1 });
      json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    }
    const result = readGptImageResult(json);
    if (!result.url && !result.b64) {
      const raw = JSON.stringify(json).slice(0, 400);
      throw new ProviderError(emptyGptImageCode(raw), `GPT Image returned no image: ${raw}`);
    }
    return result;
  }

  // JSON POST через прокси-туннель (для gpt-image generations). Тот же транспорт, что у edits.
  private async gptImageJsonViaHttps(path: string, jsonBody: string): Promise<Record<string, unknown>> {
    const url = new URL(`${this.baseUrl}${path}`);
    const targetHost = url.hostname;
    const targetPort = Number(url.port) || 443;
    const body = Buffer.from(jsonBody, 'utf8');
    const tunnel = PIAPI_PROXY_URL
      ? await openProxyTunnel(PIAPI_PROXY_URL, targetHost, targetPort, 30_000)
      : undefined;
    return new Promise<Record<string, unknown>>((resolve, reject) => {
      const req = https.request(
        {
          method: 'POST',
          host: targetHost,
          port: targetPort,
          path: url.pathname + url.search,
          headers: {
            Host: targetHost,
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            'Content-Length': body.length,
          },
          timeout: this.gptImageTimeoutMs,
          ...(tunnel ? { createConnection: () => tls.connect({ socket: tunnel, servername: targetHost }) } : {}),
        },
        (res) => {
          const data: Buffer[] = [];
          res.on('data', (chunk) => data.push(Buffer.from(chunk)));
          res.on('end', () => {
            const text = Buffer.concat(data).toString('utf8');
            const status = res.statusCode ?? 0;
            if (status >= 400) {
              reject(new ProviderError(`PIAPI_HTTP_${status}`, text.slice(0, 400) || `gpt-image generations HTTP ${status}`, status));
              return;
            }
            try {
              resolve(JSON.parse(text) as Record<string, unknown>);
            } catch {
              reject(new ProviderError('PIAPI_BAD_RESPONSE', 'gpt-image generations returned non-JSON'));
            }
          });
        },
      );
      req.on('socket', (socket) => socket.setKeepAlive(true, 5_000));
      req.on('timeout', () => req.destroy(new ProviderError('PIAPI_TIMEOUT', `gpt-image generations timed out after ${this.gptImageTimeoutMs}ms`)));
      req.on('error', (err) =>
        reject(err instanceof ProviderError ? err : new ProviderError('PIAPI_NETWORK_ERROR', `gpt-image generations: ${(err as Error).message}`)),
      );
      req.write(body);
      req.end();
    });
  }

  // The gateway intermittently resets the long-held gpt-image edit connection. Two distinct modes,
  // disambiguated by whether response bytes had started and how early the reset happened:
  //  - EARLY reset (~15s, no response byte): the request never reached the PiAPI backend — no task is
  //    ever registered in provider history, nothing is billed (verified against the PiAPI dashboard).
  //    Retrying immediately is safe and is the only thing that helps; history recovery has nothing
  //    to recover in this mode.
  //  - LATE reset / our timeout: the upstream may already be rendering (a disconnect does not cancel
  //    it and it WILL be billed) — never retry, let history recovery pick up the finished output.
  private async gptImageEditViaHttps(params: {
    model: string;
    prompt: string;
    images: Array<{ buffer: Buffer; contentType: string }>;
    size: string;
    quality: string;
    outputFormat?: string;
  }): Promise<{ url?: string; b64?: string }> {
    const maxAttempts = Number(process.env.PIAPI_GPT_IMAGE_EDIT_RETRIES) || GPT_IMAGE_EDIT_DEFAULT_ATTEMPTS;
    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await this.gptImageEditOnce(params);
      } catch (err) {
        lastError = err;
        if (!isEarlyGptImageEditReset(err) || attempt === maxAttempts) {
          if (isEarlyGptImageEditReset(err) && err instanceof ProviderError) {
            // Все попытки оборвались ДО первого байта ответа: запрос так и не дошёл до
            // провайдера, задачи в history не будет. Провайдер по этому флагу пропускает
            // бесполезный 5-минутный history recovery и сразу честно фейлит с refund.
            err.meta = { ...err.meta, neverReachedProvider: true, attempts: attempt };
          }
          throw err;
        }
        console.warn(
          `[piapi] gpt-image edit: early connection reset before any response byte `
          + `(attempt ${attempt}/${maxAttempts}), retrying: ${(err as Error).message}`,
        );
        await delay(GPT_IMAGE_EDIT_RETRY_DELAYS_MS[Math.min(attempt - 1, GPT_IMAGE_EDIT_RETRY_DELAYS_MS.length - 1)]);
      }
    }
    throw lastError;
  }

  // Raw https multipart POST to /v1/images/edits. Sends the whole body with a fixed Content-Length
  // (not chunked/streamed) and enables TCP keepalive, which fixes the ~15s ECONNRESET seen with fetch.
  private async gptImageEditOnce(params: {
    model: string;
    prompt: string;
    images: Array<{ buffer: Buffer; contentType: string }>;
    size: string;
    quality: string;
    outputFormat?: string;
  }): Promise<{ url?: string; b64?: string }> {
    const boundary = `----allvision${crypto.randomBytes(12).toString('hex')}`;
    const crlf = '\r\n';
    const chunks: Buffer[] = [];
    const field = (name: string, value: string) => {
      chunks.push(Buffer.from(`--${boundary}${crlf}Content-Disposition: form-data; name="${name}"${crlf}${crlf}${value}${crlf}`, 'utf8'));
    };
    field('model', params.model);
    field('prompt', params.prompt);
    field('n', '1');
    field('size', params.size);
    field('quality', params.quality);
    if (params.outputFormat) field('output_format', params.outputFormat);
    field('response_format', 'url');
    for (const image of params.images) {
      const contentType = image.contentType || 'image/png';
      const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
      chunks.push(Buffer.from(`--${boundary}${crlf}Content-Disposition: form-data; name="image"; filename="ref.${ext}"${crlf}Content-Type: ${contentType}${crlf}${crlf}`, 'utf8'));
      chunks.push(image.buffer);
      chunks.push(Buffer.from(crlf, 'utf8'));
    }
    chunks.push(Buffer.from(`--${boundary}--${crlf}`, 'utf8'));
    const body = Buffer.concat(chunks);
    const url = new URL(`${this.baseUrl}/v1/images/edits`);
    const startedAt = Date.now();
    // PiAPI отвечает только когда изображение готово, поэтому первый байт ответа —
    // надёжный признак «запрос дошёл и обработан». Обрыв ДО него на ранней секунде
    // означает, что запрос потерян по дороге (см. gptImageEditViaHttps).
    let responseStarted = false;
    const targetHost = url.hostname;
    const targetPort = Number(url.port) || 443;

    // При заданном PIAPI_PROXY_URL поднимаем CONNECT-туннель и пускаем TLS через него
    // (зарубежный egress). Туннель открываем ДО https.request.
    const tunnel = PIAPI_PROXY_URL
      ? await openProxyTunnel(PIAPI_PROXY_URL, targetHost, targetPort, 30_000)
      : undefined;

    return new Promise((resolve, reject) => {
      const req = https.request(
        {
          method: 'POST',
          host: targetHost,
          port: targetPort,
          path: url.pathname + url.search,
          headers: {
            Host: targetHost,
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
            'Content-Length': body.length,
          },
          timeout: this.gptImageTimeoutMs,
          ...(tunnel ? { createConnection: () => tls.connect({ socket: tunnel, servername: targetHost }) } : {}),
        },
        (res) => {
          responseStarted = true;
          const data: Buffer[] = [];
          res.on('data', (chunk) => data.push(Buffer.from(chunk)));
          res.on('end', () => {
            const text = Buffer.concat(data).toString('utf8');
            const status = res.statusCode ?? 0;
            if (status >= 400) {
              reject(new ProviderError(`PIAPI_HTTP_${status}`, text.slice(0, 400) || `gpt-image edit HTTP ${status}`, status));
              return;
            }
            try {
              const json = JSON.parse(text) as Record<string, unknown>;
              const result = readGptImageResult(json);
              if (!result.url && !result.b64) {
                // 200 без картинки — обычно отказ модерации gpt-image по конкретному фото.
                // Кладём сырой ответ в сообщение для диагностики и мапим в CONTENT_MODERATION,
                // если в теле есть признаки отказа (тогда юзер видит понятную причину).
                reject(new ProviderError(emptyGptImageCode(text), `GPT Image edit returned no image: ${text.slice(0, 400)}`));
                return;
              }
              resolve(result);
            } catch (parseErr) {
              if (parseErr instanceof ProviderError) reject(parseErr);
              else reject(new ProviderError('PIAPI_BAD_RESPONSE', 'gpt-image edit returned non-JSON'));
            }
          });
        },
      );
      // TCP keepalive so the gateway does not treat the long wait for the response as idle.
      req.on('socket', (socket) => {
        socket.setKeepAlive(true, 5_000);
      });
      req.on('timeout', () => {
        req.destroy(new ProviderError('PIAPI_TIMEOUT', `gpt-image edit timed out after ${this.gptImageTimeoutMs}ms`));
      });
      req.on('error', (err) => {
        if (err instanceof ProviderError) {
          err.meta = { ...err.meta, responseStarted, elapsedMs: Date.now() - startedAt };
          reject(err);
          return;
        }
        // Размер тела в сообщении: сразу видно в AI-логах, был ли обрыв связан с тяжёлым upload.
        reject(new ProviderError(
          'PIAPI_NETWORK_ERROR',
          `gpt-image edit: ${(err as Error).message} (multipart body ${body.length} bytes)`,
          undefined,
          { responseStarted, elapsedMs: Date.now() - startedAt },
        ));
      });
      req.write(body);
      req.end();
    });
  }

  private async requestJson(
    path: string,
    init: RequestInit,
    opts?: { timeoutMs?: number; retries?: number; connectionRetries?: number },
  ): Promise<Record<string, unknown>> {
    const res = await this.fetchWithRetry(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey,
        ...(init.headers ?? {}),
      },
    }, true, opts);
    const json = await res.json().catch(() => ({}));
    if (!json || typeof json !== 'object' || Array.isArray(json)) {
      throw new ProviderError('PIAPI_BAD_RESPONSE', 'PiAPI returned non-object JSON');
    }
    return json as Record<string, unknown>;
  }

  // retries           — макс. попыток на HTTP 5xx (ответ ПРИШЁЛ, запрос дошёл до PiAPI).
  // connectionRetries — макс. попыток на transport-обрыв (fetch бросил, ОТВЕТА не было,
  //                     значит запрос не дошёл — повтор безопасен). По умолчанию = retries.
  // Наш AbortController-таймаут не повторяется никогда: задача могла уйти в работу.
  private async fetchWithRetry(
    url: string,
    init: RequestInit,
    parseErrorJson: boolean,
    opts?: { timeoutMs?: number; retries?: number; connectionRetries?: number },
  ): Promise<Response> {
    const timeoutMs = opts?.timeoutMs ?? this.requestTimeoutMs;
    const httpRetries = opts?.retries ?? TRANSIENT_RETRIES;
    const connectionRetries = opts?.connectionRetries ?? httpRetries;
    const maxAttempts = Math.max(httpRetries, connectionRetries, 1);
    let httpAttempts = 0;
    let connectionAttempts = 0;
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(url, { ...init, signal: controller.signal });
        if (res.ok) return res;
        if (res.status >= 400 && res.status < 500) {
          const message = parseErrorJson ? await readErrorMessage(res) : res.statusText;
          throw new ProviderError(`PIAPI_HTTP_${res.status}`, message || res.statusText, res.status);
        }
        httpAttempts += 1;
        lastError = new ProviderError(`PIAPI_HTTP_${res.status}`, res.statusText, res.status);
        if (httpAttempts >= httpRetries) throw lastError as ProviderError;
      } catch (err) {
        if (err instanceof ProviderError && err.status && err.status >= 400 && err.status < 500) throw err;
        // 5xx, исчерпавший httpRetries, пробрасываем как есть.
        if (err instanceof ProviderError && err.status && err.status >= 500) throw err;
        // Наш собственный таймаут (AbortController) не повторяем: задача могла уже
        // уйти в работу на стороне PiAPI, а повтор привёл бы к двойному списанию.
        if ((err as Error)?.name === 'AbortError') {
          throw new ProviderError('PIAPI_TIMEOUT', `PiAPI request timed out after ${timeoutMs}ms`);
        }
        connectionAttempts += 1;
        lastError = err;
        if (connectionAttempts >= connectionRetries) break;
      } finally {
        clearTimeout(timer);
      }

      await delay(500 * attempt);
    }

    if (lastError instanceof ProviderError) throw lastError;
    const err = lastError as (Error & { cause?: { code?: string; message?: string } }) | undefined;
    const cause = err?.cause ? ` (cause: ${err.cause.code ?? err.cause.message ?? String(err.cause)})` : '';
    throw new ProviderError('PIAPI_NETWORK_ERROR', `${err?.message ?? 'PiAPI network error'}${cause}`);
  }
}

// Ранний обрыв gpt-image edit: connection-level ошибка, ДО первого байта ответа и в первые
// секунды запроса. Только такие безопасно повторять — запрос не дошёл до бэкенда PiAPI.
function isEarlyGptImageEditReset(error: unknown): error is ProviderError {
  if (!(error instanceof ProviderError)) return false;
  if (error.code !== 'PIAPI_NETWORK_ERROR') return false;
  if (!/ECONNRESET|socket hang up|EPIPE|ECONNREFUSED|ETIMEDOUT/i.test(error.message)) return false;
  if (error.meta?.responseStarted !== false) return false;
  const elapsedMs = typeof error.meta?.elapsedMs === 'number' ? error.meta.elapsedMs : Number.POSITIVE_INFINITY;
  return elapsedMs <= GPT_IMAGE_EDIT_EARLY_RESET_WINDOW_MS;
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
  ]) ?? findFirstArrayString(data, [
    ['output', 'image_urls'],
    ['output', 'video_urls'],
    ['image_urls'],
    ['video_urls'],
  ]) ?? readKlingWorkUrl(data);
  const progress = readNumber(data, ['progress']) ?? readNumber(data, ['meta', 'progress']);
  const errorMessage = readString(data, ['error', 'message'])
    ?? readString(data, ['error_message'])
    ?? readString(data, ['message'])
    ?? findFirstArrayString(data, [['logs']]);
  const errorCode = readCode(data, ['error', 'code']) ?? readCode(data, ['error_code']);
  return {
    taskId,
    status,
    progress,
    outputUrl,
    actualCostUsd: extractPiAPIActualCostUsd(raw),
    raw,
    errorCode,
    errorMessage,
  };
}

// Классифицирует провал задачи PiAPI. Модерация контента важнее общего кода,
// чтобы пользователь видел понятную причину, а не "задача не выполнена".
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

// 200 без картинки от gpt-image обычно означает отказ модерации по конкретному контенту.
// Если в сыром теле есть явные признаки отказа — отдаём CONTENT_MODERATION (понятное
// сообщение юзеру), иначе PIAPI_EMPTY_OUTPUT.
function emptyGptImageCode(rawBody: string): string {
  const lower = rawBody.toLowerCase();
  return /moderat|safety|policy|content[_ ]?policy|violat|rejected|declined|not allowed|cannot|unable|refus|нельзя|политик|запрещ|отклон/.test(lower)
    ? 'CONTENT_MODERATION'
    : 'PIAPI_EMPTY_OUTPUT';
}

function readGptImageResult(json: Record<string, unknown>): { url?: string; b64?: string } {
  const data = Array.isArray(json.data) ? json.data : [];
  const first = data.find((item) => item && typeof item === 'object' && !Array.isArray(item)) as Record<string, unknown> | undefined;
  return {
    url: first ? readString(first, ['url']) : undefined,
    b64: first ? readString(first, ['b64_json']) : undefined,
  };
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
  ]) ?? readKlingWorkUrl(data);
}

function classifyFailureCode(errorCode: string | undefined, errorMessage: string | undefined): string {
  const text = `${errorCode ?? ''} ${errorMessage ?? ''}`.toLowerCase();
  if (/10001|upstream.*busy|too many requests|rate limit|try again later|temporar(?:y|ily).*busy|overloaded/.test(text)) {
    return 'PIAPI_UPSTREAM_BUSY';
  }
  if (/violat|community guidelines|moderat|nsfw|content policy|policy violation|safety policy|unsafe content/.test(text)) {
    return 'CONTENT_MODERATION';
  }
  return errorCode ?? 'PIAPI_TASK_FAILED';
}

export function extractPiAPIActualCostUsd(raw: Record<string, unknown>): number | null {
  const consume = readNumber(raw, ['data', 'meta', 'usage', 'consume'])
    ?? readNumber(raw, ['meta', 'usage', 'consume']);
  if (consume !== undefined) {
    return consume / PIAPI_COST_UNITS_PER_USD;
  }

  const directUsd = readNumber(raw, ['data', 'meta', 'usage', 'cost_usd'])
    ?? readNumber(raw, ['data', 'meta', 'cost_usd'])
    ?? readNumber(raw, ['data', 'cost_usd'])
    ?? readNumber(raw, ['meta', 'usage', 'cost_usd'])
    ?? readNumber(raw, ['meta', 'cost_usd'])
    ?? readNumber(raw, ['cost_usd']);
  return directUsd ?? null;
}

function readKlingWorkUrl(source: Record<string, unknown>): string | undefined {
  const output = readObject(source, ['output']);
  const works = Array.isArray(output?.works) ? output?.works : source.works;
  if (!Array.isArray(works)) return undefined;
  const first = works.find((item) => item && typeof item === 'object') as Record<string, unknown> | undefined;
  if (!first) return undefined;
  return readString(first, ['video', 'resource_without_watermark'])
    ?? readString(first, ['video', 'resource'])
    ?? readString(first, ['cover', 'resource'])
    ?? readString(first, ['resource_without_watermark'])
    ?? readString(first, ['resource'])
    ?? readString(first, ['url']);
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

function readCode(source: Record<string, unknown>, path: string[]): string | undefined {
  const value = readPath(source, path);
  if (typeof value === 'string' && value.length > 0) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
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

function findFirstArrayString(source: Record<string, unknown>, paths: string[][]): string | undefined {
  for (const path of paths) {
    const value = readPath(source, path);
    if (Array.isArray(value)) {
      const found = value.find((item): item is string => typeof item === 'string' && item.length > 0);
      if (found) return found;
    }
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

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
