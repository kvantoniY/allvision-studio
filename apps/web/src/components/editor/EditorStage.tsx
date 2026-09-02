'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import dynamic from 'next/dynamic';
import { Maximize2, Minimize2, Pause, Play, RotateCcw } from 'lucide-react';
import {
  formatTimelineDuration,
  sceneAtTime,
  timelineDurationSec,
  timelineAudioTracks,
  timelineTimings,
  type MediaLayer,
  type TextLayer,
  type Timeline,
  timelineScenes,
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
  track: { volume: number; startAtSec: number; trimStartSec?: number; durationSec?: number } | undefined,
  time: number,
  playing: boolean,
  volumeScale: number,
) {
  if (!element || !track) return;
  element.volume = Math.min(1, Math.max(0, track.volume * volumeScale));
  // Фрагмент замолкает на своей секунде, а не тянется до конца ролика.
  const ends = typeof track.durationSec === 'number' && track.durationSec > 0
    ? track.startAtSec + track.durationSec
    : Number.POSITIVE_INFINITY;
  const started = time >= track.startAtSec && time < ends;
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
  // На весь экран — единственный способ разглядеть кадр на телефоне, где превью
  // приходится держать небольшим, чтобы шкала и настройки оставались доступны.
  const [fullscreen, setFullscreen] = useState(false);
  const timings = useMemo(() => timelineTimings(timeline), [timeline]);
  const total = useMemo(() => timelineDurationSec(timeline), [timeline]);

  const { time, playing, seek, toggle, rewind, subscribe } = playback;
  const sliderRef = useRef<HTMLInputElement | null>(null);
  const clockRef = useRef<HTMLSpanElement | null>(null);

  /*
   * Плавные элементы транспорта обновляем напрямую в DOM.
   *
   * Держать их в состоянии значит перерисовывать весь редактор на каждый кадр — а это
   * шкала со всеми клипами, панели и инспектор. Подписка двигает ровно два узла.
   */
  useEffect(() => subscribe((seconds) => {
    const slider = sliderRef.current;
    if (slider && document.activeElement !== slider) slider.value = String(Math.min(seconds, total));
    const clock = clockRef.current;
    if (clock) clock.textContent = `${formatTimelineDuration(seconds)} / ${formatTimelineDuration(total)}`;
  }), [subscribe, total]);
  // По элементу на дорожку: их может быть несколько, и предпросмотр обязан звучать так же,
  // как готовый файл — иначе добавленная дорожка была бы слышна только после сборки.
  const audioRefs = useRef(new Map<string, HTMLAudioElement>());
  const audioTracks = useMemo(() => timelineAudioTracks(timeline), [timeline]);

  // Музыка и голос идут своими дорожками и синхронизируются с общим временем ролика.
  // Под голос музыка приглушается тем же коэффициентом, что и на экспорте, — иначе
  // предпросмотр звучал бы не так, как готовый файл.
  useEffect(() => {
    const hasVoice = audioTracks.some((track) => track.kind === 'voice');
    for (const track of audioTracks) {
      // Под голос музыка приглушается тем же коэффициентом, что и на экспорте.
      const scale = track.kind === 'music' && hasVoice ? 0.35 : 1;
      syncTrack(audioRefs.current.get(track.id) ?? null, track, time, playing, scale);
    }
  }, [playing, time, audioTracks]);

  // Останавливаем звук, когда холст уходит с экрана: иначе дорожка продолжает играть.
  useEffect(() => {
    const elements = audioRefs.current;
    return () => {
      for (const element of elements.values()) element.pause();
    };
  }, []);

  const frame = useMemo(() => sceneAtTime(timeline, time), [timeline, time]);

  // На паузе показываем и правим ВЫБРАННУЮ сцену, а не ту, что под курсором времени:
  // иначе выделение сцены в ленте не совпадало бы с тем, что на холсте.
  // Что показываем — решает курсор времени, и на паузе тоже: иначе перетаскивание
  // ползунка не меняло кадр, а он и есть главный способ найти нужное место.
  const shownIndex = frame?.activeIndex ?? selectedSceneIndex;
  const incomingIndex = playing ? frame?.incomingIndex ?? null : null;
  const mix = playing ? frame?.mix ?? 0 : 0;

  const sceneTimeFor = useCallback(
    (index: number) => {
      const timing = timings[index];
      if (!timing) return 0;
      return Math.max(0, time - timing.startSec);
    },
    [timings, time, playing],
  );

  // Из полного экрана выходят Esc — это ожидаемо везде, где что-то развернули.
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFullscreen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullscreen]);

  const scenes = useMemo(() => timelineScenes(timeline), [timeline]);
  const shownScene = scenes[shownIndex];
  const incomingScene = incomingIndex === null ? null : scenes[incomingIndex];

  useEffect(() => {
    // Переход по времени во время проигрывания подсвечивает сцену в ленте.
    if (playing && frame && frame.activeIndex !== selectedSceneIndex) onSelectScene(frame.activeIndex);
    // onSelectScene стабилен у вызывающего; следить за ним не нужно.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, frame?.activeIndex]);

  const body = (
    <div className={cn('flex min-h-0 flex-col gap-3', fullscreen ? 'h-full p-3' : className)}>
      {/* Кадр забирает всю свободную высоту, транспорт остаётся на месте. */}
      {/* overflow-hidden обязателен: холст считает размер сам и на узком экране мог
          вылезти за свою колонку, накрыв шкалу. */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
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

        {audioTracks.map((track) => {
          const src = mediaUrl(track.url);
          if (!src) return null;
          return (
            <audio
              key={track.id}
              ref={(element) => {
                if (element) audioRefs.current.set(track.id, element);
                else audioRefs.current.delete(track.id);
              }}
              src={src}
              preload="auto"
              className="hidden"
            />
          );
        })}
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
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
          ref={sliderRef}
          type="range"
          min={0}
          max={Math.max(total, 0.1)}
          step={0.05}
          defaultValue={0}
          onChange={(event) => {
            // Только перемотка: выбор сцены и так пересчитывается от времени, а искать её
            // здесь значило бы раскладывать весь ролик на каждое движение мыши.
            seek(Number(event.target.value));
          }}
          aria-label="Позиция в ролике"
          className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-slate-700 accent-amber-400"
        />
        <span ref={clockRef} className="hidden shrink-0 font-mono text-xs text-slate-400 sm:inline">
          {formatTimelineDuration(time)} / {formatTimelineDuration(total)}
        </span>
        <button
          type="button"
          onClick={() => setFullscreen((current) => !current)}
          aria-label={fullscreen ? 'Выйти из полноэкранного режима' : 'Во весь экран'}
          title={fullscreen ? 'Выйти из полноэкранного режима' : 'Во весь экран'}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-slate-700 text-slate-300 transition hover:border-slate-500 hover:text-white"
        >
          {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );

  if (!fullscreen) return body;

  // Портал, а не CSS: холст должен вырваться из колонки редактора со всеми её
  // ограничениями по высоте, иначе «во весь экран» покажет тот же маленький кадр.
  return typeof document === 'undefined'
    ? body
    : createPortal(
        <div className="fixed inset-0 z-[140] bg-slate-950">{body}</div>,
        document.body,
      );
}
