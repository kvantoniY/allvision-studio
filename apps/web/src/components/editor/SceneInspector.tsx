'use client';

import { useRef, useState } from 'react';
import { Loader2, Plus, Trash2, Upload } from 'lucide-react';
import {
  TIMELINE_LIMITS,
  TIMELINE_TEXT_POSITIONS,
  TIMELINE_TRANSITIONS,
  TITLE_STYLE_DEFS,
  sceneDurationSec,
  type TimelineScene,
  type TimelineTextOverlay,
} from '@allvision/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

const TRANSITION_LABELS: Record<string, string> = {
  cut: 'Встык',
  dissolve: 'Растворение',
  'fade-black': 'Через чёрный',
  slide: 'Сдвиг',
};

const POSITION_LABELS: Record<string, string> = {
  top: 'Сверху',
  center: 'По центру',
  bottom: 'Снизу',
};

const SOURCE_LABELS: Record<string, string> = {
  video: 'Видео',
  image: 'Фотография',
  color: 'Заливка',
};

function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Настройки выбранной сцены. Порядок блоков повторяет порядок вопросов, которые
 * возникают у человека: что показываем, сколько это длится, что написано, как звучит.
 */
export function SceneInspector({
  scene,
  index,
  isLast,
  uploading,
  onChange,
  onUpload,
}: {
  scene: TimelineScene;
  index: number;
  isLast: boolean;
  uploading: boolean;
  onChange: (patch: Partial<TimelineScene>) => void;
  onUpload: (file: File) => void;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [trimError, setTrimError] = useState<string | null>(null);
  const duration = sceneDurationSec(scene);
  const isVideo = scene.source.kind === 'video';

  const updateOverlay = (overlayIndex: number, patch: Partial<TimelineTextOverlay>) => {
    const overlays = scene.overlays.map((overlay, i) => (i === overlayIndex ? { ...overlay, ...patch } : overlay));
    onChange({ overlays });
  };

  const addOverlay = () => {
    if (scene.overlays.length >= TIMELINE_LIMITS.maxOverlaysPerScene) return;
    onChange({
      overlays: [
        ...scene.overlays,
        { id: uid('text'), text: 'Новый титр', style: 'clean', position: 'bottom' },
      ],
    });
  };

  return (
    <div className="space-y-6 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-slate-100">Сцена {index + 1}</h3>
        <span className="text-xs text-slate-500">{SOURCE_LABELS[scene.source.kind]}</span>
      </div>

      <section className="space-y-2">
        <Label>Материал</Label>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {uploading ? 'Загружаем…' : 'Загрузить фото или видео'}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onChange({ source: { kind: 'color', color: '#0b1020' }, trimStartSec: undefined, trimEndSec: undefined })}
          >
            Сделать заливкой
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onUpload(file);
              event.target.value = '';
            }}
          />
        </div>
        {scene.source.kind === 'color' && (
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={scene.source.color ?? '#0b1020'}
              onChange={(event) => onChange({ source: { kind: 'color', color: event.target.value } })}
              className="h-9 w-14 cursor-pointer rounded border border-slate-700 bg-transparent"
              aria-label="Цвет заливки"
            />
            <span className="text-xs text-slate-500">Однотонный кадр — обычно под титульную надпись.</span>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <Label>Длительность</Label>
        {isVideo ? (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-slate-400">
                Начало обрезки, сек
                <Input
                  type="number"
                  min={0}
                  step={0.1}
                  value={scene.trimStartSec ?? 0}
                  onChange={(event) => {
                    const start = Math.max(0, Number(event.target.value));
                    const end = scene.trimEndSec;
                    if (typeof end === 'number' && end <= start) {
                      setTrimError('Конец обрезки должен быть позже начала.');
                      return;
                    }
                    setTrimError(null);
                    onChange({ trimStartSec: start });
                  }}
                  className="mt-1 h-9"
                />
              </label>
              <label className="text-xs text-slate-400">
                Конец обрезки, сек
                <Input
                  type="number"
                  min={0}
                  step={0.1}
                  value={scene.trimEndSec ?? ''}
                  placeholder="до конца"
                  onChange={(event) => {
                    const raw = event.target.value;
                    if (raw === '') {
                      setTrimError(null);
                      onChange({ trimEndSec: undefined });
                      return;
                    }
                    const end = Number(raw);
                    if (end <= (scene.trimStartSec ?? 0)) {
                      setTrimError('Конец обрезки должен быть позже начала.');
                      return;
                    }
                    setTrimError(null);
                    onChange({ trimEndSec: end });
                  }}
                  className="mt-1 h-9"
                />
              </label>
            </div>
            {trimError && <p className="text-xs text-rose-300">{trimError}</p>}
            <p className="text-xs text-slate-500">В ролике сцена займёт {duration.toFixed(1)} сек.</p>
          </div>
        ) : (
          <div className="space-y-1">
            <Input
              type="number"
              min={TIMELINE_LIMITS.minSceneDurationSec}
              max={TIMELINE_LIMITS.maxSceneDurationSec}
              step={0.5}
              value={scene.durationSec ?? 4}
              onChange={(event) => onChange({ durationSec: Number(event.target.value) })}
              className="h-9"
            />
            <p className="text-xs text-slate-500">Сколько секунд держать кадр на экране.</p>
          </div>
        )}
      </section>

      {!isLast && (
        <section className="space-y-2">
          <Label>Переход к следующей сцене</Label>
          <div className="flex flex-wrap gap-2">
            {TIMELINE_TRANSITIONS.map((transition) => (
              <button
                key={transition}
                type="button"
                onClick={() => onChange({ transition })}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-sm transition',
                  scene.transition === transition
                    ? 'border-amber-400 bg-amber-400/15 text-amber-200'
                    : 'border-slate-700 text-slate-300 hover:border-slate-500',
                )}
              >
                {TRANSITION_LABELS[transition]}
              </button>
            ))}
          </div>
          {scene.transition !== 'cut' && (
            <label className="block text-xs text-slate-400">
              Длительность перехода, сек
              <Input
                type="number"
                min={0.1}
                max={TIMELINE_LIMITS.maxTransitionDurationSec}
                step={0.1}
                value={scene.transitionDurationSec ?? 0.5}
                onChange={(event) => onChange({ transitionDurationSec: Number(event.target.value) })}
                className="mt-1 h-9"
              />
            </label>
          )}
        </section>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Титры</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addOverlay}
            disabled={scene.overlays.length >= TIMELINE_LIMITS.maxOverlaysPerScene}
          >
            <Plus className="h-4 w-4" />
            Добавить
          </Button>
        </div>
        {scene.overlays.length === 0 && <p className="text-xs text-slate-500">На этой сцене текста нет.</p>}
        {scene.overlays.map((overlay, overlayIndex) => (
          <div key={overlay.id} className="space-y-2 rounded-lg border border-slate-800 bg-slate-950/60 p-3">
            <div className="flex gap-2">
              <Input
                value={overlay.text}
                maxLength={TIMELINE_LIMITS.maxTextLength}
                onChange={(event) => updateOverlay(overlayIndex, { text: event.target.value })}
                placeholder="Текст титра"
                className="h-9"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onChange({ overlays: scene.overlays.filter((_, i) => i !== overlayIndex) })}
                aria-label="Удалить титр"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <Input
              value={overlay.subtext ?? ''}
              maxLength={TIMELINE_LIMITS.maxTextLength}
              onChange={(event) => updateOverlay(overlayIndex, { subtext: event.target.value || undefined })}
              placeholder="Подпись помельче (необязательно)"
              className="h-9"
            />
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-xs text-slate-400">
                Оформление
                <select
                  value={overlay.style}
                  onChange={(event) => updateOverlay(overlayIndex, { style: event.target.value as TimelineTextOverlay['style'] })}
                  className="mt-1 h-9 w-full rounded-md border border-slate-700 bg-slate-900 px-2 text-sm text-slate-100"
                >
                  {TITLE_STYLE_DEFS.map((style) => (
                    <option key={style.code} value={style.code}>
                      {style.title}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-slate-400">
                Положение
                <select
                  value={overlay.position}
                  onChange={(event) => updateOverlay(overlayIndex, { position: event.target.value as TimelineTextOverlay['position'] })}
                  className="mt-1 h-9 w-full rounded-md border border-slate-700 bg-slate-900 px-2 text-sm text-slate-100"
                >
                  {TIMELINE_TEXT_POSITIONS.map((position) => (
                    <option key={position} value={position}>
                      {POSITION_LABELS[position]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        ))}
      </section>

      {isVideo && (
        <section className="space-y-2">
          <Label>Звук сцены</Label>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={scene.muted}
              onChange={(event) => onChange({ muted: event.target.checked })}
            />
            Выключить оригинальный звук
          </label>
          {!scene.muted && (
            <label className="block text-xs text-slate-400">
              Громкость
              <input
                type="range"
                min={0}
                max={2}
                step={0.1}
                value={scene.volume}
                onChange={(event) => onChange({ volume: Number(event.target.value) })}
                className="mt-1 w-full accent-amber-400"
              />
            </label>
          )}
        </section>
      )}
    </div>
  );
}
