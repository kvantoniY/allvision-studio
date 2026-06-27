'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

type ImageWithSkeletonProps = React.ImgHTMLAttributes<HTMLImageElement> & {
  // Класс контейнера (берёт на себя размеры/позиционирование вместо самого img).
  wrapperClassName?: string;
  // Подставляется, если основной src не загрузился (битый/удалённый файл).
  fallbackSrc?: string;
};

// <img> с серым шиммер-плейсхолдером, пока картинка грузится. Контейнер задаёт размер,
// картинка плавно проявляется по onLoad.
export function ImageWithSkeleton({
  wrapperClassName,
  className,
  alt = '',
  onLoad,
  onError,
  fallbackSrc,
  src,
  ...props
}: ImageWithSkeletonProps) {
  const [loaded, setLoaded] = useState(false);
  const [currentSrc, setCurrentSrc] = useState(src);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    setCurrentSrc(src);
  }, [src]);

  // Если картинка уже закэширована, onLoad может не сработать после гидратации —
  // тогда проверяем complete на маунте, чтобы img не остался невидимым (opacity-0).
  useEffect(() => {
    if (imgRef.current?.complete && imgRef.current.naturalWidth > 0) {
      setLoaded(true);
    }
  }, []);

  return (
    <span className={cn('relative block overflow-hidden bg-muted/40', wrapperClassName)}>
      {!loaded && (
        <span className="pointer-events-none absolute inset-0 bg-muted/60" aria-hidden>
          <span className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-foreground/10 to-transparent" />
        </span>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        {...props}
        ref={imgRef}
        src={currentSrc}
        alt={alt}
        onLoad={(event) => {
          setLoaded(true);
          onLoad?.(event);
        }}
        onError={(event) => {
          if (fallbackSrc && currentSrc !== fallbackSrc) {
            setCurrentSrc(fallbackSrc);
            return;
          }
          setLoaded(true);
          onError?.(event);
        }}
        className={cn('transition-opacity duration-500', loaded ? 'opacity-100' : 'opacity-0', className)}
      />
    </span>
  );
}
