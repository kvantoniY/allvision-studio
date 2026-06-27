'use client';

/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from 'react';

const DEFAULT_FALLBACK = '/mock_preview.png';

/**
 * Plain <img> that falls back to a placeholder when the source is missing OR
 * fails to load (broken URL, deleted upload). next/image can't swap a broken
 * remote URL, so service previews use this to guarantee a visible placeholder.
 */
export function FallbackImage({
  src,
  alt,
  className,
  fallback = DEFAULT_FALLBACK,
  loading = 'lazy',
}: {
  src?: string | null;
  alt: string;
  className?: string;
  fallback?: string;
  loading?: 'lazy' | 'eager';
}) {
  const initial = src && src.trim() ? src : fallback;
  const [current, setCurrent] = useState(initial);

  // Keep in sync if the incoming src changes (e.g. data loads in).
  useEffect(() => {
    setCurrent(src && src.trim() ? src : fallback);
  }, [src, fallback]);

  return (
    <img
      src={current}
      alt={alt}
      loading={loading}
      className={className}
      onError={() => {
        if (current !== fallback) setCurrent(fallback);
      }}
    />
  );
}
