'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { Pause, Play, RotateCcw } from 'lucide-react';
import {
  formatTimelineDuration,
  sceneAtTime,
  timelineDurationSec,
  timelineTimings,
  type MediaLayer,
  type TextLayer,
  type Timeline,
} from '@allvision/shared';
// Konva работает только с DOM, поэтому холст грузим на клиенте: серверный рендер
// страницы не должен его касаться.
const SceneCanvas = dynamic(() => import('./canvas/SceneCanvas').then((m) => m.SceneCanvas), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse rounded-xl bg-slate-900" />,
});
import { mediaUrl } from './canvas/useMediaElements';
import type { Playback } from '@/components/editor/usePlayback';
import { cn } from '@/lib/utils';

/**
 * Сцена под курсором плюс транспорт.
 *
 * Часы считаем сами, а не по video.currentTime: сцен несколько, а время ролика должно идти
 * непрерывно даже на картинках и заливках. На паузе холст редактируемый, во время
 * проигрывания — обычный плеер.
 */
/**
 * Держит аудио-дорожку в такт с часами ролика.
 *
 * Начало берётся из startAtSec (когда дорожка вступает), позиция внутри файла — из
 * trimStartSec: те же два числа уходят в ffmpeg, поэтому предпросмотр звучит так же,
 * как готовый файл.
 */
function syncTrack(
  element: HTMLAudioElement | null,
  track: { volume: number; startAtSec: number; trimStartSec?: number } | undefined,
  time: number,
  playing: boolean,
  volumeScale: number,
) {
  if (!element || !track) return;
  element.volume = Math.min(1, Math.max(0, track.volume * volumeScale));
  const started = time >= track.startAtSec;
  const expected = Math.max(0, time - track.startAtSec) + (track.trimStartSec ?? 0);
  if (Math.abs(element.currentTime - expected) > 0.4) element.currentTime = expected;
  if (playing && started && element.paused) void element.play().catch(() => undefined);
  if ((!playing || !started) && !element.paused) element.pause();
}

export function EditorStage({
  timeline,
  selectedSceneIndex,
  onSelectScene,
  selectedLayerId,
  onSelectLayer,
  onChangeLayer,
  generationOverlay,
  playback,
  className,
}: {
  timeline: Timeline;
  selectedSceneIndex: number;
  onSelectScene: (index: number) => void;
  selectedLayerId: string | null;
  onSelectLayer: (layerId: string | null) => void;
  onChangeLayer: (sceneIndex: number, layerId: string, patch: Partial<MediaLayer> & Partial<TextLayer>) => void;
  /** Слой, который ждёт генерацию: на его месте рисуется рамка с прогрессом. */
  generationOverlay?: { layerId: string; progress: number; label: string } | null;
  /** Общие часы ролика: то же время показывает курсор на таймлайне. */
  playback: Playback;
  className?: string;
}) {
  const timings = useMemo(() => timelineTimings(timeline), [timeline]);
  const total = useMemo(() => timelineDurationSec(timeline), [timeline]);

  const { time, playing, seek, toggle, rewind } = playback;
  const musicRef = useRef<HTMLAudioElement | null>(null);
  const voiceRef = useRef<HTMLAudioElement | null>(null);

  // Музыка и голос идут своими дорожками и синхронизируются с общим временем ролика.
  // Под голос музыка приглушается тем же коэффициентом, что и на экспорте, — иначе
  // предпросмотр звучал бы не так, как готовый файл.
  useEffect(() => {
    const hasVoice = Boolean(timeline.voiceover);
    syncTrack(musicRef.current, timeline.music, time, playing, hasVoice ? 0.35 : 1);
    syncTrack(voiceRef.current, timeline.voiceover, time, playing, 1);
  }, [playing, time, timeline.music, timeline.voiceover]);

  const frame = useMemo(() => sceneAtTime(timeline, time), [timeline, time]);

  // На паузе показываем и правим ВЫБРАННУЮ сцену, а не ту, что под курсором времени:
  // иначе выделение сцены в ленте не совпадало бы с тем, что на холсте.
  const shownIndex = playing ? frame?.activeIndex ?? 0 : selectedSceneIndex;
  const incomingIndex = playing ? frame?.incomingIndex ?? null : null;
  const mix = playing ? frame?.mix ?? 0 : 0;

  const sceneTimeFor = useCallback(
    (index: number) => {
      const timing = timings[index];
      if (!timing) return 0;
      return playing ? Math.max(0, time - timing.startSec) : 0;
    },
    [timings, time, playing],
  );

  const shownScene = timeline.scenes[shownIndex];
  const incomingScene = incomingIndex === null ? null : timeline.scenes[incomingIndex];
  const musicSrc = mediaUrl(timeline.music?.url);
  const voiceSrc = mediaUrl(timeline.voiceover?.url);

  useEffect(() => {
    // Переход по времени во время проигрывания подсвечивает сцену в ленте.
    if (playing && frame && frame.activeIndex !== selectedSceneIndex) onSelectScene(frame.activeIndex);
    // onSelectScene стабилен у вызывающего; следить за ним не нужно.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, frame?.activeIndex]);

  return (
    <div className={cn('flex min-h-0 flex-col gap-3', className)}>
      {/* Кадр забирает всю свободную высоту, транспорт остаётся на месте. */}
      <div className="relative min-h-0 flex-1">
        {shownScene && (
          <SceneCanvas
            key={`scene-${shownIndex}`}
            scene={shownScene}
            aspect={timeline.aspect}
            sceneTimeSec={sceneTimeFor(shownIndex)}
            playing={playing}
            editable={!playing}
            selectedLayerId={selectedLayerId}
            onSelectLayer={onSelectLayer}
            onChangeLayer={(layerId, patch) => onChangeLayer(shownIndex, layerId, patch)}
            generationOverlay={shownIndex === selectedSceneIndex ? generationOverlay ?? null : null}
          />
        )}

        {incomingScene && (
          // Входящая сцена проявляется поверх уходящей — так же, как xfade в экспорте.
          <div className="pointer-events-none absolute inset-0" style={{ opacity: mix }}>
            <SceneCanvas
              key={`incoming-${incomingIndex}`}
              scene={incomingScene}
              aspect={timeline.aspect}
              sceneTimeSec={sceneTimeFor(incomingIndex!)}
              playing={playing}
              editable={false}
              selectedLayerId={null}
              onSelectLayer={() => undefined}
              onChangeLayer={() => undefined}
            />
          </div>
        )}

        {musicSrc && <audio ref={musicRef} src={musicSrc} preload="auto" className="hidden" />}
        {voiceSrc && <audio ref={voiceRef} src={voiceSrc} preload="auto" className="hidden" />}
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? 'Пауза' : 'Играть'}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-amber-400 text-slate-950 transition hover:bg-amber-300"
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </button>
        <button
          type="button"
          onClick={rewind}
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
            const next = Number(event.target.value);
            seek(next);
            const at = sceneAtTime(timeline, next);
            if (at) onSelectScene(at.activeIndex);
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
