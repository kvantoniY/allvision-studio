'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Часы ролика.
 *
 * Вынесены из холста наверх, потому что время нужно двоим: предпросмотру и таймлайну.
 * Пока часы жили внутри холста, курсор на таймлайне показать было нечем — а без него
 * непонятно, какой кадр сейчас на экране.
 *
 * Считаем время сами, а не по `video.currentTime`: сцен несколько, а время ролика должно
 * идти непрерывно даже на картинках и заливках.
 *
 * Точное время живёт в ref и раздаётся подписчикам напрямую, минуя React. Раньше каждый
 * кадр записывался в состояние, и всё дерево редактора — шкала со всеми клипами, панели,
 * инспектор — перерисовывалось шестьдесят раз в секунду. Перетаскивание ползунка при этом
 * подвешивало вкладку. Теперь в состоянии лежит ГРУБОЕ время: оно меняется несколько раз в
 * секунду и нужно только тем, кто принимает по нему решения (какая сцена в кадре, доступна
 * ли резка). Плавные вещи — линия курсора, ползунок, подпись времени — подписываются и
 * двигают DOM сами.
 */

/** Шаг грубого времени в состоянии: достаточно, чтобы выбрать сцену, и в 12 раз реже кадра. */
const COARSE_STEP_SEC = 0.2;

export function usePlayback(totalSec: number) {
  const [playing, setPlaying] = useState(false);
  /** Грубое время для React-логики. Точное — в timeRef. */
  const [time, setCoarseTime] = useState(0);
  const timeRef = useRef(0);
  const listeners = useRef(new Set<(seconds: number) => void>());
  const rafRef = useRef<number | null>(null);
  const clockRef = useRef<{ startedAt: number; offset: number } | null>(null);

  const publish = useCallback((next: number) => {
    timeRef.current = next;
    for (const listener of listeners.current) listener(next);
    // В состояние пишем, только когда время ушло заметно далеко: перерисовка дерева стоит
    // на порядки дороже, чем сдвиг одной линии курсора.
    setCoarseTime((current) => (Math.abs(current - next) >= COARSE_STEP_SEC ? next : current));
  }, []);

  const subscribe = useCallback((listener: (seconds: number) => void) => {
    listeners.current.add(listener);
    listener(timeRef.current);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  useEffect(() => {
    if (!playing) {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      clockRef.current = null;
      // На стопе состояние обязано совпасть с точным временем: дальше по нему считают всё.
      setCoarseTime(timeRef.current);
      return;
    }
    const from = timeRef.current >= totalSec ? 0 : timeRef.current;
    clockRef.current = { startedAt: performance.now(), offset: from };

    const tick = () => {
      const clock = clockRef.current;
      if (!clock) return;
      const next = clock.offset + (performance.now() - clock.startedAt) / 1000;
      if (next >= totalSec) {
        publish(totalSec);
        setCoarseTime(totalSec);
        setPlaying(false);
        return;
      }
      publish(next);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [playing, totalSec, publish]);

  /** Перемотка: всегда останавливает воспроизведение — иначе часы уедут от нового времени. */
  const seek = useCallback(
    (next: number) => {
      setPlaying(false);
      const value = Math.max(0, next);
      publish(value);
      /*
       * Перемотка обновляет состояние сразу, без порога: человек тянет ползунок ровно
       * затем, чтобы найти кадр, и картинка обязана идти за рукой. Событий мыши тут не
       * больше одного на кадр, а сам рендер стал дешёвым — раскладка ролика кэшируется
       * по ссылке, и видео-элементы больше не пересоздаются.
       */
      setCoarseTime(value);
    },
    [publish],
  );

  const toggle = useCallback(() => setPlaying((value) => !value), []);

  const rewind = useCallback(() => {
    setPlaying(false);
    publish(0);
    setCoarseTime(0);
  }, [publish]);

  const getTime = useCallback(() => timeRef.current, []);

  return useMemo(
    () => ({ time, playing, seek, toggle, rewind, setPlaying, subscribe, getTime }),
    [time, playing, seek, toggle, rewind, subscribe, getTime],
  );
}

export type Playback = ReturnType<typeof usePlayback>;
