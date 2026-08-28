import type { Timeline } from './types';

/**
 * История правок ролика.
 *
 * Чистые функции, а не хук: отмена — это правила, а не разметка, и их надо уметь проверить
 * тестами. Редактор держит эту структуру в состоянии и вызывает функции отсюда.
 *
 * В `past` лежат ПРЕДЫДУЩИЕ состояния, а текущее живёт в самом редакторе: так отмена не
 * зависит от того, успел ли редактор записать последнюю правку.
 */
export type TimelineHistory = {
  past: Timeline[];
  future: Timeline[];
  /** Момент последней записи — по нему склеиваются частые правки. */
  lastPushAt: number;
};

/** Глубина истории. Дальше растёт память вкладки, а до сотого шага никто не отматывает. */
export const TIMELINE_HISTORY_LIMIT = 50;

/**
 * Окно склейки. Набор текста в титре даёт правку на каждый символ, и без склейки отмена
 * стирала бы по одной букве. Перетаскивание слоя записывается один раз в конце, поэтому
 * от склейки не страдает.
 */
export const TIMELINE_HISTORY_COALESCE_MS = 600;

export function createTimelineHistory(): TimelineHistory {
  return { past: [], future: [], lastPushAt: 0 };
}

/**
 * Записывает состояние ДО правки.
 *
 * Частые правки подряд склеиваются: отмена возвращает к состоянию до всей серии, а не
 * к предпоследнему нажатию клавиши.
 */
export function pushTimelineHistory(
  history: TimelineHistory,
  previous: Timeline,
  at: number,
  coalesceMs: number = TIMELINE_HISTORY_COALESCE_MS,
): TimelineHistory {
  const coalesce = history.past.length > 0 && at - history.lastPushAt < coalesceMs;
  if (coalesce) {
    // Точку отмены не двигаем, но новую правку считаем свежей: серия продолжается.
    return { past: history.past, future: [], lastPushAt: at };
  }

  const past = [...history.past, previous].slice(-TIMELINE_HISTORY_LIMIT);
  // Любая новая правка обрывает ветку повтора: возвращать уже некуда.
  return { past, future: [], lastPushAt: at };
}

/** Отмена. Возвращает null, когда отматывать нечего. */
export function undoTimeline(
  history: TimelineHistory,
  current: Timeline,
): { history: TimelineHistory; timeline: Timeline } | null {
  if (history.past.length === 0) return null;
  const timeline = history.past[history.past.length - 1];
  return {
    timeline,
    history: {
      past: history.past.slice(0, -1),
      future: [current, ...history.future].slice(0, TIMELINE_HISTORY_LIMIT),
      // Сбрасываем окно склейки: правка после отмены — это уже новая серия.
      lastPushAt: 0,
    },
  };
}

/** Повтор отменённого. */
export function redoTimeline(
  history: TimelineHistory,
  current: Timeline,
): { history: TimelineHistory; timeline: Timeline } | null {
  if (history.future.length === 0) return null;
  const [timeline, ...rest] = history.future;
  return {
    timeline,
    history: {
      past: [...history.past, current].slice(-TIMELINE_HISTORY_LIMIT),
      future: rest,
      lastPushAt: 0,
    },
  };
}
