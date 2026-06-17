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
// Сбрасывается на новый src автоматически (используйте key={src} при необходимости).
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

  // На новый src снова показываем лоудер.
  useEffect(() => {
    setLoaded(false);
  }, [src]);

  // Закэшированная картинка может не вызвать onLoad после гидратации — проверяем complete.
  useEffect(() => {
    if (type === 'image' && imgRef.current?.complete && imgRef.current.naturalWidth > 0) {
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
          src={src}
          poster={poster}
          controls={videoControls}
          muted={videoMuted}
          autoPlay={videoAutoPlay}
          preload="metadata"
          className={cn('transition-opacity duration-300', loaded ? 'opacity-100' : 'opacity-0', className)}
          onLoadedData={() => setLoaded(true)}
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
