'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Copy, Music, Mic, Plus, Repeat, Trash2 } from 'lucide-react';
import {
  formatTimelineDuration,
  primaryMediaLayer,
  timelineTimings,
  type Timeline,
  type TimelineAudioTrack,
} from '@allvision/shared';
import { mediaUrl } from '@/components/editor/canvas/useMediaElements';
import { cn } from '@/lib/utils';

/**
 * Звуковые дорожки ролика на шкале времени.
 *
 * Раньше музыка и голос были парой полей в настройках, и понять, где именно звучит
 * реплика, было нельзя. Дорожка показывает то же, что уйдёт в рендер: начало берётся из
 * `startAtSec`, длина — из настоящей длительности файла, которую меряет браузер.
 */

/** Длительность файла по ссылке: на сервере ffprobe нет, а браузер знает её из метаданных. */
function useAudioDuration(url?: string | null): number | null {
  const [duration, setDuration] = useState<number | null>(null);

  useEffect(() => {
    setDuration(null);
    const src = mediaUrl(url);
    if (!src) return;
    let cancelled = false;
    const audio = new Audio();
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => {
      if (!cancelled && Number.isFinite(audio.duration)) setDuration(audio.duration);
    };
    audio.src = src;
    return () => {
      cancelled = true;
      audio.src = '';
    };
  }, [url]);

  return duration;
}

function ticksFor(totalSec: number): number[] {
  // Шаг подбираем так, чтобы делений было около десятка: иначе на длинном ролике
  // шкала превращается в сплошную полоску.
  const rough = totalSec / 10;
  const step = [1, 2, 5, 10, 15, 30, 60].find((value) => value >= rough) ?? 60;
  const result: number[] = [];
  for (let at = 0; at <= totalSec; at += step) result.push(at);
  return result;
}

export function TimelineTracks({
  timeline,
  totalSec,
  onChangeMusic,
  onChangeVoiceover,
  onRemoveMusic,
  onRemoveVoiceover,
  selectedSceneIndex,
  onSelectScene,
  onDuplicateScene,
  onRemoveScene,
  onMoveScene,
  onAddScene,
  className,
}: {
  timeline: Timeline;
  totalSec: number;
  onChangeMusic: (track: TimelineAudioTrack) => void;
  onChangeVoiceover: (track: TimelineAudioTrack) => void;
  onRemoveMusic: () => void;
  onRemoveVoiceover: () => void;
  selectedSceneIndex: number;
  onSelectScene: (index: number) => void;
  onDuplicateScene: (index: number) => void;
  onRemoveScene: (index: number) => void;
  onMoveScene: (index: number, direction: -1 | 1) => void;
  onAddScene: () => void;
  className?: string;
}) {
  const ticks = ticksFor(Math.max(totalSec, 1));

  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="relative h-4 select-none">
        {ticks.map((at) => (
          <span
            key={at}
            className="absolute top-0 -translate-x-1/2 font-mono text-[10px] text-slate-600"
            style={{ left: `${(at / Math.max(totalSec, 1)) * 100}%` }}
          >
            {formatTimelineDuration(at)}
          </span>
        ))}
      </div>

      <SceneLane
        timeline={timeline}
        totalSec={totalSec}
        selectedIndex={selectedSceneIndex}
        onSelect={onSelectScene}
        onDuplicate={onDuplicateScene}
        onRemove={onRemoveScene}
        onMove={onMoveScene}
        onAdd={onAddScene}
      />

      <TrackRow
        icon={<Music className="h-3.5 w-3.5" />}
        title="Музыка"
        track={timeline.music}
        totalSec={totalSec}
        accent="amber"
        emptyHint="Выберите трек в инструменте «Звук»"
        onChange={onChangeMusic}
        onRemove={onRemoveMusic}
        loopable
      />
      <TrackRow
        icon={<Mic className="h-3.5 w-3.5" />}
        title="Голос"
        track={timeline.voiceover}
        totalSec={totalSec}
        accent="violet"
        emptyHint="Загрузите запись или озвучьте текст в инструменте «Звук»"
        onChange={onChangeVoiceover}
        onRemove={onRemoveVoiceover}
      />
    </div>
  );
}

function TrackRow({
  icon,
  title,
  track,
  totalSec,
  accent,
  emptyHint,
  loopable = false,
  onChange,
  onRemove,
}: {
  icon: React.ReactNode;
  title: string;
  track?: TimelineAudioTrack;
  totalSec: number;
  accent: 'amber' | 'violet';
  emptyHint: string;
  loopable?: boolean;
  onChange: (track: TimelineAudioTrack) => void;
  onRemove: () => void;
}) {
  const laneRef = useRef<HTMLDivElement | null>(null);
  const duration = useAudioDuration(track?.url);
  // Пока тянем — держим позицию отдельно: писать в таймлайн на каждый пиксель значило бы
  // засыпать историю правок и слать автосохранение без остановки.
  const [dragStart, setDragStart] = useState<number | null>(null);

  const total = Math.max(totalSec, 1);
  const startAt = dragStart ?? track?.startAtSec ?? 0;
  // Длину файла узнаём не сразу; до этого рисуем дорожку до конца ролика.
  const playable = duration === null ? null : Math.max(0.5, duration - (track?.trimStartSec ?? 0));
  const barSeconds = playable ?? total - startAt;
  const widthPercent = Math.min(100, Math.max(2, ((track?.loop ? total - startAt : barSeconds) / total) * 100));

  const beginDrag = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!track) return;
      const lane = laneRef.current;
      if (!lane) return;
      event.preventDefault();
      const laneWidth = lane.clientWidth;
      const pointerStart = event.clientX;
      const originalStart = track.startAtSec ?? 0;
      const maxStart = Math.max(0, total - 0.5);

      const move = (moveEvent: PointerEvent) => {
        const deltaSec = ((moveEvent.clientX - pointerStart) / laneWidth) * total;
        setDragStart(Math.min(maxStart, Math.max(0, Number((originalStart + deltaSec).toFixed(2)))));
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        setDragStart((value) => {
          if (value !== null && value !== originalStart) onChange({ ...track, startAtSec: value });
          return null;
        });
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    },
    [track, total, onChange],
  );

  const barColor = accent === 'amber'
    ? 'border-amber-400/60 bg-amber-400/25 text-amber-100'
    : 'border-violet-400/60 bg-violet-500/25 text-violet-100';

  return (
    <div className="flex items-center gap-2">
      <div className="flex w-24 shrink-0 items-center gap-1.5 text-[11px] text-slate-400">
        {icon}
        {title}
      </div>

      <div
        ref={laneRef}
        className="relative h-9 min-w-0 flex-1 overflow-hidden rounded-md border border-slate-800 bg-slate-950/60"
      >
        {track ? (
          <div
            role="slider"
            tabIndex={0}
            aria-label={`${title}: начало на ${formatTimelineDuration(startAt)}`}
            aria-valuemin={0}
            aria-valuemax={Math.round(total)}
            aria-valuenow={Math.round(startAt)}
            onPointerDown={beginDrag}
            onKeyDown={(event) => {
              if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
              event.preventDefault();
              const step = event.shiftKey ? 1 : 0.25;
              const next = Math.min(
                Math.max(0, total - 0.5),
                Math.max(0, (track.startAtSec ?? 0) + (event.key === 'ArrowLeft' ? -step : step)),
              );
              onChange({ ...track, startAtSec: Number(next.toFixed(2)) });
            }}
            className={cn(
              'absolute inset-y-1 flex cursor-grab items-center gap-1.5 rounded border px-2 text-[11px] active:cursor-grabbing',
              barColor,
            )}
            style={{ left: `${(startAt / total) * 100}%`, width: `${widthPercent}%` }}
          >
            <span className="truncate font-mono">{formatTimelineDuration(startAt)}</span>
            {track.loop && <Repeat className="h-3 w-3 shrink-0 opacity-70" />}
          </div>
        ) : (
          <div className="flex h-full items-center px-2 text-[11px] text-slate-600">{emptyHint}</div>
        )}
      </div>

      {track && (
        <div className="flex shrink-0 items-center gap-2">
          <label className="flex items-center gap-1 text-[11px] text-slate-500">
            <span className="hidden sm:inline">Начать с</span>
            <input
              type="number"
              min={0}
              max={duration ? Math.floor(duration) : undefined}
              step={0.5}
              value={track.trimStartSec ?? 0}
              onChange={(event) =>
                onChange({ ...track, trimStartSec: Math.max(0, Number(event.target.value) || 0) })
              }
              className="h-7 w-16 rounded border border-slate-700 bg-slate-900 px-1.5 text-right text-[11px] text-slate-200"
              aria-label={`С какой секунды файла играет ${title}`}
              title="С какой секунды самого файла играть: например, начать песню с припева"
            />
          </label>
          <label className="flex items-center gap-1 text-[11px] text-slate-500">
            <span className="hidden sm:inline">Громкость</span>
            <input
              type="range"
              min={0}
              max={1.5}
              step={0.05}
              value={track.volume}
              onChange={(event) => onChange({ ...track, volume: Number(event.target.value) })}
              className="w-20 accent-amber-400"
              aria-label={`Громкость: ${title}`}
            />
          </label>
          {loopable && (
            <button
              type="button"
              onClick={() => onChange({ ...track, loop: !track.loop })}
              title={track.loop ? 'Повторять до конца ролика' : 'Играть один раз'}
              aria-label="Повторять трек"
              className={cn(
                'grid h-7 w-7 place-items-center rounded border transition',
                track.loop
                  ? 'border-amber-400/60 text-amber-300'
                  : 'border-slate-700 text-slate-500 hover:text-slate-300',
              )}
            >
              <Repeat className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Убрать: ${title}`}
            className="grid h-7 w-7 place-items-center rounded border border-slate-700 text-slate-500 transition hover:border-rose-400/60 hover:text-rose-300"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Сцены на той же шкале, что и звук.
 *
 * Прежняя лента показывала плитки одинаковой ширины, и понять, где кончается сцена и куда
 * попадает реплика, было нельзя. Ширина блока здесь равна длительности сцены, поэтому
 * картинка и звук читаются вместе.
 */
function SceneLane({
  timeline,
  totalSec,
  selectedIndex,
  onSelect,
  onDuplicate,
  onRemove,
  onMove,
  onAdd,
}: {
  timeline: Timeline;
  totalSec: number;
  selectedIndex: number;
  onSelect: (index: number) => void;
  onDuplicate: (index: number) => void;
  onRemove: (index: number) => void;
  onMove: (index: number, direction: -1 | 1) => void;
  onAdd: () => void;
}) {
  const total = Math.max(totalSec, 1);
  const timings = timelineTimings(timeline);

  return (
    <div className="flex items-center gap-2">
      <div className="flex w-24 shrink-0 items-center gap-1.5 text-[11px] text-slate-400">Сцены</div>

      <div className="relative h-14 min-w-0 flex-1 rounded-md border border-slate-800 bg-slate-950/60">
        {timings.map((timing) => {
          const selected = timing.index === selectedIndex;
          const preview = primaryMediaLayer(timing.scene);
          const previewUrl = preview?.source.kind === 'image' || preview?.source.kind === 'video'
            ? mediaUrl(preview.source.url)
            : null;
          return (
            <button
              key={timing.scene.id}
              type="button"
              onClick={() => onSelect(timing.index)}
              title={`Сцена ${timing.index + 1} — ${timing.durationSec.toFixed(1)} с`}
              className={cn(
                'absolute inset-y-1 overflow-hidden rounded border text-left transition',
                selected
                  ? 'border-amber-400 ring-1 ring-amber-400/40'
                  : 'border-slate-700 hover:border-slate-500',
              )}
              style={{
                left: `${(timing.startSec / total) * 100}%`,
                width: `calc(${(timing.durationSec / total) * 100}% - 2px)`,
              }}
            >
              {previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-70" />
              ) : (
                <span className="absolute inset-0 bg-slate-900" />
              )}
              <span className="absolute left-1 top-1 rounded bg-slate-950/80 px-1 text-[10px] text-slate-200">
                {timing.index + 1}
              </span>
              <span className="absolute bottom-1 right-1 rounded bg-slate-950/80 px-1 font-mono text-[10px] text-slate-300">
                {timing.durationSec.toFixed(1)}с
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={() => onMove(selectedIndex, -1)}
          disabled={selectedIndex <= 0}
          title="Сдвинуть сцену раньше"
          aria-label="Сцена раньше"
          className="grid h-7 w-7 place-items-center rounded border border-slate-700 text-slate-400 transition hover:text-slate-100 disabled:opacity-30"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onMove(selectedIndex, 1)}
          disabled={selectedIndex >= timeline.scenes.length - 1}
          title="Сдвинуть сцену позже"
          aria-label="Сцена позже"
          className="grid h-7 w-7 place-items-center rounded border border-slate-700 text-slate-400 transition hover:text-slate-100 disabled:opacity-30"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onDuplicate(selectedIndex)}
          title="Дублировать выбранную сцену"
          aria-label="Дублировать сцену"
          className="grid h-7 w-7 place-items-center rounded border border-slate-700 text-slate-400 transition hover:text-slate-100"
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onRemove(selectedIndex)}
          disabled={timeline.scenes.length <= 1}
          title="Удалить выбранную сцену"
          aria-label="Удалить сцену"
          className="grid h-7 w-7 place-items-center rounded border border-slate-700 text-slate-400 transition hover:border-rose-400/60 hover:text-rose-300 disabled:opacity-30"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onAdd}
          title="Добавить сцену"
          aria-label="Добавить сцену"
          className="grid h-7 w-7 place-items-center rounded border border-slate-700 text-slate-400 transition hover:border-amber-400/60 hover:text-amber-200"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
