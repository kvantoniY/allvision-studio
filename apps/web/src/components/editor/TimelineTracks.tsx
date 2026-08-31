'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Copy, Music, Mic, Plus, Repeat, Scissors, Trash2 } from 'lucide-react';
import {
  TIMELINE_LIMITS,
  formatTimelineDuration,
  primaryMediaLayer,
  timelineAudioTracks,
  timelineTimings,
  type TimelineTransition,
  type Timeline,
  type TimelineNamedAudioTrack,
} from '@allvision/shared';
import { mediaUrl } from '@/components/editor/canvas/useMediaElements';
import { cn } from '@/lib/utils';

/**
 * Таймлайн ролика: сцены и звук на одной шкале.
 *
 * Три правила, из которых собрано всё остальное:
 *
 * 1. Одна шкала на все дорожки. Сцены, музыка и голос лежат в общей колонке, поэтому видно,
 *    на какой сцене вступает реплика.
 * 2. Блок сцены занимает ровно тот отрезок, пока эта сцена — главная картинка. Раньше блоки
 *    рисовались по «сырым» таймингам, где переход накладывает сцены друг на друга, и они
 *    налезали одна на другую — читалось как каша.
 * 3. Границу можно тянуть. Ручки по краям блока меняют длительность, а сам стык — это
 *    кнопка перехода: нажал и выбрал, каким он будет или что его нет.
 */

const TRANSITION_TITLES: Record<TimelineTransition, string> = {
  cut: 'Встык',
  dissolve: 'Растворение',
  'fade-black': 'Через чёрный',
  slide: 'Сдвиг',
};

const TRANSITION_ORDER: TimelineTransition[] = ['cut', 'dissolve', 'fade-black', 'slide'];

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

/** Тянем указателем и отдаём секунды: одна механика на ручки сцен, звука и курсора. */
function useDragSeconds(
  laneRef: React.RefObject<HTMLElement>,
  totalSec: number,
  onDrag: (deltaSec: number) => void,
  onCommit: () => void,
) {
  return useCallback(
    (event: React.PointerEvent) => {
      const lane = laneRef.current;
      if (!lane) return;
      event.preventDefault();
      event.stopPropagation();
      const width = lane.clientWidth || 1;
      const from = event.clientX;

      const move = (moveEvent: PointerEvent) => {
        onDrag(((moveEvent.clientX - from) / width) * totalSec);
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        onCommit();
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    },
    [laneRef, totalSec, onDrag, onCommit],
  );
}

export function TimelineTracks({
  timeline,
  totalSec,
  time,
  onSeek,
  onChangeTrack,
  onRemoveTrack,
  selectedSceneIndex,
  onSelectScene,
  onSceneDuration,
  onSceneTransition,
  onDuplicateScene,
  onRemoveScene,
  onAddScene,
  className,
}: {
  timeline: Timeline;
  totalSec: number;
  /** Текущее время ролика — по нему рисуется курсор. */
  time: number;
  onSeek: (sec: number) => void;
  onChangeTrack: (trackId: string, patch: Partial<TimelineNamedAudioTrack>) => void;
  onRemoveTrack: (trackId: string) => void;
  selectedSceneIndex: number;
  onSelectScene: (index: number) => void;
  onSceneDuration: (index: number, durationSec: number) => void;
  onSceneTransition: (index: number, transition: TimelineTransition) => void;
  onDuplicateScene: (index: number) => void;
  onRemoveScene: (index: number) => void;
  onAddScene: () => void;
  className?: string;
}) {
  const total = Math.max(totalSec, 1);
  // Читаем звук через помощник: ролики, записанные до списка дорожек, держат его в
  // music/voiceover, и обе формы должны рисоваться одинаково.
  const tracks = timelineAudioTracks(timeline);
  const lanesRef = useRef<HTMLDivElement | null>(null);
  const ticks = ticksFor(total);

  const seekFromPointer = useCallback(
    (clientX: number) => {
      const lane = lanesRef.current;
      if (!lane) return;
      const rect = lane.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      onSeek(ratio * total);
    },
    [onSeek, total],
  );

  const startScrub = useCallback(
    (event: React.PointerEvent) => {
      event.preventDefault();
      seekFromPointer(event.clientX);
      const move = (moveEvent: PointerEvent) => seekFromPointer(moveEvent.clientX);
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    },
    [seekFromPointer],
  );

  return (
    <div className={cn('flex gap-2', className)}>
      {/* Подписи дорожек. Отдельной колонкой, чтобы шкала у всех дорожек была общей. */}
      <div className="flex w-20 shrink-0 flex-col gap-1.5 pt-5 text-[11px] text-slate-400">
        <span className="flex h-14 items-center">Сцены</span>
        {tracks.length === 0 ? (
          <span className="flex h-9 items-center gap-1.5 text-slate-600">
            <Music className="h-3.5 w-3.5" /> Звук
          </span>
        ) : (
          tracks.map((track) => (
            <span key={track.id} className="flex h-9 items-center gap-1.5 truncate">
              {track.kind === 'music' ? <Music className="h-3.5 w-3.5 shrink-0" /> : <Mic className="h-3.5 w-3.5 shrink-0" />}
              <span className="truncate">{track.title ?? (track.kind === 'music' ? 'Музыка' : 'Голос')}</span>
            </span>
          ))
        )}
      </div>

      <div ref={lanesRef} className="relative min-w-0 flex-1">
        {/* Линейка: по ней перематывают, как в любой монтажке. */}
        <div
          onPointerDown={startScrub}
          className="relative h-5 cursor-pointer select-none border-b border-slate-800"
        >
          {ticks.map((at) => (
            <span
              key={at}
              className="absolute top-0 -translate-x-1/2 font-mono text-[10px] text-slate-600"
              style={{ left: `${(at / total) * 100}%` }}
            >
              {formatTimelineDuration(at)}
            </span>
          ))}
        </div>

        <div className="mt-1.5 space-y-1.5">
          <SceneLane
            timeline={timeline}
            total={total}
            laneRef={lanesRef}
            selectedIndex={selectedSceneIndex}
            onSelect={onSelectScene}
            onDuration={onSceneDuration}
            onTransition={onSceneTransition}
          />

          {tracks.length === 0 ? (
            <div className="flex h-9 items-center rounded-md border border-dashed border-slate-800 px-3 text-[11px] text-slate-600">
              Добавьте музыку или озвучку в инструменте «Звук» — дорожек может быть несколько
            </div>
          ) : (
            tracks.map((track) => (
              <AudioLane
                key={track.id}
                track={track}
                total={total}
                laneRef={lanesRef}
                accent={track.kind === 'music' ? 'amber' : 'violet'}
                onChange={(patch) => onChangeTrack(track.id, patch)}
                onRemove={() => onRemoveTrack(track.id)}
                loopable={track.kind === 'music'}
              />
            ))
          )}
        </div>

        {/* Курсор поверх всех дорожек: видно, какой кадр сейчас на экране. */}
        <div
          className="pointer-events-none absolute inset-y-0 z-20 w-px bg-amber-300"
          style={{ left: `${Math.min(100, (time / total) * 100)}%` }}
        >
          <span className="absolute -left-[5px] top-0 h-2.5 w-2.5 rounded-sm bg-amber-300" />
        </div>
      </div>

      <div className="flex w-8 shrink-0 flex-col gap-1 pt-5">
        <button
          type="button"
          onClick={() => onDuplicateScene(selectedSceneIndex)}
          title="Дублировать выбранную сцену"
          aria-label="Дублировать сцену"
          className="grid h-7 w-7 place-items-center rounded border border-slate-700 text-slate-400 transition hover:text-slate-100"
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onRemoveScene(selectedSceneIndex)}
          disabled={timeline.scenes.length <= 1}
          title="Удалить выбранную сцену"
          aria-label="Удалить сцену"
          className="grid h-7 w-7 place-items-center rounded border border-slate-700 text-slate-400 transition hover:border-rose-400/60 hover:text-rose-300 disabled:opacity-30"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onAddScene}
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

/**
 * Дорожка сцен.
 *
 * Блок занимает отрезок до начала следующей сцены — то есть ровно то время, пока эта сцена
 * видна как главная картинка. Так блоки не наезжают друг на друга и шкала не врёт.
 */
function SceneLane({
  timeline,
  total,
  laneRef,
  selectedIndex,
  onSelect,
  onDuration,
  onTransition,
}: {
  timeline: Timeline;
  total: number;
  laneRef: React.RefObject<HTMLElement>;
  selectedIndex: number;
  onSelect: (index: number) => void;
  onDuration: (index: number, durationSec: number) => void;
  onTransition: (index: number, transition: TimelineTransition) => void;
}) {
  const timings = timelineTimings(timeline);
  // Пока тянем ручку, длительность живёт здесь: писать в таймлайн на каждый пиксель значило
  // бы засыпать историю правок и слать автосохранение без остановки.
  const [draft, setDraft] = useState<{ index: number; durationSec: number } | null>(null);
  const [menuAt, setMenuAt] = useState<number | null>(null);

  const spans = timings.map((timing, index) => {
    const next = timings[index + 1];
    const from = timing.startSec;
    const to = next ? next.startSec : Math.max(from + timing.durationSec, total);
    return { timing, index, from, to: Math.max(to, from + 0.2) };
  });

  const commit = useCallback(() => {
    setDraft((current) => {
      if (current) onDuration(current.index, current.durationSec);
      return null;
    });
  }, [onDuration]);

  return (
    <div className="relative h-14 rounded-md border border-slate-800 bg-slate-950/60">
      {spans.map(({ timing, index, from, to }) => {
        const selected = index === selectedIndex;
        const preview = primaryMediaLayer(timing.scene);
        const previewUrl = preview?.source.kind === 'image' || preview?.source.kind === 'video'
          ? mediaUrl(preview.source.url)
          : null;
        const previewIsVideo = preview?.source.kind === 'video';
        const shownDuration = draft?.index === index ? draft.durationSec : timing.durationSec;

        return (
          <div
            key={timing.scene.id}
            className={cn(
              'group absolute inset-y-1 overflow-hidden rounded border transition',
              selected ? 'border-amber-400 ring-1 ring-amber-400/40' : 'border-slate-700 hover:border-slate-500',
            )}
            style={{ left: `${(from / total) * 100}%`, width: `calc(${((to - from) / total) * 100}% - 2px)` }}
          >
            <button
              type="button"
              onClick={() => onSelect(index)}
              title={`Сцена ${index + 1}`}
              className="absolute inset-0 block text-left"
            >
              {previewUrl ? (
                previewIsVideo ? (
                  // У видео-сцены картинкой был битый <img> — отсюда и серая заглушка на
                  // шкале. Показываем настоящий первый кадр: #t=0.1 заставляет браузер
                  // отрисовать его, не загружая ролик целиком.
                  <video
                    src={`${previewUrl}#t=0.1`}
                    muted
                    playsInline
                    preload="metadata"
                    className="absolute inset-0 h-full w-full object-cover opacity-70"
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={previewUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-70" />
                )
              ) : (
                <span className="absolute inset-0 bg-slate-900" />
              )}
              <span className="absolute left-1.5 top-1 rounded bg-slate-950/80 px-1 text-[10px] text-slate-200">
                {index + 1}
              </span>
              <span className="absolute bottom-1 right-1.5 rounded bg-slate-950/80 px-1 font-mono text-[10px] text-slate-300">
                {shownDuration.toFixed(1)}с
              </span>
            </button>

            {/* Ручки по краям: тянем — меняется длительность. Левая двигает границу с
                предыдущей сценой, то есть правит её длительность. */}
            {index > 0 && (
              <ResizeHandle
                side="left"
                laneRef={laneRef}
                total={total}
                onDrag={(deltaSec) => {
                  const previous = timings[index - 1];
                  setDraft({ index: index - 1, durationSec: clampDuration(previous.durationSec + deltaSec) });
                }}
                onCommit={commit}
              />
            )}
            <ResizeHandle
              side="right"
              laneRef={laneRef}
              total={total}
              onDrag={(deltaSec) => setDraft({ index, durationSec: clampDuration(timing.durationSec + deltaSec) })}
              onCommit={commit}
            />
          </div>
        );
      })}

      {/* Переход — кнопка прямо на стыке. Раньше на этом месте был непонятный значок,
          по которому нельзя было ни поменять переход, ни убрать его. */}
      {spans.slice(0, -1).map(({ timing, index, to }) => (
        <div key={`transition-${timing.scene.id}`} className="absolute inset-y-0 z-10" style={{ left: `${(to / total) * 100}%` }}>
          <button
            type="button"
            onClick={() => setMenuAt((current) => (current === index ? null : index))}
            title={`Переход: ${TRANSITION_TITLES[timing.scene.transition ?? 'cut']}`}
            aria-label="Переход между сценами"
            className={cn(
              'absolute top-1/2 grid h-5 w-5 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border text-[10px] transition',
              (timing.scene.transition ?? 'cut') === 'cut'
                ? 'border-slate-600 bg-slate-900 text-slate-500 hover:text-slate-200'
                : 'border-amber-400/70 bg-slate-950 text-amber-300',
            )}
          >
            <Scissors className="h-2.5 w-2.5" />
          </button>

          {menuAt === index && (
            <div className="absolute bottom-full left-1/2 z-30 mb-2 w-40 -translate-x-1/2 rounded-lg border border-slate-700 bg-slate-900 p-1 shadow-xl">
              {TRANSITION_ORDER.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => {
                    onTransition(index, option);
                    setMenuAt(null);
                  }}
                  className={cn(
                    'block w-full rounded px-2 py-1.5 text-left text-xs transition',
                    (timing.scene.transition ?? 'cut') === option
                      ? 'bg-amber-400/15 text-amber-200'
                      : 'text-slate-300 hover:bg-slate-800',
                  )}
                >
                  {TRANSITION_TITLES[option]}
                  {option === 'cut' && <span className="ml-1 text-slate-500">— без перехода</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function clampDuration(value: number) {
  return Math.min(
    TIMELINE_LIMITS.maxSceneDurationSec,
    Math.max(TIMELINE_LIMITS.minSceneDurationSec, Number(value.toFixed(1))),
  );
}

function ResizeHandle({
  side,
  laneRef,
  total,
  onDrag,
  onCommit,
}: {
  side: 'left' | 'right';
  laneRef: React.RefObject<HTMLElement>;
  total: number;
  onDrag: (deltaSec: number) => void;
  onCommit: () => void;
}) {
  const start = useDragSeconds(laneRef, total, onDrag, onCommit);
  return (
    <span
      onPointerDown={start}
      role="separator"
      aria-label={side === 'left' ? 'Сдвинуть начало сцены' : 'Сдвинуть конец сцены'}
      className={cn(
        'absolute inset-y-0 z-10 w-2 cursor-col-resize bg-transparent transition group-hover:bg-amber-400/40',
        side === 'left' ? 'left-0' : 'right-0',
      )}
    />
  );
}

/**
 * Звуковая дорожка.
 *
 * Тело двигают мышью — это `startAtSec`, момент вступления в ролике. Левая ручка режет
 * начало файла (`trimStartSec`): песню можно начать с припева, а не со вступления.
 */
function AudioLane({
  track,
  total,
  laneRef,
  accent,
  loopable = false,
  onChange,
  onRemove,
}: {
  track: TimelineNamedAudioTrack;
  total: number;
  laneRef: React.RefObject<HTMLElement>;
  accent: 'amber' | 'violet';
  loopable?: boolean;
  onChange: (patch: Partial<TimelineNamedAudioTrack>) => void;
  onRemove: () => void;
}) {
  const duration = useAudioDuration(track?.url);
  const [draft, setDraft] = useState<{ startAtSec: number; trimStartSec: number } | null>(null);

  const commit = useCallback(() => {
    setDraft((current) => {
      if (current) onChange({ startAtSec: current.startAtSec, trimStartSec: current.trimStartSec });
      return null;
    });
  }, [onChange]);

  // Левая ручка режет начало файла: тянем — трек вступает с более позднего места.
  const beginTrim = useDragSeconds(
    laneRef,
    total,
    (deltaSec) => {
      const nextTrim = Math.max(0, Number(((track.trimStartSec ?? 0) + deltaSec).toFixed(2)));
      setDraft({
        startAtSec: draft?.startAtSec ?? track.startAtSec ?? 0,
        trimStartSec: duration ? Math.min(nextTrim, duration - 0.5) : nextTrim,
      });
    },
    commit,
  );

  const startAt = draft?.startAtSec ?? track.startAtSec ?? 0;
  const trimStart = draft?.trimStartSec ?? track.trimStartSec ?? 0;
  // Длину файла узнаём не сразу; до этого рисуем дорожку до конца ролика.
  const playable = duration === null ? total - startAt : Math.max(0.5, duration - trimStart);
  const barSeconds = track.loop ? total - startAt : Math.min(playable, total - startAt);
  const widthPercent = Math.min(100, Math.max(2, (barSeconds / total) * 100));

  const beginMove = (event: React.PointerEvent) => {
    const lane = laneRef.current;
    if (!lane) return;
    event.preventDefault();
    const width = lane.clientWidth || 1;
    const from = event.clientX;
    const originalStart = track.startAtSec ?? 0;

    const move = (moveEvent: PointerEvent) => {
      const delta = ((moveEvent.clientX - from) / width) * total;
      setDraft({
        startAtSec: Math.min(Math.max(0, total - 0.5), Math.max(0, Number((originalStart + delta).toFixed(2)))),
        trimStartSec: trimStart,
      });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      commit();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <div className="relative h-9 rounded-md border border-slate-800 bg-slate-950/60">
      <div
        onPointerDown={beginMove}
        className={cn(
          'group absolute inset-y-1 cursor-grab overflow-hidden rounded border active:cursor-grabbing',
          accent === 'amber' ? 'border-amber-400/50 bg-amber-400/15' : 'border-violet-400/50 bg-violet-400/15',
        )}
        style={{ left: `${(startAt / total) * 100}%`, width: `${widthPercent}%` }}
      >
        <span className="absolute left-2 top-1/2 -translate-y-1/2 font-mono text-[10px] text-slate-200">
          {formatTimelineDuration(startAt)}
          {trimStart > 0 && <span className="ml-1 text-slate-400">c {formatTimelineDuration(trimStart)} трека</span>}
        </span>
        {track.loop && <Repeat className="absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-300" />}

        {/* Левая ручка режет начало файла: тянем — трек вступает с более позднего места. */}
        <span
          onPointerDown={beginTrim}
          role="separator"
          aria-label="Обрезать начало трека"
          className="absolute inset-y-0 left-0 z-10 w-2 cursor-col-resize transition group-hover:bg-white/30"
        />
      </div>

      <div className="absolute inset-y-0 right-1 flex items-center gap-1">
        <input
          type="range"
          min={0}
          max={1.5}
          step={0.05}
          value={track.volume}
          onChange={(event) => onChange({ volume: Number(event.target.value) })}
          className={cn('w-16', accent === 'amber' ? 'accent-amber-400' : 'accent-violet-400')}
          aria-label="Громкость"
          title={`Громкость: ${Math.round(track.volume * 100)}%`}
        />
        {loopable && (
          <button
            type="button"
            onClick={() => onChange({ loop: !track.loop })}
            title={track.loop ? 'Повторять до конца ролика' : 'Играть один раз'}
            aria-label="Повторять трек"
            className={cn(
              'grid h-6 w-6 place-items-center rounded border transition',
              track.loop ? 'border-amber-400/60 text-amber-300' : 'border-slate-700 text-slate-500 hover:text-slate-300',
            )}
          >
            <Repeat className="h-3 w-3" />
          </button>
        )}
        <button
          type="button"
          onClick={onRemove}
          aria-label="Убрать дорожку"
          className="grid h-6 w-6 place-items-center rounded border border-slate-700 text-slate-500 transition hover:border-rose-400/60 hover:text-rose-300"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
