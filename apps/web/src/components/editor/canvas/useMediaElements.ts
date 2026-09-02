'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { MediaLayer } from '@allvision/shared';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:4000');

export function mediaUrl(value?: string | null) {
  if (!value) return null;
  if (value.startsWith('/static/')) return `${API_URL}${value}`;
  return value;
}

export type LoadedMedia = {
  element: HTMLImageElement | HTMLVideoElement;
  width: number;
  height: number;
  isVideo: boolean;
};

type Wanted = { key: string; url: string; isVideo: boolean };

/**
 * Загруженные элементы для слоёв сцены.
 *
 * Konva рисует HTMLImageElement/HTMLVideoElement, поэтому их надо держать живыми и
 * переиспользовать: пересоздание video на каждый рендер перезагружало бы файл и давало
 * чёрные вспышки — та же ловушка, что была в прежнем плеере.
 *
 * Здесь два независимых учёта. `ready` — то, что уже загрузилось и готово к отрисовке;
 * `loading` — то, что мы УЖЕ создали и чего ждём. Без второго набора элемент считался
 * несуществующим до самого `loadedmetadata`, и на каждый рендер (а во время
 * проигрывания это каждый кадр) создавался ещё один `<video preload="auto">` с тем же
 * адресом. Полсекунды загрузки превращались в десятки параллельных скачиваний одного
 * файла, вкладка упиралась в память и переставала отвечать — особенно на переходе, где
 * на экране сразу два холста.
 */
export function useMediaElements(layers: MediaLayer[]): Map<string, LoadedMedia> {
  const ready = useRef(new Map<string, LoadedMedia>());
  const loading = useRef(new Map<string, HTMLImageElement | HTMLVideoElement>());
  const [version, force] = useState(0);

  /*
   * Ключ считаем строкой, а не полагаемся на ссылку массива: сцена пересобирается на
   * каждый кадр проигрывания, и по ссылке список слоёв всегда «новый», хотя содержимое
   * то же. Из-за этого эффект перезапускался шестьдесят раз в секунду.
   */
  const signature = layers
    .filter((layer) => layer.source.kind !== 'color')
    .map((layer) => `${layer.id}::${mediaUrl(layer.source.url) ?? ''}::${layer.source.kind}`)
    .join('|');

  const wanted = useMemo<Wanted[]>(
    () =>
      signature
        .split('|')
        .filter(Boolean)
        .map((entry) => {
          const [key, url, kind] = entry.split('::');
          return { key, url, isVideo: kind === 'video' };
        })
        .filter((item) => Boolean(item.url)),
    [signature],
  );

  useEffect(() => {
    const seen = new Set<string>();

    for (const item of wanted) {
      const cacheKey = `${item.key}::${item.url}`;
      seen.add(cacheKey);
      if (ready.current.has(cacheKey) || loading.current.has(cacheKey)) continue;

      if (item.isVideo) {
        const video = document.createElement('video');
        loading.current.set(cacheKey, video);
        video.crossOrigin = 'anonymous';
        video.playsInline = true;
        video.preload = 'auto';
        video.muted = true;
        video.onloadedmetadata = () => {
          if (!loading.current.has(cacheKey)) return;
          loading.current.delete(cacheKey);
          ready.current.set(cacheKey, {
            element: video,
            width: video.videoWidth || 1280,
            height: video.videoHeight || 720,
            isVideo: true,
          });
          force((value) => value + 1);
        };
        // Битую ссылку нельзя оставлять «вечно загружающейся»: иначе следующий проход
        // снова начнёт её тянуть. Забываем — и больше не пробуем в этой сессии.
        video.onerror = () => {
          loading.current.delete(cacheKey);
        };
        video.src = item.url;
      } else {
        const image = new window.Image();
        loading.current.set(cacheKey, image);
        image.crossOrigin = 'anonymous';
        image.onload = () => {
          if (!loading.current.has(cacheKey)) return;
          loading.current.delete(cacheKey);
          ready.current.set(cacheKey, {
            element: image,
            width: image.naturalWidth || 1,
            height: image.naturalHeight || 1,
            isVideo: false,
          });
          force((value) => value + 1);
        };
        image.onerror = () => {
          loading.current.delete(cacheKey);
        };
        image.src = item.url;
      }
    }

    // Слои, которых больше нет, освобождаем — иначе десяток удалённых видео продолжит
    // держать буферы в памяти вкладки.
    for (const key of Array.from(ready.current.keys())) {
      if (seen.has(key)) continue;
      const entry = ready.current.get(key);
      if (entry?.isVideo) {
        const video = entry.element as HTMLVideoElement;
        video.pause();
        video.removeAttribute('src');
        video.load();
      }
      ready.current.delete(key);
    }
    for (const key of Array.from(loading.current.keys())) {
      if (seen.has(key)) continue;
      const element = loading.current.get(key);
      if (element instanceof HTMLVideoElement) {
        element.pause();
        element.removeAttribute('src');
        element.load();
      }
      loading.current.delete(key);
    }
  }, [wanted]);

  // При размонтировании глушим всё: элементы живут в ref, а не в разметке, и после
  // закрытия холста продолжали играть — звук доигрывал уже после остановки предпросмотра.
  useEffect(() => () => {
    for (const entry of ready.current.values()) {
      if (!entry.isVideo) continue;
      const video = entry.element as HTMLVideoElement;
      video.pause();
      video.removeAttribute('src');
      video.load();
    }
    ready.current.clear();
    for (const element of loading.current.values()) {
      if (!(element instanceof HTMLVideoElement)) continue;
      element.pause();
      element.removeAttribute('src');
      element.load();
    }
    loading.current.clear();
  }, []);

  /*
   * Карту отдаём мемоизированной: она уходит в зависимости эффектов холста, и новая ссылка
   * на каждый рендер заставляла бы их работать вхолостую каждый кадр. Пересобираем только
   * когда изменился состав слоёв или что-то догрузилось.
   */
  return useMemo(() => {
    const byLayer = new Map<string, LoadedMedia>();
    for (const item of wanted) {
      const loaded = ready.current.get(`${item.key}::${item.url}`);
      if (loaded) byLayer.set(item.key, loaded);
    }
    return byLayer;
    // version — сигнал «что-то догрузилось»: содержимое ref сам React не отслеживает.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted, version]);
}
