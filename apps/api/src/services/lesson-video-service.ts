import { AccessToken } from 'livekit-server-sdk';
import type { LessonRole } from '@allvision/shared';
import { logger } from '../utils/logger';

/**
 * Видеосвязь урока (A8): выдача access-токена LiveKit участнику комнаты.
 * Ключи живут только на сервере; клиент получает короткоживущий токен на
 * КОНКРЕТНУЮ комнату урока и не может подключиться к чужой.
 */

const TOKEN_TTL_SECONDS = 60 * 60 * 4; // урок 25/45 мин + запас на переподключения

export interface LessonVideoConfig {
  url: string;
  apiKey: string;
  apiSecret: string;
}

/**
 * Читает конфиг из окружения. `LIVEKIT_KEYS` имеет формат самого LiveKit
 * ("APIkey: secret") — держим один источник правды для сервера и API.
 */
export function readLessonVideoConfig(): LessonVideoConfig | null {
  const url = process.env.LIVEKIT_URL?.trim();
  if (!url) return null;

  const explicitKey = process.env.LIVEKIT_API_KEY?.trim();
  const explicitSecret = process.env.LIVEKIT_API_SECRET?.trim();
  if (explicitKey && explicitSecret) return { url, apiKey: explicitKey, apiSecret: explicitSecret };

  const keys = process.env.LIVEKIT_KEYS?.trim();
  if (keys) {
    const [apiKey, apiSecret] = keys.split(':').map((part) => part.trim());
    if (apiKey && apiSecret) return { url, apiKey, apiSecret };
  }
  logger.warn('[lesson-video] LIVEKIT_URL задан, но ключи не найдены — видеосвязь выключена');
  return null;
}

export function isLessonVideoEnabled(): boolean {
  return readLessonVideoConfig() !== null;
}

/** Имя комнаты LiveKit жёстко привязано к уроку. */
export function lessonRoomName(lessonId: string): string {
  return `lesson-${lessonId}`;
}

export async function createLessonVideoToken(params: {
  lessonId: string;
  userId: string;
  role: LessonRole;
  displayName: string;
}): Promise<{ url: string; token: string; room: string } | null> {
  const config = readLessonVideoConfig();
  if (!config) return null;

  const room = lessonRoomName(params.lessonId);
  const at = new AccessToken(config.apiKey, config.apiSecret, {
    // identity уникальна на пользователя: перезаход вытесняет прошлую сессию,
    // а не плодит дубли плиток в комнате.
    identity: `${params.role}-${params.userId}`,
    name: params.displayName,
    ttl: TOKEN_TTL_SECONDS,
  });
  at.addGrant({
    room,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });

  return { url: config.url, token: await at.toJwt(), room };
}
