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

/**
 * Загруженные элементы для слоёв сцены.
 *
 * Konva рисует HTMLImageElement/HTMLVideoElement, поэтому их надо держать живыми и
 * переиспользовать: пересоздание video на каждый рендер перезагружало бы файл и давало
 * чёрные вспышки — та же ловушка, что была в прежнем плеере.
 */
export function useMediaElements(layers: MediaLayer[]): Map<string, LoadedMedia> {
  const cache = useRef(new Map<string, LoadedMedia>());
  const [, force] = useState(0);

  const wanted = useMemo(
    () =>
      layers
        .filter((layer) => layer.source.kind !== 'color')
        .map((layer) => ({ key: layer.id, url: mediaUrl(layer.source.url), isVideo: layer.source.kind === 'video' }))
        .filter((item): item is { key: string; url: string; isVideo: boolean } => Boolean(item.url)),
    [layers],
  );

  useEffect(() => {
    let cancelled = false;
    const seen = new Set<string>();

    for (const item of wanted) {
      const cacheKey = `${item.key}::${item.url}`;
      seen.add(cacheKey);
      if (cache.current.has(cacheKey)) continue;

      if (item.isVideo) {
        const video = document.createElement('video');
        video.src = item.url;
        video.crossOrigin = 'anonymous';
        video.playsInline = true;
        video.preload = 'auto';
        video.muted = true;
        video.onloadedmetadata = () => {
          if (cancelled) return;
          cache.current.set(cacheKey, {
            element: video,
            width: video.videoWidth || 1280,
            height: video.videoHeight || 720,
            isVideo: true,
          });
          force((value) => value + 1);
        };
      } else {
        const image = new window.Image();
        image.crossOrigin = 'anonymous';
        image.src = item.url;
        image.onload = () => {
          if (cancelled) return;
          cache.current.set(cacheKey, {
            element: image,
            width: image.naturalWidth || 1,
            height: image.naturalHeight || 1,
            isVideo: false,
          });
          force((value) => value + 1);
        };
      }
    }

    // Слои, которых больше нет, освобождаем — иначе десяток удалённых видео продолжит
    // держать буферы в памяти вкладки.
    for (const key of Array.from(cache.current.keys())) {
      if (seen.has(key)) continue;
      const entry = cache.current.get(key);
      if (entry?.isVideo) {
        const video = entry.element as HTMLVideoElement;
        video.pause();
        video.removeAttribute('src');
        video.load();
      }
      cache.current.delete(key);
    }

    return () => {
      cancelled = true;
    };
  }, [wanted]);

  // Ключи наружу отдаём по id слоя: вызывающему не нужно знать про склейку с URL.
  const byLayer = new Map<string, LoadedMedia>();
  for (const item of wanted) {
    const loaded = cache.current.get(`${item.key}::${item.url}`);
    if (loaded) byLayer.set(item.key, loaded);
  }
  return byLayer;
}
