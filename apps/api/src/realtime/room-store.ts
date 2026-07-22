import IORedis, { type Redis } from 'ioredis';
import type { LessonStroke } from '@allvision/shared';
import { logger } from '../utils/logger';

/**
 * Redis-хранилище состояния комнаты урока (A7.1): переживает рестарт API и
 * восстанавливается при перезаходе/перезагрузке страницы. Чат хранится в БД отдельно.
 * Один API-процесс на проде → Redis используется только для персистентности,
 * не для cross-instance pub/sub (это долг при горизонтальном масштабировании).
 */

export interface PersistedRoom {
  sceneIndex: number;
  unlocked: boolean;
  strokesByScene: Record<number, LessonStroke[]>;
}

const ROOM_TTL_SECONDS = 24 * 60 * 60;
const key = (lessonId: string) => `lesson:room:${lessonId}`;

let client: Redis | undefined;
let warned = false;

function getClient(): Redis | undefined {
  if (process.env.NODE_ENV === 'test') return undefined;
  if (!client) {
    try {
      client = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
        maxRetriesPerRequest: 2,
        lazyConnect: false,
        enableOfflineQueue: false,
      });
      client.on('error', (err) => {
        if (!warned) {
          warned = true;
          logger.warn(`[room-store] redis error (комната работает in-memory): ${err.message}`);
        }
      });
    } catch (err) {
      logger.warn(`[room-store] не удалось создать redis-клиент: ${(err as Error).message}`);
      return undefined;
    }
  }
  return client;
}

export async function loadRoom(lessonId: string): Promise<PersistedRoom | null> {
  const c = getClient();
  if (!c) return null;
  try {
    const raw = await c.get(key(lessonId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedRoom;
    if (typeof parsed.sceneIndex !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Fire-and-forget сохранение (вызывается дебаунсом из lesson-ws). Никогда не бросает. */
export function saveRoom(lessonId: string, data: PersistedRoom): void {
  const c = getClient();
  if (!c) return;
  // Ограничиваем объём штрихов, чтобы не раздувать значение.
  const trimmed: PersistedRoom = {
    sceneIndex: data.sceneIndex,
    unlocked: data.unlocked,
    strokesByScene: {},
  };
  for (const [idx, strokes] of Object.entries(data.strokesByScene)) {
    trimmed.strokesByScene[Number(idx)] = strokes.slice(-400);
  }
  c.set(key(lessonId), JSON.stringify(trimmed), 'EX', ROOM_TTL_SECONDS).catch(() => undefined);
}

export function clearRoom(lessonId: string): void {
  getClient()?.del(key(lessonId)).catch(() => undefined);
}
