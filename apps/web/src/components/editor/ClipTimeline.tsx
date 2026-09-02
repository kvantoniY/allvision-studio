'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Copy,
  Eye,
  EyeOff,
  Layers,
  Mic,
  Music,
  Plus,
  Repeat,
  ArrowLeftRight,
  ChevronsLeftRight,
  ImagePlus,
  Scissors,
  SplitSquareHorizontal,
  Trash2,
  Wand2,
  Volume2,
  VolumeX,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  TIMELINE_LIMITS,
  clipEndSec,
  formatTimelineDuration,
  sortedClips,
  timelineAudioTracks,
  tracksDurationSec,
  type Timeline,
  type TimelineClip,
  type TimelineNamedAudioTrack,
  type TimelineTrack,
  type TimelineTransition,
} from '@allvision/shared';
import { DEFAULT_TRANSITION_SEC, clipHeadRoomSec, clipSourceLimitSec } from '@/components/editor/useTrackEditor';
import { mediaUrl } from '@/components/editor/canvas/useMediaElements';
import { Waveform } from '@/components/editor/Waveform';
import type { MediaLibraryItem } from '@/components/editor/MediaLibraryPanel';
import { cn } from '@/lib/utils';

/**
 * Монтажная шкала: дорожки, клипы и звук на одной линейке.
 *
 * Клип стоит на своей секунде и занимает свою ширину — это и есть вся модель. Отсюда
 * следует остальное: между клипами можно оставить паузу, клип можно перетащить на другую
 * дорожку, а наложение соседей и есть переход. Ничего не «пересчитывается» под капотом:
 * то, что видно на шкале, попадёт в файл на тех же секундах.
 *
 * Шкала общая для всех дорожек, включая звук: иначе нельзя понять, на каком кадре вступает
 * реплика.
 */

/** Ближе этого клипы считаются стоящими вплотную: попасть мышью в идеальный ноль нельзя. */
const JOINT_TOLERANCE_SEC = 0.08;
/** Длины перехода на выбор — те же ступени, что предлагают монтажки. */
const TRANSITION_LENGTHS = [0.3, 0.5, 1] as const;

const TRANSITION_TITLES: Record<TimelineTransition, string> = {
  cut: 'Встык',
  dissolve: 'Растворение',
  'fade-black': 'Через чёрный',
  slide: 'Сдвиг',
};

const TRANSITION_ORDER: TimelineTransition[] = ['cut', 'dissolve', 'fade-black', 'slide'];

const GUTTER_PX = 116;
const TRACK_HEIGHT_PX = 52;
const AUDIO_HEIGHT_PX = 36;
const MIN_PX_PER_SEC = 8;
const MAX_PX_PER_SEC = 160;
/** Прилипание к соседям и курсору: без него встык руками не поставить. */
const SNAP_PX = 7;

function ticksFor(totalSec: number, pxPerSec: number): number[] {
  const rough = 90 / Math.max(1, pxPerSec);
  const step = [0.5, 1, 2, 5, 10, 15, 30, 60].find((value) => value >= rough) ?? 60;
  const result: number[] = [];
  for (let at = 0; at <= totalSec + step; at += step) result.push(Number(at.toFixed(2)));
  return result;
}

/** Длительность файла по ссылке: ffprobe на сервере нет, а браузер знает её из метаданных. */
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

export type ClipTimelineProps = {
  timeline: Timeline;
  tracks: TimelineTrack[];
  time: number;
  onSeek: (sec: number) => void;
  /**
   * Подписка на точное время ролика.
   *
   * Линия курсора обязана идти плавно, но перерисовывать ради неё шкалу со всеми клипами
   * шестьдесят раз в секунду нельзя — на этом вкладка и подвисала. Подписка двигает один
   * узел напрямую в DOM, а React об этом не знает.
   */
  subscribeTime: (listener: (seconds: number) => void) => () => void;
  selectedClipId: string | null;
  onSelectClip: (clipId: string | null) => void;
  onMoveClip: (clipId: string, target: { startSec: number; trackIndex?: number }) => void;
  onTrimClip: (clipId: string, edge: 'start' | 'end', deltaSec: number) => void;
  onDuplicateClip: (clipId: string) => void;
  onRemoveClip: (clipId: string) => void;
  onSplitClip: (clipId: string, atSec: number) => void;
  onTransition: (clipId: string, transition: TimelineTransition, durationSec?: number) => void;
  /** Придвигает клип вплотную к предыдущему: без стыка переход невозможен. */
  onSnapToPrevious: (clipId: string) => void;
  /**
   * Ролик заведён из шаблона: кадры ведут себя как заготовки под фотографии.
   *
   * Пустой кадр зовёт вставить фото, кадр с фотографией — оживить. Без этого пустые
   * заливки на дорожке ничего человеку не говорят.
   */
  templateMode?: boolean;
  onFramePick?: (clipId: string) => void;
  onFrameGenerate?: (clipId: string) => void;
  framePriceCoins?: number;
  onAddTrack: () => void;
  onRemoveTrack: (trackIndex: number) => void;
  onPatchTrack: (trackIndex: number, patch: { hidden?: boolean; muted?: boolean }) => void;
  onChangeAudio: (trackId: string, patch: Partial<TimelineNamedAudioTrack>) => void;
  onRemoveAudio: (trackId: string) => void;
  /** Режет дорожку на два фрагмента под курсором. */
  onSplitAudio: (trackId: string, atSec: number) => void;
  /** Материал, брошенный из медиатеки прямо на дорожку. */
  onDropMedia: (trackIndex: number, startSec: number, item: MediaLibraryItem) => void;
  className?: string;
};

export function ClipTimeline({
  timeline,
  tracks,
  time,
  onSeek,
  subscribeTime,
  selectedClipId,
  onSelectClip,
  onMoveClip,
  onTrimClip,
  onDuplicateClip,
  onRemoveClip,
  onSplitClip,
  onTransition,
  onSnapToPrevious,
  templateMode = false,
  onFramePick,
  onFrameGenerate,
  framePriceCoins = 0,
  onAddTrack,
  onRemoveTrack,
  onPatchTrack,
  onChangeAudio,
  onRemoveAudio,
  onSplitAudio,
  onDropMedia,
  className,
}: ClipTimelineProps) {
  const audioTracks = timelineAudioTracks(timeline);
  const total = Math.max(tracksDurationSec(tracks), 8);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [pxPerSec, setPxPerSec] = useState(28);
  // Пока клип тянут, его положение живёт здесь: писать в таймлайн на каждый пиксель
  // значило бы засыпать историю правок и слать автосохранение без остановки.
  const [drag, setDrag] = useState<{ clipId: string; startSec: number; trackIndex: number } | null>(null);
  const [trim, setTrim] = useState<{ clipId: string; edge: 'start' | 'end'; deltaSec: number } | null>(null);
  const [menuJointId, setMenuJointId] = useState<string | null>(null);
  const playheadRef = useRef<HTMLDivElement | null>(null);
  /** Точное время для прилипания: читаем в момент жеста, а не держим в состоянии. */
  const timeRef = useRef(time);

  const laneWidth = Math.max(320, (total + 4) * pxPerSec);
  const secToPx = useCallback((sec: number) => sec * pxPerSec, [pxPerSec]);

  useEffect(() => subscribeTime((seconds) => {
    timeRef.current = seconds;
    const node = playheadRef.current;
    if (node) node.style.transform = `translateX(${seconds * pxPerSec}px)`;
  }), [subscribeTime, pxPerSec]);

  const pointerSec = useCallback(
    (clientX: number) => {
      const node = scrollRef.current;
      if (!node) return 0;
      const rect = node.getBoundingClientRect();
      const x = clientX - rect.left + node.scrollLeft - GUTTER_PX;
      return Math.max(0, x / pxPerSec);
    },
    [pxPerSec],
  );

  const startScrub = useCallback(
    (event: React.PointerEvent) => {
      event.preventDefault();
      onSeek(pointerSec(event.clientX));
      const move = (moveEvent: PointerEvent) => onSeek(pointerSec(moveEvent.clientX));
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    },
    [onSeek, pointerSec],
  );

  /**
 * Плашка стыка двух клипов.
 *
 * Переход возможен только там, где кадры стоят вплотную: наложить далеко стоящие клипы
 * значило бы молча стереть кусок ролика. Поэтому у паузы плашки перехода нет — вместо неё
 * кнопка «придвинуть вплотную», которая объясняет, чего не хватает.
 *
 * Когда переход стоит, наложение видно полосой: это и есть те секунды, в которые один кадр
 * растворяется в другом, и на шкале они занимают ровно столько же, сколько в готовом файле.
 */
function JointMark({
  prevClip,
  jointPx,
  overlapPx,
  overlapSec,
  gapSec,
  open,
  onToggle,
  onPick,
  onSnap,
}: {
  prevClip: TimelineClip;
  jointPx: number;
  overlapPx: number;
  overlapSec: number;
  gapSec: number;
  open: boolean;
  onToggle: () => void;
  onPick: (transition: TimelineTransition, durationSec: number) => void;
  onSnap: () => void;
}) {
  const active = overlapSec > 0.01 && prevClip.transition !== 'cut';
  const apart = gapSec > JOINT_TOLERANCE_SEC;
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [menuStyle, setMenuStyle] = useState<{ left: number; top?: number; bottom?: number }>({ left: 0 });

  /*
   * Меню открывается порталом, поэтому его положение считаем сами — от кнопки стыка.
   * Раньше оно висело внутри шкалы и обрезалось её прокруткой: наружу торчал кусок
   * подсказки, который закрывал линейку и перехватывал клики.
   */
  useEffect(() => {
    if (!open) return;
    const node = buttonRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const spaceAbove = rect.top;
    // Над шкалой места обычно нет — тогда раскрываемся вниз.
    setMenuStyle(
      spaceAbove > 260
        ? { left: rect.left + rect.width / 2, bottom: window.innerHeight - rect.top + 8 }
        : { left: rect.left + rect.width / 2, top: rect.bottom + 8 },
    );
  }, [open]);

  if (apart) {
    return (
      <button
        type="button"
        onClick={onSnap}
        title="Между клипами пауза — переход невозможен. Нажмите, чтобы придвинуть вплотную"
        aria-label="Придвинуть клип вплотную"
        className="absolute top-1/2 z-20 grid h-5 w-5 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-dashed border-slate-600 bg-slate-950 text-slate-500 transition hover:border-slate-400 hover:text-slate-200"
        style={{ left: jointPx }}
      >
        <ChevronsLeftRight className="h-2.5 w-2.5" />
      </button>
    );
  }

  return (
    <>
      {active && overlapPx > 2 && (
        <span
          className="pointer-events-none absolute inset-y-1 z-10 rounded-sm border border-amber-400/50 bg-[repeating-linear-gradient(45deg,rgba(251,191,36,0.25)_0_4px,transparent_4px_8px)]"
          style={{ left: jointPx - overlapPx / 2, width: overlapPx }}
        />
      )}

      <button
        ref={buttonRef}
        type="button"
        onClick={onToggle}
        title={`Переход: ${TRANSITION_TITLES[prevClip.transition]}${active ? ` · ${overlapSec.toFixed(1)}с` : ''}`}
        aria-label="Переход между клипами"
        className={cn(
          'absolute top-1/2 z-20 flex h-5 -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-full border px-1.5 text-[10px] transition',
          active
            ? 'border-amber-400/70 bg-slate-950 text-amber-300'
            : 'border-slate-600 bg-slate-950 text-slate-500 hover:border-slate-400 hover:text-slate-200',
        )}
        style={{ left: jointPx }}
      >
        <ArrowLeftRight className="h-2.5 w-2.5" />
        {active && <span className="font-mono">{overlapSec.toFixed(1)}с</span>}
      </button>

      {open && typeof document !== 'undefined' && createPortal((
        <>
          {/* Клик мимо закрывает меню: иначе оно остаётся висеть над шкалой. */}
          <div className="fixed inset-0 z-[130]" onClick={onToggle} />
          <div
            className="fixed z-[131] w-52 -translate-x-1/2 rounded-lg border border-slate-700 bg-slate-900 p-1.5 shadow-xl"
            style={menuStyle}
          >
          <div className="px-1 pb-1 text-[10px] uppercase tracking-wide text-slate-500">Переход</div>
          {TRANSITION_ORDER.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => onPick(option, overlapSec > 0.01 ? overlapSec : DEFAULT_TRANSITION_SEC)}
              className={cn(
                'block w-full rounded px-2 py-1.5 text-left text-xs transition',
                prevClip.transition === option ? 'bg-amber-400/15 text-amber-200' : 'text-slate-300 hover:bg-slate-800',
              )}
            >
              {TRANSITION_TITLES[option]}
              {option === 'cut' && <span className="ml-1 text-slate-500">— без перехода</span>}
            </button>
          ))}

          <div className="mt-1 border-t border-slate-800 pt-1.5">
            <div className="px-1 pb-1 text-[10px] uppercase tracking-wide text-slate-500">Длительность</div>
            <div className="flex gap-1 px-1">
              {TRANSITION_LENGTHS.map((length) => (
                <button
                  key={length}
                  type="button"
                  disabled={prevClip.transition === 'cut'}
                  onClick={() => onPick(prevClip.transition, length)}
                  className={cn(
                    'flex-1 rounded border px-1 py-1 text-[11px] transition disabled:opacity-40',
                    Math.abs(overlapSec - length) < 0.05
                      ? 'border-amber-400/70 text-amber-200'
                      : 'border-slate-700 text-slate-400 hover:border-slate-500',
                  )}
                >
                  {length}с
                </button>
              ))}
            </div>
            <p className="px-1 pt-1.5 text-[10px] leading-4 text-slate-500">
              Переход — это наложение: ролик станет короче на его длину.
            </p>
            </div>
          </div>
        </>
      ), document.body)}
    </>
  );
}

/** Точки, к которым клип прилипает: края соседей, ноль и курсор. */
  const snapPoints = useMemo(() => {
    // Курсор добавляем как точку прилипания отдельно, в самом snap: держать его здесь
    // значило бы пересчитывать весь список на каждый кадр проигрывания.
    const points = new Set<number>([0]);
    for (const track of tracks) {
      for (const clip of track.clips) {
        points.add(clip.startSec);
        points.add(clipEndSec(clip));
      }
    }
    return [...points];
  }, [tracks]);

  const snap = useCallback(
    (sec: number, ignoreClipId: string) => {
      const tolerance = SNAP_PX / pxPerSec;
      const ignored = tracks
        .flatMap((track) => track.clips)
        .filter((clip) => clip.id === ignoreClipId)
        .flatMap((clip) => [clip.startSec, clipEndSec(clip)]);
      let best = sec;
      let bestDistance = tolerance;
      for (const point of [...snapPoints, Number(timeRef.current.toFixed(3))]) {
        if (ignored.includes(point)) continue;
        const distance = Math.abs(point - sec);
        if (distance < bestDistance) {
          best = point;
          bestDistance = distance;
        }
      }
      return Math.max(0, Number(best.toFixed(3)));
    },
    [snapPoints, pxPerSec, tracks],
  );

  const beginClipDrag = useCallback(
    (event: React.PointerEvent, clip: TimelineClip, trackIndex: number) => {
      event.preventDefault();
      event.stopPropagation();
      onSelectClip(clip.id);
      const fromX = event.clientX;
      const fromY = event.clientY;
      let moved = false;
      let next = { startSec: clip.startSec, trackIndex };

      const move = (moveEvent: PointerEvent) => {
        const deltaSec = (moveEvent.clientX - fromX) / pxPerSec;
        const deltaRows = Math.round((moveEvent.clientY - fromY) / TRACK_HEIGHT_PX);
        if (!moved && Math.abs(moveEvent.clientX - fromX) < 3 && Math.abs(moveEvent.clientY - fromY) < 3) return;
        moved = true;
        next = {
          startSec: snap(Math.max(0, clip.startSec + deltaSec), clip.id),
          trackIndex: Math.min(Math.max(0, trackIndex + deltaRows), tracks.length - 1),
        };
        setDrag({ clipId: clip.id, ...next });
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        setDrag(null);
        if (moved) onMoveClip(clip.id, next);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    },
    [onSelectClip, onMoveClip, pxPerSec, snap, tracks.length],
  );

  const beginTrim = useCallback(
    (event: React.PointerEvent, clip: TimelineClip, edge: 'start' | 'end') => {
      event.preventDefault();
      event.stopPropagation();
      onSelectClip(clip.id);
      const fromX = event.clientX;
      let deltaSec = 0;

      const move = (moveEvent: PointerEvent) => {
        deltaSec = (moveEvent.clientX - fromX) / pxPerSec;
        setTrim({ clipId: clip.id, edge, deltaSec });
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        setTrim(null);
        if (Math.abs(deltaSec) > 0.01) onTrimClip(clip.id, edge, deltaSec);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    },
    [onSelectClip, onTrimClip, pxPerSec],
  );

  const shownClip = useCallback(
    (clip: TimelineClip, trackIndex: number) => {
      let startSec = clip.startSec;
      let durationSec = clip.durationSec;
      let row = trackIndex;
      if (drag?.clipId === clip.id) {
        startSec = drag.startSec;
        row = drag.trackIndex;
      }
      if (trim?.clipId === clip.id) {
        if (trim.edge === 'end') {
          const limit = clipSourceLimitSec(clip);
          const wanted = Math.max(0.2, clip.durationSec + trim.deltaSec);
          durationSec = limit === null ? wanted : Math.min(wanted, limit);
        } else {
          const end = clipEndSec(clip);
          const headRoom = clipHeadRoomSec(clip);
          const earliest = headRoom === null ? 0 : Math.max(0, clip.startSec - headRoom);
          startSec = Math.min(end - 0.2, Math.max(earliest, clip.startSec + trim.deltaSec));
          durationSec = end - startSec;
        }
      }
      return { startSec, durationSec, row };
    },
    [drag, trim],
  );

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex items-center gap-2 text-[11px] text-slate-500">
        <Layers className="h-3.5 w-3.5" />
        <span>Дорожки</span>
        <button
          type="button"
          onClick={onAddTrack}
          className="inline-flex items-center gap-1 rounded border border-slate-700 px-1.5 py-0.5 transition hover:border-amber-400/60 hover:text-amber-200"
        >
          <Plus className="h-3 w-3" />
          дорожка
        </button>
        <span className="ml-auto font-mono">{formatTimelineDuration(time)} / {formatTimelineDuration(total)}</span>
        <button
          type="button"
          onClick={() => setPxPerSec((value) => Math.max(MIN_PX_PER_SEC, Math.round(value / 1.4)))}
          aria-label="Отдалить"
          className="grid h-6 w-6 place-items-center rounded border border-slate-700 transition hover:text-slate-200"
        >
          <ZoomOut className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={() => setPxPerSec((value) => Math.min(MAX_PX_PER_SEC, Math.round(value * 1.4)))}
          aria-label="Приблизить"
          className="grid h-6 w-6 place-items-center rounded border border-slate-700 transition hover:text-slate-200"
        >
          <ZoomIn className="h-3 w-3" />
        </button>
      </div>

      <div ref={scrollRef} className="studio-scroll relative max-h-[46vh] overflow-auto rounded-lg border border-slate-800 bg-slate-950/60">
        <div className="relative" style={{ width: laneWidth + GUTTER_PX }}>
          {/* Линейка. По ней перематывают, как в любой монтажке. */}
          <div className="sticky top-0 z-20 flex bg-slate-950/95 backdrop-blur">
            <div style={{ width: GUTTER_PX }} className="sticky left-0 z-10 shrink-0 border-r border-slate-800 bg-slate-950/95" />
            <div onPointerDown={startScrub} className="relative h-6 flex-1 cursor-pointer select-none border-b border-slate-800">
              {ticksFor(total, pxPerSec).map((at) => (
                <span
                  key={at}
                  className="absolute top-1 border-l border-slate-800 pl-1 font-mono text-[10px] text-slate-600"
                  style={{ left: secToPx(at) }}
                >
                  {formatTimelineDuration(at)}
                </span>
              ))}
            </div>
          </div>

          {tracks.map((track, trackIndex) => (
            <div key={track.id} className="flex border-b border-slate-900" style={{ height: TRACK_HEIGHT_PX }}>
              <div style={{ width: GUTTER_PX }} className="sticky left-0 z-10 flex shrink-0 items-center gap-1 border-r border-slate-800 bg-slate-950 px-2">
                <span className="min-w-0 flex-1 truncate text-[11px] text-slate-400">
                  {trackIndex === 0 ? 'Основная' : track.title ?? `Слой ${trackIndex + 1}`}
                </span>
                <button
                  type="button"
                  onClick={() => onPatchTrack(trackIndex, { hidden: !track.hidden })}
                  title={track.hidden ? 'Показать дорожку' : 'Скрыть дорожку'}
                  aria-label="Скрыть дорожку"
                  className="grid h-5 w-5 shrink-0 place-items-center rounded text-slate-500 transition hover:text-slate-200"
                >
                  {track.hidden ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                </button>
                <button
                  type="button"
                  onClick={() => onPatchTrack(trackIndex, { muted: !track.muted })}
                  title={track.muted ? 'Включить звук дорожки' : 'Заглушить дорожку'}
                  aria-label="Заглушить дорожку"
                  className="grid h-5 w-5 shrink-0 place-items-center rounded text-slate-500 transition hover:text-slate-200"
                >
                  {track.muted ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
                </button>
                {trackIndex > 0 && (
                  <button
                    type="button"
                    onClick={() => onRemoveTrack(trackIndex)}
                    title="Убрать дорожку"
                    aria-label="Убрать дорожку"
                    className="grid h-5 w-5 shrink-0 place-items-center rounded text-slate-600 transition hover:text-rose-300"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>

              <div
                className="relative flex-1"
                onDragOver={(event) => {
                  // Разрешаем сброс только нашего материала: чужие перетаскивания
                  // (текст, ссылки) дорожку трогать не должны.
                  if (!event.dataTransfer.types.includes('application/x-allvision-media')) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'copy';
                }}
                onDrop={(event) => {
                  const raw = event.dataTransfer.getData('application/x-allvision-media');
                  if (!raw) return;
                  event.preventDefault();
                  try {
                    onDropMedia(trackIndex, pointerSec(event.clientX), JSON.parse(raw) as MediaLibraryItem);
                  } catch {
                    // Битый payload — молча игнорируем: ронять редактор из-за чужого
                    // перетаскивания незачем.
                  }
                }}
                onPointerDown={(event) => {
                  // Клик по пустому месту дорожки снимает выделение и переставляет курсор.
                  if (event.target !== event.currentTarget) return;
                  onSelectClip(null);
                  onSeek(pointerSec(event.clientX));
                }}
              >
                {sortedClips(track).map((clip, position) => {
                  const shown = shownClip(clip, trackIndex);
                  if (shown.row !== trackIndex) return null;
                  const selected = clip.id === selectedClipId;
                  return (
                    <ClipBlock
                      key={clip.id}
                      clip={clip}
                      left={secToPx(shown.startSec)}
                      width={Math.max(14, secToPx(shown.durationSec))}
                      selected={selected}
                      frame={templateMode && trackIndex === 0
                        ? {
                          price: framePriceCoins,
                          onPick: () => onFramePick?.(clip.id),
                          onGenerate: () => onFrameGenerate?.(clip.id),
                        }
                        : undefined}
                      onPointerDown={(event) => beginClipDrag(event, clip, trackIndex)}
                      onTrimStart={(event) => beginTrim(event, clip, 'start')}
                      onTrimEnd={(event) => beginTrim(event, clip, 'end')}
                      onDuplicate={() => onDuplicateClip(clip.id)}
                      onRemove={() => onRemoveClip(clip.id)}
                      onSplit={() => onSplitClip(clip.id, time)}
                      splitAvailable={time > clip.startSec + 0.3 && time < clipEndSec(clip) - 0.3}
                    />
                  );
                })}
                {/*
                  * Стыки живут отдельным слоем поверх клипов: переход принадлежит ПАРЕ
                  * кадров, а не одному из них, и рисовать его на краю клипа значило бы
                  * показывать половину стыка при наложении.
                  */}
                {trackIndex === 0 && !drag && !trim && sortedClips(track).slice(0, -1).map((clip, position) => {
                  const nextClip = sortedClips(track)[position + 1];
                  const jointSec = (clipEndSec(clip) + nextClip.startSec) / 2;
                  const overlapSec = Math.max(0, clipEndSec(clip) - nextClip.startSec);
                  const gapSec = Math.max(0, nextClip.startSec - clipEndSec(clip));
                  const jointId = `${clip.id}->${nextClip.id}`;
                  return (
                    <JointMark
                      key={jointId}
                      prevClip={clip}
                      jointPx={secToPx(jointSec)}
                      overlapPx={secToPx(overlapSec)}
                      overlapSec={overlapSec}
                      gapSec={gapSec}
                      open={menuJointId === jointId}
                      onToggle={() => setMenuJointId((current) => (current === jointId ? null : jointId))}
                      onPick={(value, durationSec) => {
                        onTransition(clip.id, value, durationSec);
                        setMenuJointId(null);
                      }}
                      onSnap={() => onSnapToPrevious(nextClip.id)}
                    />
                  );
                })}

                {/* Клип, который тянут на ЭТУ дорожку с другой: он должен быть виден здесь. */}
                {drag && drag.trackIndex === trackIndex
                  && !track.clips.some((clip) => clip.id === drag.clipId)
                  && (() => {
                    const source = tracks.flatMap((item) => item.clips).find((item) => item.id === drag.clipId);
                    if (!source) return null;
                    return (
                      <div
                        className="pointer-events-none absolute inset-y-1 rounded border border-amber-400 bg-amber-400/20"
                        style={{ left: secToPx(drag.startSec), width: Math.max(14, secToPx(source.durationSec)) }}
                      />
                    );
                  })()}
              </div>
            </div>
          ))}

          {audioTracks.map((track) => (
            <div key={track.id} className="flex border-b border-slate-900" style={{ height: AUDIO_HEIGHT_PX }}>
              <div style={{ width: GUTTER_PX }} className="sticky left-0 z-10 flex shrink-0 items-center gap-1.5 border-r border-slate-800 bg-slate-950 px-2">
                {track.kind === 'music' ? <Music className="h-3 w-3 shrink-0 text-slate-500" /> : <Mic className="h-3 w-3 shrink-0 text-slate-500" />}
                <span className="min-w-0 flex-1 truncate text-[11px] text-slate-400">
                  {track.title ?? (track.kind === 'music' ? 'Музыка' : 'Голос')}
                </span>
              </div>
              <div className="relative flex-1">
                <AudioClip
                  track={track}
                  total={total}
                  pxPerSec={pxPerSec}
                  playheadSec={time}
                  onChange={(patch) => onChangeAudio(track.id, patch)}
                  onSplit={() => onSplitAudio(track.id, time)}
                  onRemove={() => onRemoveAudio(track.id)}
                />
              </div>
            </div>
          ))}

          {audioTracks.length === 0 && (
            <div className="flex" style={{ height: AUDIO_HEIGHT_PX }}>
              <div style={{ width: GUTTER_PX }} className="sticky left-0 z-10 shrink-0 border-r border-slate-800 bg-slate-950" />
              <p className="flex flex-1 items-center px-3 text-[11px] text-slate-600">
                Музыку и озвучку добавляют в инструменте «Звук» — дорожек может быть несколько
              </p>
            </div>
          )}

          {/* Курсор поверх всех дорожек: видно, какой кадр сейчас на экране. */}
          <div
            ref={playheadRef}
            className="pointer-events-none absolute bottom-0 top-6 z-30 w-px bg-amber-300"
            style={{ left: GUTTER_PX, transform: `translateX(${secToPx(time)}px)` }}
          >
            <span className="absolute -left-[5px] -top-2 h-2.5 w-2.5 rounded-sm bg-amber-300" />
          </div>
        </div>
      </div>
    </div>
  );
}

function ClipBlock({
  clip,
  left,
  width,
  selected,
  splitAvailable,
  frame,
  onPointerDown,
  onTrimStart,
  onTrimEnd,
  onDuplicate,
  onRemove,
  onSplit,
}: {
  clip: TimelineClip;
  left: number;
  width: number;
  selected: boolean;
  splitAvailable: boolean;
  /** Кадр шаблона: вставить фото и оживить прямо на дорожке. */
  frame?: { price: number; onPick: () => void; onGenerate: () => void };
  onPointerDown: (event: React.PointerEvent) => void;
  onTrimStart: (event: React.PointerEvent) => void;
  onTrimEnd: (event: React.PointerEvent) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onSplit: () => void;
}) {
  const layer = clip.layer;
  const isText = layer.kind === 'text';
  const preview = layer.kind === 'media' && (layer.source.kind === 'image' || layer.source.kind === 'video')
    ? mediaUrl(layer.source.url)
    : null;
  const isVideo = layer.kind === 'media' && layer.source.kind === 'video';
  const pending = layer.kind === 'media' && Boolean(layer.generationProjectId);

  return (
    <div
      className={cn(
        'group absolute inset-y-1 overflow-visible rounded border transition',
        selected ? 'border-amber-400 ring-1 ring-amber-400/40' : 'border-slate-700 hover:border-slate-500',
      )}
      style={{ left, width }}
    >
      <div
        onPointerDown={onPointerDown}
        className="absolute inset-0 cursor-grab overflow-hidden rounded active:cursor-grabbing"
      >
        {preview ? (
          isVideo ? (
            // #t=0.1 заставляет браузер отрисовать первый кадр, не загружая ролик целиком.
            <video src={`${preview}#t=0.1`} muted playsInline preload="metadata" className="absolute inset-0 h-full w-full object-cover opacity-70" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="" className="absolute inset-0 h-full w-full object-cover opacity-70" />
          )
        ) : (
          <span className={cn('absolute inset-0', isText ? 'bg-violet-500/25' : 'bg-slate-800')} />
        )}
        <span className="absolute inset-x-1 top-0.5 truncate text-[10px] text-slate-100 drop-shadow">
          {isText ? layer.text : layer.source.kind === 'color' ? 'Заливка' : ''}
        </span>
        {pending && (
          <span className="absolute inset-0 grid place-items-center bg-slate-950/70 text-[10px] text-violet-200">
            генерируем…
          </span>
        )}
        <span className="absolute bottom-0.5 right-1 rounded bg-slate-950/80 px-1 font-mono text-[10px] text-slate-300">
          {clip.durationSec.toFixed(1)}с
        </span>
      </div>

      {/*
        * Кадр шаблона говорит, что с ним делать дальше. Пустой — «вставьте фото»,
        * с фотографией — «оживить». Оживлённый кадр (видео) ничем не отличается от
        * обычного клипа: работа с ним закончена.
        */}
      {frame && !pending && layer.kind === 'media' && layer.source.kind !== 'video' && (
        layer.source.kind === 'color' ? (
          <button
            type="button"
            onClick={frame.onPick}
            title="Вставить фотографию в этот кадр"
            className="absolute inset-0 z-20 grid place-items-center rounded border border-dashed border-slate-600 bg-slate-950/60 text-[11px] text-slate-400 transition hover:border-violet-400 hover:text-violet-200"
          >
            <span className="flex items-center gap-1">
              <ImagePlus className="h-3.5 w-3.5" />
              фото
            </span>
          </button>
        ) : (
          <button
            type="button"
            onClick={frame.onGenerate}
            title={`Оживить этот кадр — спишется ${frame.price} токенов`}
            aria-label="Оживить кадр"
            className="absolute left-1 top-1 z-20 flex h-5 items-center gap-1 rounded-full border border-violet-400/70 bg-slate-950/90 px-1.5 text-[10px] text-violet-200 transition hover:bg-violet-500/20"
          >
            <Wand2 className="h-2.5 w-2.5" />
            оживить
          </button>
        )
      )}

      <span
        onPointerDown={onTrimStart}
        role="separator"
        aria-label="Обрезать начало клипа"
        className="absolute inset-y-0 left-0 z-10 w-2 cursor-col-resize transition group-hover:bg-amber-400/40"
      />
      <span
        onPointerDown={onTrimEnd}
        role="separator"
        aria-label="Обрезать конец клипа"
        className="absolute inset-y-0 right-0 z-10 w-2 cursor-col-resize transition group-hover:bg-amber-400/40"
      />

      {/*
        * Кнопки лежат ВНУТРИ клипа, а не над ним.
        *
        * Над дорожкой их обрезал контейнер прокрутки (в Edge особенно заметно), а главное —
        * они висели ровно там, куда человек целится курсором времени, и перехватывали клик:
        * вместо перемотки срабатывало «дублировать».
        */}
      {selected && (
        <div className="absolute right-1 top-1 z-30 flex gap-1">
          <IconButton title="Разрезать под курсором" onClick={onSplit} disabled={!splitAvailable}>
            <SplitSquareHorizontal className="h-3 w-3" />
          </IconButton>
          <IconButton title="Дублировать" onClick={onDuplicate}>
            <Copy className="h-3 w-3" />
          </IconButton>
          <IconButton title="Удалить" onClick={onRemove} danger>
            <Trash2 className="h-3 w-3" />
          </IconButton>
        </div>
      )}

    </div>
  );
}

function IconButton({
  title,
  onClick,
  disabled,
  danger,
  children,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={cn(
        'grid h-5 w-5 place-items-center rounded border border-slate-700 bg-slate-950 text-slate-400 transition disabled:opacity-30',
        danger ? 'hover:border-rose-400/60 hover:text-rose-300' : 'hover:border-amber-400/60 hover:text-amber-200',
      )}
    >
      {children}
    </button>
  );
}

/**
 * Звуковая дорожка.
 *
 * Тело двигают мышью — это момент вступления в ролике. Левая ручка режет начало файла:
 * песню можно начать с припева, а не со вступления.
 */
/**
 * Клип звуковой дорожки.
 *
 * Ведёт себя как клип видео: его двигают, тянут за оба края и режут под курсором. Внутри
 * рисуется звуковая волна — по ней видно, где пауза, а где вступает голос, и резать можно
 * осмысленно, а не на глаз.
 */
function AudioClip({
  track,
  total,
  pxPerSec,
  playheadSec,
  onChange,
  onSplit,
  onRemove,
}: {
  track: TimelineNamedAudioTrack;
  total: number;
  pxPerSec: number;
  /** Секунда курсора: по ней режем. */
  playheadSec: number;
  onChange: (patch: Partial<TimelineNamedAudioTrack>) => void;
  onSplit: () => void;
  onRemove: () => void;
}) {
  const fileDuration = useAudioDuration(track.url);
  const [draft, setDraft] = useState<{ startAtSec: number; trimStartSec: number; durationSec?: number } | null>(null);

  const commit = useCallback(() => {
    setDraft((current) => {
      if (current) {
        onChange({
          startAtSec: current.startAtSec,
          trimStartSec: current.trimStartSec,
          durationSec: current.durationSec,
        });
      }
      return null;
    });
  }, [onChange]);

  const startAt = draft?.startAtSec ?? track.startAtSec ?? 0;
  const trimStart = draft?.trimStartSec ?? track.trimStartSec ?? 0;
  const fragment = draft ? draft.durationSec : track.durationSec;

  // Сколько осталось в файле после обрезки: правый край дальше этого не растянуть.
  const playable = fileDuration === null ? total - startAt : Math.max(0.5, fileDuration - trimStart);
  const barSeconds = fragment && fragment > 0
    ? fragment
    : track.loop
      ? Math.max(0.5, total - startAt)
      : Math.min(playable, Math.max(0.5, total - startAt));

  const source = mediaUrl(track.url);

  const drag = (
    event: React.PointerEvent,
    onDelta: (deltaSec: number) => void,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const fromX = event.clientX;
    const move = (moveEvent: PointerEvent) => onDelta((moveEvent.clientX - fromX) / pxPerSec);
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      commit();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const beginMove = (event: React.PointerEvent) => {
    const originalStart = track.startAtSec ?? 0;
    drag(event, (delta) => {
      setDraft({
        startAtSec: Math.max(0, Number((originalStart + delta).toFixed(2))),
        trimStartSec: trimStart,
        durationSec: track.durationSec,
      });
    });
  };

  /**
   * Левый край режет начало: одновременно уезжает и позиция в ролике, и точка входа в файле.
   * Кусок при этом остаётся тем же — как у видео.
   */
  const beginTrimStart = (event: React.PointerEvent) => {
    const originalTrim = track.trimStartSec ?? 0;
    const originalStart = track.startAtSec ?? 0;
    const originalLength = barSeconds;
    drag(event, (delta) => {
      const shift = Math.max(-originalTrim, Math.min(delta, originalLength - 0.5));
      setDraft({
        startAtSec: Math.max(0, Number((originalStart + shift).toFixed(2))),
        trimStartSec: Number((originalTrim + shift).toFixed(2)),
        durationSec: Number((originalLength - shift).toFixed(2)),
      });
    });
  };

  /** Правый край задаёт длину фрагмента — дальше конца файла не растянуть. */
  const beginTrimEnd = (event: React.PointerEvent) => {
    const originalLength = barSeconds;
    drag(event, (delta) => {
      const limit = track.loop ? TIMELINE_LIMITS.maxTotalDurationSec : playable;
      const next = Math.max(0.5, Math.min(limit, originalLength + delta));
      setDraft({
        startAtSec: startAt,
        trimStartSec: trimStart,
        durationSec: Number(next.toFixed(2)),
      });
    });
  };

  const accent = track.kind === 'music' ? 'amber' : 'violet';
  const insideClip = playheadSec > startAt + 0.2 && playheadSec < startAt + barSeconds - 0.2;

  return (
    <>
      <div
        onPointerDown={beginMove}
        className={cn(
          'group absolute inset-y-1 cursor-grab overflow-hidden rounded border active:cursor-grabbing',
          accent === 'amber' ? 'border-amber-400/50 bg-amber-400/15' : 'border-violet-400/50 bg-violet-400/15',
        )}
        style={{ left: startAt * pxPerSec, width: Math.max(20, barSeconds * pxPerSec) }}
      >
        <Waveform
          src={source}
          fromSec={trimStart}
          lengthSec={barSeconds}
          fileDurationSec={fileDuration}
          color={accent === 'amber' ? 'rgba(251, 191, 36, 0.55)' : 'rgba(167, 139, 250, 0.55)'}
        />
        <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 rounded bg-slate-950/70 px-1 font-mono text-[10px] text-slate-200">
          {formatTimelineDuration(startAt)}
          {trimStart > 0 && <span className="ml-1 text-slate-400">c {formatTimelineDuration(trimStart)} трека</span>}
        </span>
        {track.loop && <Repeat className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-300" />}
        <span
          onPointerDown={beginTrimStart}
          role="separator"
          aria-label="Обрезать начало"
          className="absolute inset-y-0 left-0 z-10 w-2 cursor-col-resize transition group-hover:bg-white/30"
        />
        <span
          onPointerDown={beginTrimEnd}
          role="separator"
          aria-label="Обрезать конец"
          className="absolute inset-y-0 right-0 z-10 w-2 cursor-col-resize transition group-hover:bg-white/30"
        />
      </div>

      <div
        className="pointer-events-auto absolute inset-y-1 z-10 flex items-center gap-1 rounded bg-slate-950/85 px-1"
        style={{ left: (startAt + barSeconds) * pxPerSec + 6 }}
      >
        <input
          type="range"
          min={0}
          max={1.5}
          step={0.05}
          value={track.volume}
          onChange={(event) => onChange({ volume: Number(event.target.value) })}
          className={cn('w-14', accent === 'amber' ? 'accent-amber-400' : 'accent-violet-400')}
          aria-label="Громкость"
          title={`Громкость: ${Math.round(track.volume * 100)}%`}
        />
        <button
          type="button"
          onClick={onSplit}
          disabled={!insideClip}
          title={insideClip ? 'Разрезать под курсором' : 'Поставьте курсор внутри дорожки'}
          aria-label="Разрезать дорожку"
          className="grid h-5 w-5 place-items-center rounded border border-slate-700 text-slate-400 transition hover:border-slate-500 hover:text-slate-200 disabled:opacity-40"
        >
          <Scissors className="h-3 w-3" />
        </button>
        {track.kind === 'music' && (
          <button
            type="button"
            onClick={() => onChange({ loop: !track.loop })}
            title={track.loop ? 'Повторять до конца ролика' : 'Играть один раз'}
            aria-label="Повторять трек"
            className={cn(
              'grid h-5 w-5 place-items-center rounded border transition',
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
          className="grid h-5 w-5 place-items-center rounded border border-slate-700 text-slate-500 transition hover:border-rose-400/60 hover:text-rose-300"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </>
  );
}
