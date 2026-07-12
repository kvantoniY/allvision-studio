import IORedis from 'ioredis';
import { PROJECT_EVENTS_CHANNEL, type ProjectEventPayload } from '@allvision/shared';
import { logger } from './logger';

let publisher: IORedis | undefined;
let warned = false;

function getPublisher(): IORedis | undefined {
  if (process.env.NODE_ENV === 'test') return undefined;
  if (!publisher) {
    try {
      publisher = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
        maxRetriesPerRequest: 1,
        lazyConnect: false,
        enableOfflineQueue: false,
      });
      publisher.on('error', (err) => {
        if (!warned) {
          warned = true;
          logger.warn(`[project-events] redis publisher error (events degrade to polling): ${(err as Error).message}`);
        }
      });
    } catch (err) {
      logger.warn(`[project-events] failed to create redis publisher: ${(err as Error).message}`);
      return undefined;
    }
  }
  return publisher;
}

/**
 * Fire-and-forget публикация realtime-события по проекту из API-процесса (зеркало worker-версии).
 * Нужна там, где проект финализируется НЕ worker'ом: piapi-recovery/reconciler. Никогда не бросает;
 * при недоступном Redis фронт просто остаётся на поллинге.
 */
export function publishProjectEvent(event: ProjectEventPayload): void {
  const client = getPublisher();
  if (!client) return;
  client.publish(PROJECT_EVENTS_CHANNEL, JSON.stringify(event)).catch(() => undefined);
}
