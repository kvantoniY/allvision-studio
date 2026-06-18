'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type ResultMediaProps = {
  type: 'image' | 'video';
  src: string;
  poster?: string;
  className?: string;
  videoControls?: boolean;
  videoMuted?: boolean;
  videoAutoPlay?: boolean;
  imgAlt?: string;
  onImageClick?: () => void;
};

// Готовый результат генерации (картинка/видео) не появляется мгновенно — файл ещё качается.
// Пока медиа не прогрузилось, показываем спиннер поверх, затем плавно проявляем результат.
//
// ВАЖНО: событие load может не сработать (закэшированное медиа, video preload=metadata, гонка при
// смене статуса) — поэтому НИКОГДА не держим результат скрытым бесконечно: есть проверка readyState
// на маунте и страховочный таймер, который раскрывает медиа в любом случае. Иначе результат был бы
// невидим до перезагрузки страницы.
export function ResultMedia({
  type,
  src,
  poster,
  className,
  videoControls,
  videoMuted,
  videoAutoPlay,
  imgAlt = 'Результат генерации',
  onImageClick,
}: ResultMediaProps) {
  const [loaded, setLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // На новый src снова показываем лоудер, но со страховочным таймером: даже если событие load
  // не придёт, результат раскроется и не останется невидимым до перезагрузки.
  useEffect(() => {
    setLoaded(false);
    const safety = window.setTimeout(() => setLoaded(true), 2500);
    return () => window.clearTimeout(safety);
  }, [src]);

  // Уже готовое медиа (кэш / пропущенное событие) — раскрываем сразу.
  useEffect(() => {
    if (type === 'image') {
      if (imgRef.current?.complete && imgRef.current.naturalWidth > 0) setLoaded(true);
    } else if (videoRef.current && videoRef.current.readyState >= 2) {
      setLoaded(true);
    }
  }, [type, src]);

  return (
    <span className="relative block">
      {!loaded && (
        <span className="pointer-events-none absolute inset-0 z-10 grid place-items-center bg-slate-950/70" aria-hidden>
          <Loader2 className="h-7 w-7 animate-spin text-amber-300" />
        </span>
      )}
      {type === 'video' ? (
        <video
          ref={videoRef}
          src={src}
          poster={poster}
          controls={videoControls}
          muted={videoMuted}
          autoPlay={videoAutoPlay}
          preload="metadata"
          className={cn('transition-opacity duration-300', loaded ? 'opacity-100' : 'opacity-0', className)}
          onLoadedMetadata={() => setLoaded(true)}
          onLoadedData={() => setLoaded(true)}
          onCanPlay={() => setLoaded(true)}
          onError={() => setLoaded(true)}
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={imgRef}
          src={src}
          alt={imgAlt}
          className={cn('transition-opacity duration-300', loaded ? 'opacity-100' : 'opacity-0', className)}
          onClick={onImageClick}
          onLoad={() => setLoaded(true)}
          onError={() => setLoaded(true)}
        />
      )}
    </span>
  );
}
