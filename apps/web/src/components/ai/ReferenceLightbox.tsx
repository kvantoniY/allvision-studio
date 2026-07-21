'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Download, RotateCcw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export type ReferenceLightboxItem = {
  url: string;
  mediaKind: 'image' | 'video' | 'audio';
  title?: string;
};

/** Полноэкранный просмотр референса/результата: картинка или видео + скачать + опц. переиспользовать. */
export function ReferenceLightbox({
  item,
  onClose,
  onReuse,
}: {
  item: ReferenceLightboxItem;
  onClose: () => void;
  onReuse?: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[220] flex flex-col bg-black/95 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 p-3" onClick={(event) => event.stopPropagation()}>
        <span className="min-w-0 truncate text-sm text-muted-foreground">{item.title ?? 'Референс'}</span>
        <div className="flex shrink-0 items-center gap-2">
          {onReuse && (
            <Button type="button" size="sm" variant="outline" className="border-border bg-card text-foreground hover:bg-accent" onClick={onReuse}>
              <RotateCcw className="h-4 w-4" />
              Переиспользовать
            </Button>
          )}
          <Button asChild size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90">
            <a href={item.url} download target="_blank" rel="noopener">
              <Download className="h-4 w-4" />
              Скачать
            </a>
          </Button>
          <Button type="button" variant="outline" size="icon" className="border-white/20 bg-white/10 text-foreground hover:bg-white/20" onClick={onClose} aria-label="Закрыть">
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center p-3 sm:p-6" onClick={onClose}>
        {item.mediaKind === 'video' ? (
          <video src={item.url} controls autoPlay className="max-h-full max-w-full rounded-md" onClick={(event) => event.stopPropagation()} />
        ) : item.mediaKind === 'audio' ? (
          <audio src={item.url} controls autoPlay onClick={(event) => event.stopPropagation()} />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.url} alt={item.title ?? ''} className="max-h-full max-w-full rounded-md object-contain" onClick={(event) => event.stopPropagation()} />
        )}
      </div>
    </div>,
    document.body,
  );
}
