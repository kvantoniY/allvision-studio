// === Протокол живого урока (A7): WebSocket сервер ↔ клиент ===
// Координаты рисования нормализованы (0..1) относительно вьюпорта сцены,
// чтобы масштабироваться на любой размер окна/полноэкранный режим.

import type { AcademySceneRuntimeEvent } from './scene-runtime';

export type LessonRole = 'teacher' | 'student';

export interface LessonPoint {
  x: number;
  y: number;
}

export interface LessonStroke {
  id: string;
  color: string;
  size: number;
  points: LessonPoint[];
}

export interface LessonChatEntry {
  id: string;
  role: LessonRole;
  authorName: string;
  body: string;
  createdAt: string;
}

export interface LessonPresence {
  teacher: boolean;
  student: boolean;
}

export interface LessonRoomState {
  sceneIndex: number;
  sceneCount: number;
  /** Учитель разблокировал интерактив/переход на текущей сцене. */
  unlocked: boolean;
  presence: LessonPresence;
  /** Штрихи рисования учителя для ТЕКУЩЕЙ сцены. */
  strokes: LessonStroke[];
}

/**
 * Сырое событие рантайма сцены, проксируемое между участниками.
 * Роль не принимаем от клиента: сервер добавляет проверенную роль отправителя в `from`.
 */
export type LessonSceneEvent = Omit<AcademySceneRuntimeEvent, 'role'>;

// --- Клиент → сервер ---
export type LessonClientMessage =
  | { t: 'nav'; sceneIndex: number } // teacher
  | { t: 'unlock'; value: boolean } // teacher
  | { t: 'draw-start'; id: string; color: string; size: number; point: LessonPoint } // teacher
  | { t: 'draw-append'; id: string; points: LessonPoint[] } // teacher
  | { t: 'draw-end'; id: string } // teacher
  | { t: 'draw-clear' } // teacher
  | { t: 'reward' } // teacher
  | { t: 'scene-event'; event: LessonSceneEvent } // interaction
  | { t: 'chat'; body: string }
  | { t: 'ping' };

// --- Сервер → клиент ---
export type LessonServerMessage =
  | { t: 'state'; role: LessonRole; state: LessonRoomState; chat: LessonChatEntry[] }
  | { t: 'nav'; sceneIndex: number; strokes: LessonStroke[] }
  | { t: 'unlock'; value: boolean }
  | { t: 'draw-start'; id: string; color: string; size: number; point: LessonPoint }
  | { t: 'draw-append'; id: string; points: LessonPoint[] }
  | { t: 'draw-end'; id: string }
  | { t: 'draw-clear' }
  | { t: 'reward' }
  | { t: 'scene-event'; event: LessonSceneEvent; from: LessonRole }
  | { t: 'chat'; entry: LessonChatEntry }
  | { t: 'presence'; presence: LessonPresence }
  | { t: 'error'; message: string }
  | { t: 'pong' };

export const LESSON_WS_PATH = '/ws/lesson';
export const LESSON_CHAT_MAX_LENGTH = 2000;
export const LESSON_DRAW_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#111827', '#ffffff'] as const;
