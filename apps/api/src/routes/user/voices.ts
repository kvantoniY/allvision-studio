import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';
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
