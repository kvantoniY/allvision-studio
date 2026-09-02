'use client';

import { useEffect, useState } from 'react';

/**
 * Форма звуковой волны для дорожки.
 *
 * Волна — это не украшение: по ней видно, где в треке пауза, где вступает голос и где
 * припев. Без неё резать звук приходится вслепую, на слух и наугад.
 *
 * Считаем в браузере: файл скачивается один раз, декодируется Web Audio и сворачивается
 * в набор пиков. Держать пики на сервере было бы правильнее для больших файлов, но это
 * ещё одна колонка в БД и шаг в загрузке ради картинки, которую браузер строит за
 * полсекунды.
 */

/** Пики нормализованы к 0..1. Один и тот же файл считаем один раз на вкладку. */
const cache = new Map<string, number[]>();
const pending = new Map<string, Promise<number[] | null>>();

const BUCKETS = 600;

async function computePeaks(src: string): Promise<number[] | null> {
  const AudioContextClass =
    typeof window === 'undefined'
      ? undefined
      : window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return null;

  const response = await fetch(src, { credentials: 'omit' });
  if (!response.ok) return null;
  const buffer = await response.arrayBuffer();

  const context = new AudioContextClass();
  try {
    const decoded = await context.decodeAudioData(buffer);
    const channel = decoded.getChannelData(0);
    const perBucket = Math.max(1, Math.floor(channel.length / BUCKETS));
    /*
     * Внутри корзины идём с шагом, а не по каждому сэмплу.
     *
     * У трёхминутного трека сэмплов почти девять миллионов, и полный проход — это десятки
     * миллисекунд синхронной работы в главном потоке: ровно тот микрофриз, который видно
     * при открытии редактора. Для картинки высотой в сорок пикселей каждый шестнадцатый
     * сэмпл даёт неотличимую форму.
     */
    const stride = Math.max(1, Math.floor(perBucket / 32));
    const peaks: number[] = [];
    let max = 0;
    for (let bucket = 0; bucket < BUCKETS; bucket += 1) {
      const from = bucket * perBucket;
      const to = Math.min(from + perBucket, channel.length);
      let peak = 0;
      for (let i = from; i < to; i += stride) {
        const value = Math.abs(channel[i]);
        if (value > peak) peak = value;
      }
      peaks.push(peak);
      if (peak > max) max = peak;
    }
    // Нормализуем: тихая запись должна читаться так же, как громкая.
    return max > 0 ? peaks.map((peak) => peak / max) : peaks;
  } catch {
    return null;
  } finally {
    void context.close();
  }
}

export function useWaveform(src: string | null | undefined): number[] | null {
  const [peaks, setPeaks] = useState<number[] | null>(() => (src ? cache.get(src) ?? null : null));

  useEffect(() => {
    if (!src) {
      setPeaks(null);
      return;
    }
    const known = cache.get(src);
    if (known) {
      setPeaks(known);
      return;
    }

    let cancelled = false;
    // Один запрос на файл, даже если дорожку разрезали на пять фрагментов.
    let task = pending.get(src);
    if (!task) {
      task = computePeaks(src).then((result) => {
        if (result) cache.set(src, result);
        pending.delete(src);
        return result;
      });
      pending.set(src, task);
    }
    void task.then((result) => {
      if (!cancelled && result) setPeaks(result);
    });

    return () => {
      cancelled = true;
    };
  }, [src]);

  return peaks;
}
