'use client';

import { useRef } from 'react';
import { Crop, Loader2, Maximize, RotateCw, Upload } from 'lucide-react';
import {
  FULL_FRAME_BOX,
  TIMELINE_LIMITS,
  TITLE_STYLE_DEFS,
  type MediaLayer,
  type SceneLayer,
  type TextLayer,
} from '@allvision/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

type Patch = Partial<MediaLayer> & Partial<TextLayer>;

/**
 * Настройки выделенного слоя.
 *
 * Появляется только когда что-то выделено: постоянная стопка настроек «на всякий случай»
 * и была тем, что делало прежнюю панель нечитаемой.
 */
export function LayerInspector({
  layer,
  uploading,
  onChange,
  onReplaceFile,
}: {
  layer: SceneLayer;
  uploading: boolean;
  onChange: (patch: Patch) => void;
  onReplaceFile: (file: File) => void;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className="space-y-5">
      {layer.kind === 'media' ? (
        <MediaLayerFields
          layer={layer}
          uploading={uploading}
          onChange={onChange}
          onPickFile={() => fileRef.current?.click()}
        />
      ) : (
        <TextLayerFields layer={layer} onChange={onChange} />
      )}

      <section className="space-y-2">
        <Label className="text-xs">Положение</Label>
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onChange({ box: FULL_FRAME_BOX, rotation: 0 })}
          >
            <Maximize className="h-4 w-4" />
            На весь кадр
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => onChange({ rotation: 0 })}>
            <RotateCw className="h-4 w-4" />
            Выровнять
          </Button>
        </div>
        <label className="block text-xs text-slate-400">
          Поворот: {Math.round(layer.rotation)}°
          <input
            type="range"
            min={-180}
            max={180}
            step={1}
            value={layer.rotation}
            onChange={(event) => onChange({ rotation: Number(event.target.value) })}
            className="mt-1 w-full accent-amber-400"
          />
        </label>
        <label className="block text-xs text-slate-400">
          Прозрачность: {Math.round(layer.opacity * 100)}%
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={layer.opacity}
            onChange={(event) => onChange({ opacity: Number(event.target.value) })}
            className="mt-1 w-full accent-amber-400"
          />
        </label>
      </section>

      <input
        ref={fileRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onReplaceFile(file);
          event.target.value = '';
        }}
      />
    </div>
  );
}

function MediaLayerFields({
  layer,
  uploading,
  onChange,
  onPickFile,
}: {
  layer: MediaLayer;
  uploading: boolean;
  onChange: (patch: Patch) => void;
  onPickFile: () => void;
}) {
  const crop = layer.crop ?? { x: 0, y: 0, w: 1, h: 1 };
  const cropped = crop.x > 0 || crop.y > 0 || crop.w < 1 || crop.h < 1;
  const isVideo = layer.source.kind === 'video';

  return (
    <>
      <section className="space-y-2">
        <Label className="text-xs">Материал</Label>
        <Button type="button" variant="outline" size="sm" onClick={onPickFile} disabled={uploading} className="w-full">
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {uploading ? 'Загружаем…' : 'Заменить файл'}
        </Button>
        {layer.source.kind === 'color' && (
          <input
            type="color"
            value={layer.source.color ?? '#0b1020'}
            onChange={(event) => onChange({ source: { kind: 'color', color: event.target.value } })}
            className="h-9 w-full cursor-pointer rounded border border-slate-700 bg-transparent"
            aria-label="Цвет заливки"
          />
        )}
      </section>

      <section className="space-y-2">
        <Label className="text-xs">Как вписать</Label>
        <div className="grid grid-cols-2 gap-2">
          {(['cover', 'contain'] as const).map((fit) => (
            <button
              key={fit}
              type="button"
              onClick={() => onChange({ fit })}
              className={cn(
                'rounded-md border px-3 py-2 text-xs transition',
                layer.fit === fit
                  ? 'border-amber-400 bg-amber-400/15 text-amber-200'
                  : 'border-slate-700 text-slate-300 hover:border-slate-500',
              )}
            >
              {fit === 'cover' ? 'Заполнить' : 'Вместить'}
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-500">
          {layer.fit === 'cover'
            ? 'Кадр заполняет рамку целиком, лишнее срезается по краям.'
            : 'Кадр помещается в рамку полностью, по краям остаётся фон.'}
        </p>
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs">Обрезка кадра</Label>
          {cropped && (
            <button
              type="button"
              onClick={() => onChange({ crop: undefined })}
              className="text-[11px] text-slate-500 transition hover:text-slate-300"
            >
              Сбросить
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <CropSlider label="Слева" value={crop.x} onChange={(x) => onChange({ crop: { ...crop, x, w: Math.min(crop.w, 1 - x) } })} />
          <CropSlider label="Сверху" value={crop.y} onChange={(y) => onChange({ crop: { ...crop, y, h: Math.min(crop.h, 1 - y) } })} />
          <CropSlider label="Ширина" value={crop.w} min={0.1} onChange={(w) => onChange({ crop: { ...crop, w: Math.min(w, 1 - crop.x) } })} />
          <CropSlider label="Высота" value={crop.h} min={0.1} onChange={(h) => onChange({ crop: { ...crop, h: Math.min(h, 1 - crop.y) } })} />
        </div>
        <p className="flex items-center gap-1.5 text-xs text-slate-500">
          <Crop className="h-3.5 w-3.5" />
          Какую часть исходника показывать.
        </p>
      </section>

      {isVideo && (
        <section className="space-y-2">
          <Label className="text-xs">Видео</Label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-slate-400">
              Начало, сек
              <Input
                type="number"
                min={0}
                step={0.1}
                value={layer.trimStartSec ?? 0}
                onChange={(event) => onChange({ trimStartSec: Math.max(0, Number(event.target.value)) })}
                className="mt-1 h-8"
              />
            </label>
            <label className="text-xs text-slate-400">
              Конец, сек
              <Input
                type="number"
                min={0}
                step={0.1}
                placeholder="до конца"
                value={layer.trimEndSec ?? ''}
                onChange={(event) => {
                  const raw = event.target.value;
                  onChange({ trimEndSec: raw === '' ? undefined : Number(raw) });
                }}
                className="mt-1 h-8"
              />
            </label>
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-300">
            <input type="checkbox" checked={layer.muted} onChange={(event) => onChange({ muted: event.target.checked })} />
            Выключить звук слоя
          </label>
          {!layer.muted && (
            <label className="block text-xs text-slate-400">
              Громкость: {Math.round(layer.volume * 100)}%
              <input
                type="range"
                min={0}
                max={2}
                step={0.05}
                value={layer.volume}
                onChange={(event) => onChange({ volume: Number(event.target.value) })}
                className="mt-1 w-full accent-amber-400"
              />
            </label>
          )}
        </section>
      )}
    </>
  );
}

function CropSlider({
  label,
  value,
  min = 0,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="text-[11px] text-slate-400">
      {label}: {Math.round(value * 100)}%
      <input
        type="range"
        min={min}
        max={1}
        step={0.01}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-1 w-full accent-amber-400"
      />
    </label>
  );
}

function TextLayerFields({ layer, onChange }: { layer: TextLayer; onChange: (patch: Patch) => void }) {
  return (
    <section className="space-y-2">
      <Label className="text-xs">Текст</Label>
      <Input
        value={layer.text}
        maxLength={TIMELINE_LIMITS.maxTextLength}
        onChange={(event) => onChange({ text: event.target.value })}
        className="h-9"
      />
      <Input
        value={layer.subtext ?? ''}
        maxLength={TIMELINE_LIMITS.maxTextLength}
        placeholder="Подпись помельче (необязательно)"
        onChange={(event) => onChange({ subtext: event.target.value || undefined })}
        className="h-9"
      />
      <Label className="text-xs">Оформление</Label>
      <div className="grid grid-cols-3 gap-1.5">
        {TITLE_STYLE_DEFS.map((style) => (
          <button
            key={style.code}
            type="button"
            title={style.description}
            onClick={() => onChange({ style: style.code })}
            className={cn(
              'rounded-md border px-2 py-1.5 text-[11px] transition',
              layer.style === style.code
                ? 'border-amber-400 bg-amber-400/15 text-amber-200'
                : 'border-slate-700 text-slate-300 hover:border-slate-500',
            )}
          >
            {style.title}
          </button>
        ))}
      </div>
    </section>
  );
}
