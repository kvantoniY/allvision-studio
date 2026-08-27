'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';
import {
  formatTimelineDuration,
  renderOverlaySvg,
  primaryMediaLayer,
  sceneAtTime,
  sourceTimeAt,
  timelineDurationSec,
  timelineResolution,
  timelineTimings,
  type Timeline,
  type TimelineScene,
} from '@allvision/shared';
import { cn } from '@/lib/utils';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:4000');

function mediaUrl(value?: string | null) {
  if (!value) return null;
  if (value.startsWith('/static/')) return `${API_URL}${value}`;
  return value;
}

type LayerState = {
  sceneIndex: number;
  opacity: number;
  translatePercent: number;
};

/**
 * Предпросмотр ролика.
 *
 * Свой лёгкий плеер вместо серверного рендера превью: два переиспользуемых video-элемента
 * в пинг-понг плюс CSS-переходы дают честную картинку за миллисекунды, тогда как рендер
 * каждой правки на сервере стоил бы минут ожидания.
 *
 * Точность здесь ограниченная и это осознанно: браузер и ffmpeg по-разному округляют кадры,
 * поэтому превью показывает композицию, тайминг и титры, но не является пиксельной копией.
 */
export function TimelinePlayer({ timeline, className }: { timeline: Timeline; className?: string }) {
  const timings = useMemo(() => timelineTimings(timeline), [timeline]);
  const total = useMemo(() => timelineDurationSec(timeline), [timeline]);
  const resolution = timelineResolution(timeline.aspect);

  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);

  const videoRefs = useRef<Array<HTMLVideoElement | null>>([null, null]);
  const musicRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const clockRef = useRef<{ startedAt: number; offset: number } | null>(null);
  // Какая сцена сейчас в каком слое: нужно, чтобы не переприсваивать src на каждом кадре —
  // переприсваивание перезагружает видео и даёт чёрные вспышки.
  const assignedRef = useRef<Array<number | null>>([null, null]);

  const frame = useMemo(() => sceneAtTime(timeline, time), [timeline, time]);

  const layers: LayerState[] = useMemo(() => {
    if (!frame) return [];
    const kind = timeline.scenes[frame.activeIndex]?.transition ?? 'cut';
    const base: LayerState = { sceneIndex: frame.activeIndex, opacity: 1, translatePercent: 0 };
    if (frame.incomingIndex === null) return [base];

    const incoming: LayerState = { sceneIndex: frame.incomingIndex, opacity: frame.mix, translatePercent: 0 };
    if (kind === 'fade-black') {
      // Через чёрный: сначала гаснет уходящая половина, потом проявляется приходящая.
      base.opacity = Math.max(0, 1 - frame.mix * 2);
      incoming.opacity = Math.max(0, frame.mix * 2 - 1);
    } else if (kind === 'slide') {
      incoming.opacity = 1;
      incoming.translatePercent = (1 - frame.mix) * 100;
      base.translatePercent = -frame.mix * 30;
    }
    return [base, incoming];
  }, [frame, timeline.scenes]);

  const sceneTimeFor = useCallback(
    (index: number, at: number) => sourceTimeAt(timeline, index, at),
    [timeline],
  );

  // Раскладываем сцены по видео-элементам и держим их время синхронным с таймлайном.
  useEffect(() => {
    layers.forEach((layer, slot) => {
      const element = videoRefs.current[slot];
      if (!element) return;
      const scene = timeline.scenes[layer.sceneIndex];
      const primary = scene ? primaryMediaLayer(scene) : undefined;
      if (!primary || primary.source.kind !== 'video') return;

      const url = mediaUrl(primary.source.url);
      if (!url) return;

      if (assignedRef.current[slot] !== layer.sceneIndex) {
        assignedRef.current[slot] = layer.sceneIndex;
        element.src = url;
        element.currentTime = sceneTimeFor(layer.sceneIndex, time);
      }
      element.muted = primary.muted;
      element.volume = Math.min(1, primary.volume);

      // Мелкое расхождение неизбежно (браузер не перематывает по кадрам), поэтому
      // подтягиваем время только когда разошлись заметно — иначе видео дёргается.
      const expected = sceneTimeFor(layer.sceneIndex, time);
      if (Math.abs(element.currentTime - expected) > 0.35) {
        element.currentTime = expected;
      }
      if (playing && element.paused) void element.play().catch(() => undefined);
      if (!playing && !element.paused) element.pause();
    });
  }, [layers, playing, time, timeline.scenes, sceneTimeFor]);

  // Часы плеера. Считаем время сами, а не по video.currentTime: сцен несколько,
  // а время ролика должно идти непрерывно даже на картинках и заливках.
  useEffect(() => {
    if (!playing) {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      clockRef.current = null;
      return;
    }
    clockRef.current = { startedAt: performance.now(), offset: time >= total ? 0 : time };

    const tick = () => {
      const clock = clockRef.current;
      if (!clock) return;
      const next = clock.offset + (performance.now() - clock.startedAt) / 1000;
      if (next >= total) {
        setTime(total);
        setPlaying(false);
        return;
      }
      setTime(next);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
    // time намеренно не в зависимостях: он меняется каждый кадр и перезапускал бы часы.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, total]);

  // Музыка идёт отдельной дорожкой и синхронизируется с общим временем.
  useEffect(() => {
    const element = musicRef.current;
    if (!element || !timeline.music) return;
    element.volume = Math.min(1, timeline.music.volume);
    const expected = Math.max(0, time - timeline.music.startAtSec);
    if (Math.abs(element.currentTime - expected) > 0.4) element.currentTime = expected;
    if (playing && time >= timeline.music.startAtSec && element.paused) {
      void element.play().catch(() => undefined);
    }
    if ((!playing || time < timeline.music.startAtSec) && !element.paused) element.pause();
  }, [playing, time, timeline.music]);

  // Смена раскладки на паузе (пользователь правит сцену) должна быть видна сразу.
  useEffect(() => {
    if (time > total) setTime(total);
  }, [total, time]);

  const musicUrl = mediaUrl(timeline.music?.url);

  return (
    <div className={cn('space-y-3', className)}>
      <div
        className="relative mx-auto w-full overflow-hidden rounded-xl bg-black"
        style={{ aspectRatio: `${resolution.width} / ${resolution.height}`, maxHeight: '58vh' }}
      >
        {layers.map((layer, slot) => (
          <SceneLayer
            key={slot}
            slot={slot}
            layer={layer}
            scene={timeline.scenes[layer.sceneIndex]}
            videoRef={(element) => {
              videoRefs.current[slot] = element;
            }}
          />
        ))}
        <OverlayLayer time={time} timings={timings} resolution={resolution} />
        {musicUrl && <audio ref={musicRef} src={musicUrl} preload="auto" className="hidden" />}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setPlaying((value) => !value)}
          aria-label={playing ? 'Пауза' : 'Играть'}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-amber-400 text-slate-950 transition hover:bg-amber-300"
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </button>
        <button
          type="button"
          onClick={() => {
            setPlaying(false);
            setTime(0);
          }}
          aria-label="В начало"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-slate-700 text-slate-300 transition hover:border-slate-500 hover:text-white"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
        <input
          type="range"
          min={0}
          max={Math.max(total, 0.1)}
          step={0.05}
          value={Math.min(time, total)}
          onChange={(event) => {
            setPlaying(false);
            setTime(Number(event.target.value));
          }}
          aria-label="Позиция в ролике"
          className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-slate-700 accent-amber-400"
        />
        <span className="shrink-0 font-mono text-xs text-slate-400">
          {formatTimelineDuration(time)} / {formatTimelineDuration(total)}
        </span>
      </div>
    </div>
  );
}

function SceneLayer({
  slot,
  layer,
  scene,
  videoRef,
}: {
  slot: number;
  layer: LayerState;
  scene?: TimelineScene;
  videoRef: (element: HTMLVideoElement | null) => void;
}) {
  const style = {
    opacity: layer.opacity,
    transform: layer.translatePercent ? `translateX(${layer.translatePercent}%)` : undefined,
  };

  if (!scene) return null;
  const primary = primaryMediaLayer(scene);
  if (!primary) return null;
  const source = primary.source;

  if (source.kind === 'color') {
    return <div className="absolute inset-0" style={{ ...style, backgroundColor: source.color ?? '#000000' }} />;
  }

  if (source.kind === 'image') {
    const url = mediaUrl(source.url);
    return (
      <div className="absolute inset-0" style={style}>
        {url && <img src={url} alt="" className="h-full w-full object-contain" />}
      </div>
    );
  }

  return (
    <video
      // Ключ по слоту, а не по сцене: элементы переиспользуются, иначе React пересоздавал бы
      // их на каждой смене сцены и видео каждый раз грузилось бы заново.
      key={`video-${slot}`}
      ref={videoRef}
      playsInline
      preload="auto"
      className="absolute inset-0 h-full w-full object-contain"
      style={style}
    />
  );
}

/**
 * Титры. Рисуются тем же SVG, что уходит в экспорт, поэтому предпросмотр и файл
 * совпадают по разбивке строк и положению блока.
 */
function OverlayLayer({
  time,
  timings,
  resolution,
}: {
  time: number;
  timings: ReturnType<typeof timelineTimings>;
  resolution: { width: number; height: number };
}) {
  const visible = useMemo(() => {
    const result: string[] = [];
    for (const timing of timings) {
      const localTime = time - timing.startSec;
      if (localTime < 0 || localTime > timing.durationSec) continue;
      for (const overlay of timing.scene.overlays) {
        const start = overlay.startSec ?? 0;
        const end = overlay.endSec ?? timing.durationSec;
        if (localTime < start || localTime > end) continue;
        result.push(renderOverlaySvg(overlay, resolution));
      }
    }
    return result;
  }, [timings, time, resolution]);

  if (visible.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0">
      {visible.map((svg, index) => (
        <div
          key={index}
          className="absolute inset-0 [&>svg]:h-full [&>svg]:w-full"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ))}
    </div>
  );
}
