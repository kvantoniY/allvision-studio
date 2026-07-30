// === Протокол живого урока (A7): WebSocket сервер ↔ клиент ===
// Координаты рисования нормализованы (0..1) относительно вьюпорта сцены,
// чтобы масштабироваться на любой размер окна/полноэкранный режим.

import type { AcademySceneRuntimeEvent } from './scene-runtime';
import type { MiniGameState } from './mini-games';

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

/** Состояние одного участника комнаты — для индикаторов в окне урока. */
export interface LessonParticipantState {
  /** Есть открытое соединение с комнатой. */
  online: boolean;
  /** Окно/вкладка урока активны (не свёрнуты, не в другой вкладке). */
  focused: boolean;
  /** Панель чата открыта — видно, читает ли собеседник сообщения. */
  inChat: boolean;
  /** Микрофон разрешён и включён. */
  micOn: boolean;
  /** Сейчас говорит (уровень звука выше порога). */
  speaking: boolean;
}

export interface LessonPresence {
  teacher: LessonParticipantState;
  student: LessonParticipantState;
}

export const EMPTY_PARTICIPANT_STATE: LessonParticipantState = {
  online: false,
  focused: false,
  inChat: false,
  micOn: false,
  speaking: false,
};

export interface LessonRoomState {
  sceneIndex: number;
  sceneCount: number;
  /** Учитель разблокировал интерактив/переход на текущей сцене. */
  unlocked: boolean;
  presence: LessonPresence;
  /** Штрихи рисования учителя для ТЕКУЩЕЙ сцены. */
  strokes: LessonStroke[];
  /**
   * Прогресс мини-игр ТЕКУЩЕЙ сцены (elementId → снимок). Хранится в комнате, поэтому
   * ход ученика виден учителю, а перезагрузка страницы не сбрасывает игру.
   */
  games: Record<string, MiniGameState>;
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
  // Ход в мини-игре: шлётся снимок состояния, а не дельта — так проще пережить
  // перезагрузку и разъезд состояний между ролями.
  | { t: 'game'; elementId: string; state: MiniGameState }
  // Индикаторы участника: активность вкладки, открытый чат, микрофон и речь.
  | { t: 'status'; focused?: boolean; inChat?: boolean; micOn?: boolean; speaking?: boolean }
  | { t: 'chat'; body: string }
  // Учитель завершил урок: ученик сразу видит экран результата, не дожидаясь поллинга.
  | { t: 'finish' }
  | { t: 'ping' };

// --- Сервер → клиент ---
export type LessonServerMessage =
  | { t: 'state'; role: LessonRole; state: LessonRoomState; chat: LessonChatEntry[] }
  | { t: 'nav'; sceneIndex: number; strokes: LessonStroke[]; games: Record<string, MiniGameState> }
  | { t: 'unlock'; value: boolean }
  | { t: 'draw-start'; id: string; color: string; size: number; point: LessonPoint }
  | { t: 'draw-append'; id: string; points: LessonPoint[] }
  | { t: 'draw-end'; id: string }
  | { t: 'draw-clear' }
  | { t: 'reward' }
  | { t: 'scene-event'; event: LessonSceneEvent; from: LessonRole }
  | { t: 'game'; elementId: string; state: MiniGameState; from: LessonRole }
  | { t: 'chat'; entry: LessonChatEntry }
  | { t: 'presence'; presence: LessonPresence }
  | { t: 'finished' }
  | { t: 'error'; message: string }
  | { t: 'pong' };

export const LESSON_WS_PATH = '/ws/lesson';
export const LESSON_CHAT_MAX_LENGTH = 2000;
export const LESSON_DRAW_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#111827', '#ffffff'] as const;
