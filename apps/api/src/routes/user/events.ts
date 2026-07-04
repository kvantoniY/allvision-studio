import { Router, type Request, type Response } from 'express';
import IORedis from 'ioredis';
import { PROJECT_EVENTS_CHANNEL, parseProjectEvent } from '@allvision/shared';
import { requireAuth } from '../../middleware/auth';
import { logger } from '../../utils/logger';

/**
 * SSE-стрим realtime-событий по генерациям текущего пользователя.
 *
 * Worker публикует события (PROCESSING/progress/COMPLETED/FAILED) в Redis-канал
 * `allvision:project-events`; API держит ОДНОГО подписчика на процесс и раздаёт события
 * открытым EventSource-соединениям по userId. Фронт на событие инвалидирует кэши RTK Query —
 * результат появляется без перезагрузки и без зависимости от условий поллинга конкретной страницы.
 * Поллинг на страницах остаётся как фолбэк (Redis/SSE может быть недоступен).
 */
export const userEventsRouter = Router();

const clientsByUser = new Map<string, Set<Response>>();
let subscriber: IORedis | undefined;
let subscriberFailed = false;

function ensureSubscriber(): void {
  if (subscriber || subscriberFailed) return;
  try {
    subscriber = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
      enableOfflineQueue: true,
    });
    subscriber.on('error', (err) => {
      logger.warn(`[user-events] redis subscriber error: ${(err as Error).message}`);
    });
    subscriber.subscribe(PROJECT_EVENTS_CHANNEL).catch((err) => {
      logger.warn(`[user-events] failed to subscribe: ${(err as Error).message}`);
    });
    subscriber.on('message', (_channel, raw) => {
      const event = parseProjectEvent(raw);
      if (!event) return;
      const clients = clientsByUser.get(event.userId);
      if (!clients || clients.size === 0) return;
      const payload = `event: project\ndata: ${JSON.stringify({
        projectId: event.projectId,
        status: event.status,
        progress: event.progress,
        kind: event.kind,
      })}\n\n`;
      for (const res of clients) {
        try {
          res.write(payload);
        } catch {
          clients.delete(res);
        }
      }
    });
  } catch (err) {
    subscriberFailed = true;
    logger.warn(`[user-events] redis subscriber unavailable, SSE degraded: ${(err as Error).message}`);
  }
}

userEventsRouter.get('/', requireAuth, (req: Request, res: Response) => {
  const userId = req.user!.id;
  ensureSubscriber();

  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream');
  // no-transform обязателен: иначе compression()-middleware буферизует стрим и события не доходят.
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  // Просим nginx (docker + хостовый) не буферизовать проксируемый ответ.
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  res.write('retry: 3000\n\n');
  res.write(': connected\n\n');

  let clients = clientsByUser.get(userId);
  if (!clients) {
    clients = new Set();
    clientsByUser.set(userId, clients);
  }
  clients.add(res);

  // Heartbeat < 60s (proxy_read_timeout nginx), чтобы прокси не резали «тихое» соединение.
  const heartbeat = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch {
      // закрытие обработает 'close'
    }
  }, 25_000);

  req.on('close', () => {
    clearInterval(heartbeat);
    const set = clientsByUser.get(userId);
    if (set) {
      set.delete(res);
      if (set.size === 0) clientsByUser.delete(userId);
    }
  });
});
