'use client';

import { ArrowLeft, ArrowRight, Copy, Film, ImageIcon, Palette, Plus, Trash2 } from 'lucide-react';
import { formatTimelineDuration, primaryMediaLayer, sceneDurationSec, type Timeline, type TimelineScene } from '@allvision/shared';
import { cn } from '@/lib/utils';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:4000');

function mediaUrl(value?: string | null) {
  if (!value) return null;
  if (value.startsWith('/static/')) return `${API_URL}${value}`;
  return value;
}

function SceneThumb({ scene }: { scene: TimelineScene }) {
  // Миниатюру показывает главный слой сцены — тот же, что задаёт её длительность.
  const primary = primaryMediaLayer(scene);
  if (!primary) return <div className="h-full w-full bg-slate-800" />;
  const source = primary.source;
  if (source.kind === 'color') {
    return (
      <div className="grid h-full w-full place-items-center" style={{ backgroundColor: source.color ?? '#000' }}>
        <Palette className="h-4 w-4 text-white/50" />
      </div>
    );
  }
  const url = mediaUrl(source.url);
  if (source.kind === 'image' && url) {
    return <img src={url} alt="" className="h-full w-full object-cover" />;
  }
  if (source.kind === 'video' && url) {
    // Кадр из видео вместо иконки: по нему сцену узнают с одного взгляда.
    return <video src={`${url}#t=0.1`} muted playsInline preload="metadata" className="h-full w-full object-cover" />;
  }
  return (
    <div className="grid h-full w-full place-items-center bg-slate-800">
      {source.kind === 'video' ? <Film className="h-4 w-4 text-slate-500" /> : <ImageIcon className="h-4 w-4 text-slate-500" />}
    </div>
  );
}

/**
 * Лента сцен. Горизонтальная прокрутка одинаково работает и мышью, и пальцем,
 * поэтому отдельной мобильной раскладки здесь не нужно.
 */
export function SceneStrip({
  timeline,
  selectedIndex,
  onSelect,
  onMove,
  onDuplicate,
  onRemove,
  onAdd,
}: {
  timeline: Timeline;
  selectedIndex: number;
  onSelect: (index: number) => void;
  onMove: (index: number, direction: -1 | 1) => void;
  onDuplicate: (index: number) => void;
  onRemove: (index: number) => void;
  onAdd: () => void;
}) {
  return (
    <div className="-mx-1 overflow-x-auto pb-1 [scrollbar-width:thin]">
      <div className="flex min-w-max items-stretch gap-2 px-1">
        {timeline.scenes.map((scene, index) => {
          const selected = index === selectedIndex;
          return (
            <div
              key={scene.id}
              className={cn(
                'w-28 shrink-0 overflow-hidden rounded-lg border bg-slate-900 transition',
                selected ? 'border-amber-400' : 'border-slate-800 hover:border-slate-600',
              )}
            >
              <button
                type="button"
                onClick={() => onSelect(index)}
                className="block w-full"
                aria-label={`Сцена ${index + 1}`}
              >
                <div className="relative aspect-video w-full bg-black">
                  <SceneThumb scene={scene} />
                  <span className="absolute left-1 top-1 rounded bg-black/70 px-1.5 text-[11px] font-semibold text-white">
                    {index + 1}
                  </span>
                  <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1.5 text-[11px] font-mono text-white">
                    {formatTimelineDuration(sceneDurationSec(scene))}
                  </span>
                </div>
              </button>
              <div className="flex items-center justify-between border-t border-slate-800 px-1 py-0.5">
                <button
                  type="button"
                  onClick={() => onMove(index, -1)}
                  disabled={index === 0}
                  aria-label="Сдвинуть раньше"
                  className="p-1 text-slate-400 transition hover:text-white disabled:opacity-25"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onDuplicate(index)}
                  aria-label="Дублировать сцену"
                  className="p-1 text-slate-400 transition hover:text-white"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onRemove(index)}
                  disabled={timeline.scenes.length <= 1}
                  aria-label="Удалить сцену"
                  className="p-1 text-slate-400 transition hover:text-rose-300 disabled:opacity-25"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onMove(index, 1)}
                  disabled={index === timeline.scenes.length - 1}
                  aria-label="Сдвинуть позже"
                  className="p-1 text-slate-400 transition hover:text-white disabled:opacity-25"
                >
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          );
        })}

        <button
          type="button"
          onClick={onAdd}
          className="grid w-28 shrink-0 place-items-center rounded-lg border border-dashed border-slate-700 text-slate-400 transition hover:border-amber-400/60 hover:text-amber-300"
        >
          <span className="flex flex-col items-center gap-1 py-6 text-xs font-medium">
            <Plus className="h-4 w-4" />
            Сцена
          </span>
        </button>
      </div>
    </div>
  );
}
