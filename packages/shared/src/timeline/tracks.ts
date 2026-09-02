import { z } from 'zod';
import {
  TIMELINE_LIMITS,
  TIMELINE_TRANSITIONS,
  type Timeline,
  type TimelineScene,
  type TimelineTransition,
} from './types';
import {
  FULL_FRAME_BOX,
  layerSpeed,
  mediaLayerSchema,
  sceneLayerSchema,
  sceneLayers,
  type MediaLayer,
  type SceneLayer,
} from './layers';

/**
 * Дорожки и клипы.
 *
 * Сцена — это «кадры идут друг за другом, каждый следующий начинается там, где кончился
 * предыдущий». Из такой записи не следует ничего из того, что человек ждёт от монтажа:
 * клип нельзя подвинуть по времени, между кадрами нельзя оставить паузу, нельзя положить
 * подпись поверх двух кадров сразу. Поэтому появился второй способ записи: дорожки, на
 * которых клипы стоят на своих секундах.
 *
 * Первая дорожка — основная: она задаёт, что видно в кадре целиком. Остальные ложатся
 * поверх, каждая в своей рамке. Это ровно та модель, к которой люди привыкли в CapCut.
 *
 * Рендер и предпросмотр про дорожки не знают: `flattenTracks()` раскладывает их обратно в
 * последовательность сцен. Так у ролика остаётся один источник правды, а вся проверенная
 * цепочка сборки (переходы, титры, микс звука) работает без изменений — и, что важнее,
 * предпросмотр по-прежнему показывает ровно то, что окажется в файле.
 */

export const TRACK_LIMITS = {
  /** Дорожек на ролик: больше — и предпросмотр на телефоне перестаёт тянуть. */
  maxTracks: 6,
  maxClipsPerTrack: 60,
  minClipDurationSec: 0.2,
} as const;

export const timelineClipSchema = z.object({
  id: z.string().trim().min(1).max(80),
  /** Секунда РОЛИКА, на которой клип появляется. */
  startSec: z.number().min(0).max(TIMELINE_LIMITS.maxTotalDurationSec).default(0),
  /** Сколько клип занимает на дорожке. */
  durationSec: z
    .number()
    .min(TRACK_LIMITS.minClipDurationSec)
    .max(TIMELINE_LIMITS.maxSceneDurationSec),
  /** Что показывает клип: кадр, заливка или текст. Геометрия и обрезка живут здесь же. */
  layer: sceneLayerSchema,
  /**
   * Переход к СЛЕДУЮЩЕМУ клипу этой дорожки. Работает только на основной дорожке:
   * наложение поверх и так появляется и исчезает по своим секундам.
   */
  transition: z.enum(TIMELINE_TRANSITIONS).default('cut'),
});

export type TimelineClip = z.infer<typeof timelineClipSchema>;

export const timelineTrackSchema = z.object({
  id: z.string().trim().min(1).max(80),
  title: z.string().trim().max(80).optional(),
  clips: z.array(timelineClipSchema).max(TRACK_LIMITS.maxClipsPerTrack).default([]),
  /** Скрытая дорожка не попадает ни в предпросмотр, ни в файл, но и не теряется. */
  hidden: z.boolean().default(false),
  /** Заглушить звук всех клипов дорожки разом. */
  muted: z.boolean().default(false),
});

export type TimelineTrack = z.infer<typeof timelineTrackSchema>;

export function clipEndSec(clip: TimelineClip): number {
  return clip.startSec + clip.durationSec;
}

/** Клипы дорожки по времени: порядок в массиве — дело редактора, а не истина. */
export function sortedClips(track: TimelineTrack): TimelineClip[] {
  return [...track.clips].sort((a, b) => a.startSec - b.startSec);
}

/** Последняя секунда, на которой на дорожках ещё что-то есть. */
export function tracksDurationSec(tracks: TimelineTrack[]): number {
  let end = 0;
  for (const track of tracks) {
    for (const clip of track.clips) {
      end = Math.max(end, clipEndSec(clip));
    }
  }
  return Number(end.toFixed(3));
}

/**
 * Переход между соседними клипами основной дорожки.
 *
 * Наложение задаётся самими позициями: следующий клип начинается ДО того, как кончился
 * предыдущий. Так секунда на шкале и секунда в файле — одно и то же число, и переход
 * не сдвигает всё, что идёт дальше. Наложение ограничено половиной короткого из двух
 * клипов: иначе короткий исчезнет в переходе целиком.
 */
export function clipTransitionSec(clip: TimelineClip, next: TimelineClip | undefined): number {
  if (!next) return 0;
  if (clip.transition === 'cut') return 0;
  const overlap = clipEndSec(clip) - next.startSec;
  if (overlap <= 0) return 0;
  const maxByClips = Math.min(clip.durationSec, next.durationSec) / 2;
  return Math.max(0, Math.min(overlap, TIMELINE_LIMITS.maxTransitionDurationSec, maxByClips));
}

function withTiming(layer: SceneLayer, startSec: number, endSec: number, segmentDuration: number): SceneLayer {
  const start = Math.max(0, Number(startSec.toFixed(3)));
  const end = Math.min(segmentDuration, Number(endSec.toFixed(3)));
  const full = start <= 0.001 && end >= segmentDuration - 0.001;
  return { ...layer, startSec: full ? undefined : start, endSec: full ? undefined : end };
}

/**
 * Кусок медиа-слоя за окно [from, to) внутри клипа.
 *
 * У видео сдвигается и обрезка: если подпись или вставка попала на стык основной дорожки,
 * её придётся разрезать на две сцены, и вторая половина обязана начинаться с той же секунды
 * файла, на которой закончилась первая. Иначе видео на стыке дёрнется в начало.
 *
 * Обрезка считается в секундах ФАЙЛА, а окно — в секундах ролика, поэтому ускоренный клип
 * съедает пропорционально больше исходника: секунда на дорожке при скорости 2 — это две
 * секунды записи.
 */
function sliceLayer(layer: SceneLayer, offsetSec: number, lengthSec: number): SceneLayer {
  if (layer.kind !== 'media' || layer.source.kind !== 'video') return layer;
  const media = layer as MediaLayer;
  const speed = layerSpeed(media);
  const trimStart = (media.trimStartSec ?? 0) + Math.max(0, offsetSec) * speed;
  return { ...media, trimStartSec: trimStart, trimEndSec: trimStart + lengthSec * speed };
}

type Segment = { startSec: number; endSec: number; clip: TimelineClip | null };

/**
 * Разрезы основной дорожки.
 *
 * Пауза между клипами — это не ошибка, а приём: на ней остаётся фон ролика. Поэтому
 * пропуск превращается в такой же отрезок, просто без основного кадра.
 */
function mainSegments(main: TimelineTrack | undefined, totalSec: number): Segment[] {
  const clips = main ? sortedClips(main) : [];
  const segments: Segment[] = [];
  let cursor = 0;

  clips.forEach((clip, index) => {
    const next = clips[index + 1];
    const overlap = clipTransitionSec(clip, next);
    // Наложение без перехода — это не кроссфейд, а обрезка: следующий клип просто
    // закрывает предыдущий. Считаем так же, как потом склеит ffmpeg.
    const hardCut = next && clip.transition === 'cut' ? Math.max(0, clipEndSec(clip) - next.startSec) : 0;

    if (clip.startSec > cursor + 0.001) {
      segments.push({ startSec: cursor, endSec: clip.startSec, clip: null });
    }
    const start = Math.max(cursor, clip.startSec);
    const end = clipEndSec(clip) - hardCut;
    if (end > start + 0.001) {
      segments.push({ startSec: start, endSec: end, clip });
    }
    cursor = end - overlap;
  });

  if (totalSec > cursor + 0.001) {
    segments.push({ startSec: cursor, endSec: totalSec, clip: null });
  }
  return segments;
}

/**
 * Раскладывает дорожки обратно в последовательность сцен.
 *
 * Это и есть мост между новой моделью монтажа и старой моделью сборки. Каждый разрез
 * основной дорожки становится сценой, а всё, что в этот момент лежит поверх, — её слоями
 * с окном видимости. Никакой новой математики времени: абсолютные позиции клипов
 * сохраняются один в один, потому что переход на дорожках — это и есть наложение.
 */
export function flattenTracks(tracks: TimelineTrack[], options?: { background?: string }): TimelineScene[] {
  const visible = tracks.filter((track) => !track.hidden);
  const [main, ...overlays] = visible;
  const totalSec = tracksDurationSec(visible);
  if (totalSec <= 0) return [];

  const segments = mainSegments(main, totalSec);
  const scenes: TimelineScene[] = [];

  segments.forEach((segment, index) => {
    const duration = Number((segment.endSec - segment.startSec).toFixed(3));
    if (duration < TRACK_LIMITS.minClipDurationSec) return;

    const layers: SceneLayer[] = [];
    if (segment.clip) {
      const offset = segment.startSec - segment.clip.startSec;
      layers.push(sliceLayer(segment.clip.layer, offset, duration));
    } else {
      // Пауза на основной дорожке — это заливка во весь кадр, а не пропуск. Выбросить
      // её было бы хуже, чем показать фон: всё, что идёт дальше, уехало бы вперёд.
      layers.push(
        mediaLayerSchema.parse({
          id: `gap_${index + 1}_bg`,
          kind: 'media',
          source: { kind: 'color', color: options?.background ?? '#000000' },
          box: FULL_FRAME_BOX,
          locked: true,
        }),
      );
    }

    for (const track of overlays) {
      for (const clip of sortedClips(track)) {
        const from = Math.max(segment.startSec, clip.startSec);
        const to = Math.min(segment.endSec, clipEndSec(clip));
        if (to <= from + 0.001) continue;
        const sliced = sliceLayer(clip.layer, from - clip.startSec, to - from);
        const muted = track.muted && sliced.kind === 'media' ? { ...sliced, muted: true } : sliced;
        layers.push(withTiming(muted, from - segment.startSec, to - segment.startSec, duration));
      }
    }

    if (layers.length === 0) return;

    const nextClip = segment.clip ? sortedClips(main!)[sortedClips(main!).indexOf(segment.clip) + 1] : undefined;
    const transitionSec = segment.clip ? clipTransitionSec(segment.clip, nextClip) : 0;

    scenes.push({
      id: segment.clip ? segment.clip.id : `gap_${index + 1}`,
      layers,
      background: options?.background,
      durationSec: duration,
      transition: transitionSec > 0 ? segment.clip!.transition : 'cut',
      transitionDurationSec: transitionSec > 0 ? transitionSec : undefined,
      muted: false,
      volume: 1,
      overlays: [],
    });
  });

  return scenes;
}

/**
 * Сцены ролика независимо от того, как он записан.
 *
 * Единственная точка чтения: рендер, предпросмотр и подсчёт длительности зовут её, а не
 * `timeline.scenes`. Пока в проекте живут обе формы записи, проверка «а вдруг дорожки»
 * в трёх местах — верный способ забыть её в четвёртом.
 */
/**
 * Кэш разложенных сцен.
 *
 * Раскладка дорожек — не бесплатная операция: она нарезает клипы по стыкам и разбирает
 * схемой каждый слой. Вызывают её многие (рендер, плеер, шкала, подсчёт длительности), и
 * во время проигрывания — по многу раз в секунду. Ролик при этом неизменяем: любая правка
 * создаёт новый объект, поэтому по ссылке можно кэшировать без риска отдать устаревшее.
 *
 * WeakMap, а не Map: закрытый ролик не должен держать свои сцены в памяти вкладки.
 */
const scenesCache = new WeakMap<Timeline, TimelineScene[]>();

export function timelineScenes(timeline: Timeline): TimelineScene[] {
  const cached = scenesCache.get(timeline);
  if (cached) return cached;

  const tracks = timelineTracks(timeline);
  let scenes: TimelineScene[] = timeline.scenes ?? [];
  if (tracks.length > 0) {
    const flattened = flattenTracks(tracks);
    if (flattened.length > 0) scenes = flattened;
  }
  scenesCache.set(timeline, scenes);
  return scenes;
}

/**
 * Дорожки ролика, если он записан ими.
 *
 * Дорожки приезжают из БД обычным JSON, поэтому разбираем схемой и молча отбрасываем
 * битые: одна испорченная дорожка не должна ронять весь ролик.
 */
export function timelineTracks(timeline: Timeline): TimelineTrack[] {
  if (!timeline.tracks || timeline.tracks.length === 0) return [];
  const parsed: TimelineTrack[] = [];
  for (const raw of timeline.tracks) {
    const result = timelineTrackSchema.safeParse(raw);
    if (result.success) parsed.push(result.data);
  }
  return parsed;
}

/**
 * Переводит ролик на дорожки.
 *
 * Каждая сцена становится клипом основной дорожки, а её дополнительные слои —
 * клипами дорожек поверх: слой, который лежал вторым в сцене, окажется на второй дорожке.
 * Так ролик, собранный сценами (и любой из двенадцати шаблонов поздравлений), открывается
 * в новом редакторе без переписывания данных.
 */
export function tracksFromScenes(scenes: TimelineScene[], timings: Array<{ startSec: number; durationSec: number }>): TimelineTrack[] {
  const main: TimelineClip[] = [];
  const overlayTracks: TimelineClip[][] = [];

  scenes.forEach((scene, index) => {
    const timing = timings[index];
    if (!timing) return;
    const layers = sceneLayers(scene);
    if (layers.length === 0) return;

    const [first, ...rest] = layers;
    main.push(
      timelineClipSchema.parse({
        id: scene.id,
        startSec: Number(timing.startSec.toFixed(3)),
        durationSec: Number(timing.durationSec.toFixed(3)),
        layer: first,
        transition: scene.transition,
      }),
    );

    rest.forEach((layer, depth) => {
      // Окно видимости слоя внутри сцены становится позицией клипа на ролике.
      const from = timing.startSec + Math.max(0, layer.startSec ?? 0);
      const to = timing.startSec + Math.min(timing.durationSec, layer.endSec ?? timing.durationSec);
      if (to <= from) return;
      if (!overlayTracks[depth]) overlayTracks[depth] = [];
      overlayTracks[depth].push(
        timelineClipSchema.parse({
          id: `${scene.id}_${layer.id}`,
          startSec: Number(from.toFixed(3)),
          durationSec: Number((to - from).toFixed(3)),
          layer: { ...layer, startSec: undefined, endSec: undefined },
          transition: 'cut',
        }),
      );
    });
  });

  const tracks: TimelineTrack[] = [
    timelineTrackSchema.parse({ id: 'track_main', title: 'Основная', clips: main }),
  ];
  overlayTracks.slice(0, TRACK_LIMITS.maxTracks - 1).forEach((clips, depth) => {
    if (clips.length === 0) return;
    tracks.push(timelineTrackSchema.parse({ id: `track_${depth + 2}`, title: `Слой ${depth + 2}`, clips }));
  });
  return tracks;
}

export type TrackIssue = { code: string; message: string; trackId?: string; clipId?: string };

/** Проверки дорожек, которые не выражаются схемой: они смотрят на дорожку целиком. */
export function validateTracks(tracks: TimelineTrack[]): TrackIssue[] {
  const issues: TrackIssue[] = [];
  if (tracks.length > TRACK_LIMITS.maxTracks) {
    issues.push({ code: 'TOO_MANY_TRACKS', message: `Дорожек больше допустимого: ${tracks.length} из ${TRACK_LIMITS.maxTracks}.` });
  }

  const seen = new Set<string>();
  for (const track of tracks) {
    if (seen.has(track.id)) {
      issues.push({ code: 'DUPLICATE_TRACK_ID', message: `Повторяющийся id дорожки: ${track.id}.`, trackId: track.id });
    }
    seen.add(track.id);

    const clips = sortedClips(track);
    clips.forEach((clip, index) => {
      const next = clips[index + 1];
      if (!next) return;
      const overlap = clipEndSec(clip) - next.startSec;
      // Наложение больше половины короткого клипа съело бы его целиком — ни в переходе,
      // ни в перекрытии от такого клипа ничего не останется.
      if (overlap > Math.min(clip.durationSec, next.durationSec) / 2) {
        issues.push({
          code: 'CLIPS_OVERLAP',
          message: 'Клипы наложены друг на друга слишком сильно.',
          trackId: track.id,
          clipId: clip.id,
        });
      }
    });
  }

  const total = tracksDurationSec(tracks);
  if (total > TIMELINE_LIMITS.maxTotalDurationSec) {
    issues.push({
      code: 'TOO_LONG',
      message: `Ролик длиннее допустимого: ${Math.round(total)} с из ${TIMELINE_LIMITS.maxTotalDurationSec}.`,
    });
  }
  return issues;
}

export type { TimelineTransition };
