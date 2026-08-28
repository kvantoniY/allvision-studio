'use client';

import { ChevronDown, ChevronUp, Copy, Eye, EyeOff, Image as ImageIcon, Lock, Palette, Trash2, Type, Video } from 'lucide-react';
import {
  sceneLayers,
  type MediaLayer,
  type SceneLayer,
  type TextLayer,
  type TimelineScene,
} from '@allvision/shared';
import { cn } from '@/lib/utils';

function layerTitle(layer: SceneLayer): string {
  if (layer.kind === 'text') return layer.text.slice(0, 28) || 'Текст';
  if (layer.source.kind === 'color') return 'Заливка';
  if (layer.source.kind === 'video') return 'Видео';
  return 'Фото';
}

function LayerIcon({ layer }: { layer: SceneLayer }) {
  if (layer.kind === 'text') return <Type className="h-3.5 w-3.5" />;
  if (layer.source.kind === 'color') return <Palette className="h-3.5 w-3.5" />;
  if (layer.source.kind === 'video') return <Video className="h-3.5 w-3.5" />;
  return <ImageIcon className="h-3.5 w-3.5" />;
}

/**
 * Список слоёв сцены.
 *
 * Порядок здесь — это порядок наложения, поэтому список идёт сверху вниз как в любом
 * редакторе: верхняя строка рисуется последней и лежит поверх остальных.
 */
export function LayerPanel({
  scene,
  selectedLayerId,
  onSelect,
  onMove,
  onDuplicate,
  onRemove,
  onChange,
}: {
  scene: TimelineScene;
  selectedLayerId: string | null;
  onSelect: (layerId: string) => void;
  onMove: (layerId: string, direction: -1 | 1) => void;
  onDuplicate: (layerId: string) => void;
  onRemove: (layerId: string) => void;
  onChange: (layerId: string, patch: Partial<MediaLayer> & Partial<TextLayer>) => void;
}) {
  const layers = sceneLayers(scene);
  // Сверху показываем верхний слой: на холсте он лежит поверх, и список должен читаться так же.
  const ordered = [...layers].reverse();

  return (
    <div className="space-y-1">
      {ordered.map((layer) => {
        const selected = layer.id === selectedLayerId;
        const hidden = layer.opacity === 0;
        return (
          <div
            key={layer.id}
            className={cn(
              'group flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-xs transition',
              selected ? 'border-amber-400 bg-amber-400/10' : 'border-slate-800 bg-slate-900/60 hover:border-slate-700',
            )}
          >
            <button
              type="button"
              onClick={() => onSelect(layer.id)}
              className="flex min-w-0 flex-1 items-center gap-2 text-left"
            >
              <span className={cn('shrink-0', selected ? 'text-amber-300' : 'text-slate-500')}>
                <LayerIcon layer={layer} />
              </span>
              <span className={cn('truncate', hidden ? 'text-slate-600 line-through' : 'text-slate-200')}>
                {layerTitle(layer)}
              </span>
            </button>

            <button
              type="button"
              onClick={() => onChange(layer.id, { opacity: hidden ? 1 : 0 })}
              aria-label={hidden ? 'Показать слой' : 'Скрыть слой'}
              className="p-1 text-slate-500 transition hover:text-slate-200"
            >
              {hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
            <button
              type="button"
              onClick={() => onChange(layer.id, { locked: !layer.locked })}
              aria-label={layer.locked ? 'Разблокировать' : 'Заблокировать'}
              className={cn('p-1 transition hover:text-slate-200', layer.locked ? 'text-amber-300' : 'text-slate-500')}
            >
              <Lock className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onMove(layer.id, 1)}
              aria-label="Выше"
              className="p-1 text-slate-500 transition hover:text-slate-200"
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onMove(layer.id, -1)}
              aria-label="Ниже"
              className="p-1 text-slate-500 transition hover:text-slate-200"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onDuplicate(layer.id)}
              aria-label="Дублировать слой"
              title="Дублировать (Ctrl+D)"
              className="p-1 text-slate-500 transition hover:text-slate-200"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onRemove(layer.id)}
              disabled={layers.length <= 1}
              aria-label="Удалить слой"
              className="p-1 text-slate-500 transition hover:text-rose-300 disabled:opacity-25"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
