'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Часы ролика.
 *
 * Вынесены из холста наверх, потому что время нужно двоим: предпросмотру и таймлайну.
 * Пока часы жили внутри холста, курсор на таймлайне показать было нечем — а без него
 * непонятно, какой кадр сейчас на экране.
 *
 * Считаем время сами, а не по `video.currentTime`: сцен несколько, а время ролика должно
 * идти непрерывно даже на картинках и заливках.
 */
export function usePlayback(totalSec: number) {
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const rafRef = useRef<number | null>(null);
  const clockRef = useRef<{ startedAt: number; offset: number } | null>(null);

  useEffect(() => {
    if (!playing) {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      clockRef.current = null;
      return;
    }
    clockRef.current = { startedAt: performance.now(), offset: time >= totalSec ? 0 : time };

    const tick = () => {
      const clock = clockRef.current;
      if (!clock) return;
      const next = clock.offset + (performance.now() - clock.startedAt) / 1000;
      if (next >= totalSec) {
        setTime(totalSec);
        setPlaying(false);
        return;
      }
      setTime(next);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
    // time меняется каждый кадр и перезапускал бы часы, поэтому его в зависимостях нет.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, totalSec]);

  /** Перемотка: всегда останавливает воспроизведение — иначе часы уедут от нового времени. */
  const seek = useCallback((next: number) => {
    setPlaying(false);
    setTime(Math.max(0, next));
  }, []);

  const toggle = useCallback(() => setPlaying((value) => !value), []);

  const rewind = useCallback(() => {
    setPlaying(false);
    setTime(0);
  }, []);

  return { time, playing, seek, toggle, rewind, setPlaying };
}

export type Playback = ReturnType<typeof usePlayback>;
