import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';
import { uploadChatInput } from '../../middleware/upload';
import { HttpError } from '../../utils/http-error';
import { logger } from '../../utils/logger';

/**
 * Каталог голосов Lumean для интерфейса.
 *
 * Проксируем, а не отдаём ключ на фронт: ключ Lumean — это доступ к балансу владельца, в
 * браузере ему не место. Заодно приводим ответ к нашей форме, чтобы интерфейс не знал про
 * особенности их API (страницы с нуля, обёртка внутри `data`).
 */

export const voicesRouter = Router();

voicesRouter.use(requireAuth);

const BASE_URL = process.env.LUMEAN_BASE_URL ?? 'https://api.lumean.app/api/public';
/** Каталог меняется редко, а запросов к нему много: держим ответы в памяти процесса. */
const CACHE_TTL_MS = 10 * 60 * 1000;

const querySchema = z.object({
  search: z.string().trim().max(120).optional(),
  gender: z.enum(['male', 'female']).optional(),
  language: z.string().trim().max(10).optional(),
  page: z.coerce.number().int().min(0).max(200).default(0),
  pageSize: z.coerce.number().int().min(1).max(60).default(24),
});

type CacheEntry = { at: number; payload: unknown };
const cache = new Map<string, CacheEntry>();

voicesRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const apiKey = process.env.LUMEAN_API_KEY;
    if (!apiKey) {
      throw new HttpError(503, 'LUMEAN_NOT_CONFIGURED', 'Голосовой сервис не подключён');
    }

    const query = querySchema.parse(req.query);
    const params = new URLSearchParams({
      page: String(query.page),
      page_size: String(query.pageSize),
    });
    if (query.search) params.set('search', query.search);
    if (query.gender) params.set('gender', query.gender);
    if (query.language) params.set('required_languages', query.language);

    const cacheKey = params.toString();
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
      res.json(cached.payload);
      return;
    }

    const response = await fetch(`${BASE_URL}/voices/elevenlabs/library?${cacheKey}`, {
      headers: { 'X-API-KEY': apiKey, Accept: 'application/json' },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      logger.warn(`[voices] Lumean ответил ${response.status}`);
      throw new HttpError(502, 'VOICES_UNAVAILABLE', 'Каталог голосов временно недоступен');
    }

    const body = await response.json() as { data?: { voices?: Array<Record<string, unknown>>; total?: number; has_more?: boolean } };
    const payload = {
      voices: (body.data?.voices ?? [])
        .map((raw) => ({
          voiceId: String(raw.voice_id ?? ''),
          name: String(raw.name ?? 'Без имени'),
          gender: typeof raw.gender === 'string' ? raw.gender : null,
          language: typeof raw.language === 'string' ? raw.language : null,
          accent: typeof raw.accent === 'string' ? raw.accent : null,
          previewUrl: typeof raw.preview_url === 'string' ? raw.preview_url : null,
          description: typeof raw.description === 'string' ? raw.description : null,
        }))
        .filter((voice) => voice.voiceId.length > 0),
      total: Number(body.data?.total ?? 0),
      hasMore: Boolean(body.data?.has_more),
      page: query.page,
    };

    cache.set(cacheKey, { at: Date.now(), payload });
    res.json(payload);
  } catch (err) {
    next(err);
  }
});

/**
 * Поиск голоса по образцу.
 *
 * Человек загружает запись — сервис ищет в каталоге похожие голоса. У Lumean это обычный
 * заказ, который считается несколько секунд, поэтому мы дожидаемся его прямо в запросе:
 * заводить ради поиска отдельную очередь и экран ожидания — избыточно, а держать
 * пользователя в неведении дольше минуты мы и не станем.
 */
voicesRouter.post('/search', uploadChatInput, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const apiKey = process.env.LUMEAN_API_KEY;
    if (!apiKey) throw new HttpError(503, 'LUMEAN_NOT_CONFIGURED', 'Голосовой сервис не подключён');

    const file = (req as Request & { file?: Express.Multer.File }).file;
    if (!file) throw new HttpError(400, 'FILE_REQUIRED', 'Приложите запись голоса');

    const form = new FormData();
    form.append('task_type', 'voice_search');
    form.append('task_data[top]', '12');
    // Buffer -> Uint8Array: Blob не принимает Node-буфер напрямую, а копия здесь дешёвая.
    const bytes = new Uint8Array(file.buffer);
    form.append('input_files[]', new Blob([bytes], { type: file.mimetype }), file.originalname || 'sample.mp3');

    const created = await fetch(`${BASE_URL}/orders`, {
      method: 'POST',
      headers: { 'X-API-KEY': apiKey, Accept: 'application/json' },
      body: form,
      signal: AbortSignal.timeout(60_000),
    });
    if (!created.ok) {
      logger.warn(`[voices] поиск отклонён: ${created.status}`);
      throw new HttpError(502, 'VOICE_SEARCH_FAILED', 'Не удалось запустить поиск голоса');
    }
    const order = (await created.json()) as { data?: { id?: string } };
    const orderId = order.data?.id;
    if (!orderId) throw new HttpError(502, 'VOICE_SEARCH_FAILED', 'Сервис не принял запись');

    // Ждём результат: обычно 10–20 секунд. Дольше минуты не держим — вернём понятный отказ.
    const deadline = Date.now() + 60_000;
    let resultPath: string | undefined;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      const poll = await fetch(`${BASE_URL}/orders/${orderId}`, {
        headers: { 'X-API-KEY': apiKey, Accept: 'application/json' },
        signal: AbortSignal.timeout(20_000),
      });
      const body = (await poll.json()) as { data?: { status?: string; result?: { files?: string[] } } };
      const status = body.data?.status;
      if (status === 'completed' || status === 'result_delivered') {
        resultPath = body.data?.result?.files?.[0];
        break;
      }
      if (status && ['failed', 'cancelled', 'compensated'].includes(status)) {
        throw new HttpError(502, 'VOICE_SEARCH_FAILED', 'Сервис не смог разобрать запись');
      }
    }
    if (!resultPath) throw new HttpError(504, 'VOICE_SEARCH_TIMEOUT', 'Поиск занял слишком долго — попробуйте ещё раз');

    const link = await fetch(`${BASE_URL}/storage/url`, {
      method: 'POST',
      headers: { 'X-API-KEY': apiKey, Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: resultPath }),
      signal: AbortSignal.timeout(20_000),
    });
    const linkBody = (await link.json()) as { data?: { url?: string } };
    if (!linkBody.data?.url) throw new HttpError(502, 'VOICE_SEARCH_FAILED', 'Не удалось получить результат поиска');

    const payload = await (await fetch(linkBody.data.url, { signal: AbortSignal.timeout(20_000) })).json() as {
      found?: boolean;
      truncated?: boolean;
      hits?: Array<Record<string, unknown>>;
    };

    res.json({
      // found=false означает лишь «нет уверенного совпадения»; похожие голоса всё равно есть,
      // и показать их полезнее, чем сказать «ничего не найдено».
      exactMatch: Boolean(payload.found),
      truncated: Boolean(payload.truncated),
      voices: (payload.hits ?? []).map((hit) => ({
        voiceId: String(hit.voice_id ?? ''),
        name: String(hit.name ?? 'Без имени'),
        gender: typeof hit.gender === 'string' ? hit.gender : null,
        language: typeof hit.language === 'string' ? hit.language : null,
        accent: typeof hit.accent === 'string' ? hit.accent : null,
        previewUrl: typeof hit.preview_url === 'string' ? hit.preview_url : null,
        description: null,
        similarity: typeof hit.probability === 'number' ? Math.round(hit.probability) : null,
      })).filter((voice) => voice.voiceId.length > 0),
    });
  } catch (err) {
    next(err);
  }
});
