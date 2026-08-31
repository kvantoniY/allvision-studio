'use client';

import Link from 'next/link';
import { CheckCircle2, ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * Образы из Студии как варианты аватара.
 *
 * Кнопка «Открыть Студию» стоит рядом с самой полкой, а не в ряду с загрузкой файла:
 * она про то же действие — взять готовый образ, — и её место здесь.
 */
export function StudioAvatarPicker({
  items,
  isLoading,
  selectedUrl,
  busy,
  onSelect,
}: {
  items: Array<{ id: string; title: string; publicUrl: string; thumbnailUrl?: string | null }>;
  isLoading: boolean;
  selectedUrl: string | null;
  busy: boolean;
  onSelect: (url: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <ImageIcon className="h-3.5 w-3.5" />
          Образы из Студии
        </span>
        <Button asChild variant="outline" size="sm" className="h-8 border-slate-700 bg-slate-900 text-xs">
          <Link href="/studio">Открыть Студию</Link>
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="aspect-square rounded-lg" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-800 p-3 text-sm text-slate-500">
          В Студии пока нет образов. Загруженное фото появится здесь автоматически.
        </p>
      ) : (
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
          {items.map((asset) => {
            const selected = selectedUrl === asset.publicUrl;
            return (
              <button
                key={asset.id}
                type="button"
                disabled={busy}
                onClick={() => onSelect(asset.publicUrl)}
                title={asset.title}
                className={cn(
                  'group relative aspect-square overflow-hidden rounded-lg border bg-slate-900 transition hover:border-violet-400',
                  selected ? 'border-violet-400 ring-2 ring-violet-500/40' : 'border-slate-800',
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={asset.thumbnailUrl || asset.publicUrl} alt="" className="h-full w-full object-cover" />
                {selected && (
                  <span className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-violet-600 text-white">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
