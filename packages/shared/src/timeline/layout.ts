import {
  TIMELINE_LIMITS,
  type Timeline,
  type TimelineAspect,
  type TimelineScene,
  type TimelineTextOverlay,
} from './types';
import { primaryMediaLayer, sceneLayers } from './layers';

export type TimelineResolution = { width: number; height: number };

/**
 * Целевое разрешение кадра. Вертикаль — основной формат: подарок отправляют
 * в мессенджер, а не смотрят на телевизоре.
 */
const RESOLUTIONS: Record<TimelineAspect, TimelineResolution> = {
  '9:16': { width: 1080, height: 1920 },
  '16:9': { width: 1920, height: 1080 },
  '1:1': { width: 1080, height: 1080 },
  '4:5': { width: 1080, height: 1350 },
};

export function timelineResolution(aspect: TimelineAspect): TimelineResolution {
  return RESOLUTIONS[aspect] ?? RESOLUTIONS['9:16'];
}

export const TIMELINE_FPS = 30;

/** Длительность сцены по умолчанию, когда её нельзя вывести из источника. */
export const DEFAULT_IMAGE_SCENE_SEC = 4;

/**
 * Длительность сцены в готовом ролике.
 *
 * Для видео она берётся из обрезки; если обрезка не задана, полагаемся на явную
 * durationSec (её проставляет редактор после ffprobe) и лишь в последнюю очередь
 * на дефолт — молча ронять сцену из-за неизвестной длины нельзя.
 */
export function sceneDurationSec(scene: TimelineScene): number {
  // Длину задаёт главный видео-слой: именно его обрезку тянул пользователь.
  const primary = primaryMediaLayer(scene);
  if (primary?.source.kind === 'video') {
    const start = primary.trimStartSec ?? 0;
    const end = primary.trimEndSec;
    if (typeof end === 'number' && end > start) {
      return clampSceneDuration(end - start);
    }
  }
  if (typeof scene.durationSec === 'number' && scene.durationSec > 0) {
    return clampSceneDuration(scene.durationSec);
  }
  return DEFAULT_IMAGE_SCENE_SEC;
}

function clampSceneDuration(value: number): number {
  return Math.min(TIMELINE_LIMITS.maxSceneDurationSec, Math.max(TIMELINE_LIMITS.minSceneDurationSec, value));
}

/**
 * Фактическая длительность перехода между сценами.
 *
 * xfade съедает хвост предыдущей сцены и начало следующей, поэтому переход не может
 * быть длиннее половины любой из них — иначе сцена исчезнет целиком.
 */
export function transitionDurationSec(scene: TimelineScene, next: TimelineScene | undefined): number {
  if (!next) return 0;
  if (scene.transition === 'cut') return 0;
  const requested = scene.transitionDurationSec ?? 0.5;
  const maxByScenes = Math.min(sceneDurationSec(scene), sceneDurationSec(next)) / 2;
  return Math.max(0, Math.min(requested, TIMELINE_LIMITS.maxTransitionDurationSec, maxByScenes));
}

export type SceneTiming = {
  scene: TimelineScene;
  index: number;
  /** Секунда готового ролика, на которой сцена появляется. */
  startSec: number;
  durationSec: number;
  /** Переход к следующей сцене; 0 — стык встык. */
  transitionOutSec: number;
};

/**
 * Раскладка сцен по времени готового ролика. Из-за нахлёста переходов начало сцены
 * не равно сумме предыдущих длительностей — это и есть причина считать раскладку
 * в одном месте, а не по месту использования.
 */
export function timelineTimings(timeline: Timeline): SceneTiming[] {
  const timings: SceneTiming[] = [];
  let cursor = 0;
  timeline.scenes.forEach((scene, index) => {
    const duration = sceneDurationSec(scene);
    const transitionOut = transitionDurationSec(scene, timeline.scenes[index + 1]);
    timings.push({ scene, index, startSec: cursor, durationSec: duration, transitionOutSec: transitionOut });
    cursor += duration - transitionOut;
  });
  return timings;
}

/** Полная длительность ролика с учётом нахлёста переходов. */
export function timelineDurationSec(timeline: Timeline): number {
  const timings = timelineTimings(timeline);
  const last = timings[timings.length - 1];
  if (!last) return 0;
  return Number((last.startSec + last.durationSec).toFixed(3));
}

export type PlayheadFrame = {
  /** Сцена, которая сейчас на экране. */
  activeIndex: number;
  /** Следующая сцена, если мы внутри перехода; иначе null. */
  incomingIndex: number | null;
  /** Доля перехода 0..1: 0 — видна только активная сцена, 1 — переход закончился. */
  mix: number;
};

/**
 * Что показывать в момент t.
 *
 * Плеер предпросмотра и ffmpeg должны сходиться именно здесь: если тайминг перехода
 * посчитан по-разному, превью покажет не тот кадр, что окажется в файле. Поэтому расчёт
 * общий, а не свой у каждой стороны.
 */
export function sceneAtTime(timeline: Timeline, seconds: number): PlayheadFrame | null {
  const timings = timelineTimings(timeline);
  if (timings.length === 0) return null;
  const time = Math.max(0, seconds);

  // Активная сцена — ПЕРВАЯ, которая ещё не закончилась. Внутри перехода сцены
  // перекрываются, и если брать последнюю начавшуюся, уходящий кадр пропадёт
  // раньше времени: переход выглядел бы как резкая склейка.
  let activeIndex = timings.length - 1;
  for (let i = 0; i < timings.length; i += 1) {
    if (time < timings[i].startSec + timings[i].durationSec) {
      activeIndex = i;
      break;
    }
  }

  const active = timings[activeIndex];
  const next = timings[activeIndex + 1];
  if (!next || active.transitionOutSec <= 0 || time < next.startSec) {
    return { activeIndex, incomingIndex: null, mix: 0 };
  }
  const mix = Math.min(1, Math.max(0, (time - next.startSec) / active.transitionOutSec));
  return { activeIndex, incomingIndex: activeIndex + 1, mix };
}

/** Время внутри исходного файла сцены для момента t (с учётом обрезки). */
export function sourceTimeAt(timeline: Timeline, sceneIndex: number, seconds: number): number {
  const timing = timelineTimings(timeline)[sceneIndex];
  if (!timing) return 0;
  const primary = primaryMediaLayer(timing.scene);
  const trimStart = primary?.source.kind === 'video' ? primary.trimStartSec ?? 0 : 0;
  return trimStart + Math.max(0, seconds - timing.startSec);
}

export type OverlayTiming = {
  overlay: TimelineTextOverlay;
  sceneIndex: number;
  /** Абсолютные секунды готового ролика. */
  startSec: number;
  endSec: number;
};

/**
 * Титры в абсолютном времени ролика: ffmpeg включает наложение по enable=between(t,..),
 * а плеер предпросмотра сравнивает те же числа с currentTime.
 */
export function timelineOverlayTimings(timeline: Timeline): OverlayTiming[] {
  const result: OverlayTiming[] = [];
  for (const timing of timelineTimings(timeline)) {
    for (const overlay of timing.scene.overlays) {
      const start = Math.max(0, overlay.startSec ?? 0);
      const end = Math.min(timing.durationSec, overlay.endSec ?? timing.durationSec);
      if (end <= start) continue;
      result.push({
        overlay,
        sceneIndex: timing.index,
        startSec: Number((timing.startSec + start).toFixed(3)),
        endSec: Number((timing.startSec + end).toFixed(3)),
      });
    }
  }
  return result;
}

/**
 * Ставит готовый материал в сцену, которая его ждала.
 *
 * Сцену ищем по метке generationProjectId, а не по индексу: пока шла генерация,
 * пользователь мог переставить сцены местами или добавить новые, и позиция уехала бы.
 * Обрезка сбрасывается — она относилась к прежнему файлу.
 */
export function applyGeneratedSource(
  timeline: Timeline,
  generationProjectId: string,
  source: { kind: 'video' | 'image'; url: string },
): { timeline: Timeline; changed: boolean } {
  let changed = false;

  const scenes = timeline.scenes.map((scene) => {
    // Новая форма: метку несёт конкретный слой, и материал встаёт именно в него —
    // остальные слои коллажа трогать нельзя.
    const layers = sceneLayers(scene);
    const target = layers.find(
      (layer) => layer.kind === 'media' && layer.generationProjectId === generationProjectId,
    );
    if (!target) return scene;

    changed = true;
    const nextLayers = layers.map((layer) =>
      layer === target
        ? { ...layer, source, trimStartSec: undefined, trimEndSec: undefined }
        : layer,
    );
    return {
      ...scene,
      layers: nextLayers,
      // Сцена старой формы здесь же переезжает на слои: держать обе записи разом
      // значило бы иметь два источника правды об одном кадре.
      source: undefined,
      overlays: [],
      trimStartSec: undefined,
      trimEndSec: undefined,
      durationSec: source.kind === 'image' ? scene.durationSec ?? DEFAULT_IMAGE_SCENE_SEC : scene.durationSec,
    };
  });

  return { timeline: changed ? { ...timeline, scenes } : timeline, changed };
}

export type TimelineIssue = { code: string; message: string; sceneId?: string };

/**
 * Проверки, которые не выражаются схемой: они смотрят на таймлайн целиком.
 * Возвращаем список, а не бросаем, — редактору нужно показать все проблемы разом.
 */
export function validateTimeline(timeline: Timeline, options?: { maxScenes?: number }): TimelineIssue[] {
  const issues: TimelineIssue[] = [];
  const maxScenes = options?.maxScenes ?? TIMELINE_LIMITS.maxScenes;

  if (timeline.scenes.length > maxScenes) {
    issues.push({
      code: 'TOO_MANY_SCENES',
      message: `Сцен больше допустимого: ${timeline.scenes.length} из ${maxScenes}.`,
    });
  }

  const seen = new Set<string>();
  for (const scene of timeline.scenes) {
    if (seen.has(scene.id)) {
      issues.push({ code: 'DUPLICATE_SCENE_ID', message: `Повторяющийся id сцены: ${scene.id}.`, sceneId: scene.id });
    }
    seen.add(scene.id);

    const layers = sceneLayers(scene);
    if (layers.length === 0) {
      issues.push({ code: 'EMPTY_SCENE', message: 'В сцене нет ни одного слоя.', sceneId: scene.id });
    }
    for (const layer of layers) {
      if (layer.kind !== 'media') continue;
      if (layer.source.kind === 'color') {
        if (!layer.source.color) {
          issues.push({ code: 'COLOR_REQUIRED', message: 'У слоя-заливки не задан цвет.', sceneId: scene.id });
        }
      } else if (!layer.source.url) {
        issues.push({ code: 'SOURCE_REQUIRED', message: 'У слоя не задан файл-источник.', sceneId: scene.id });
      }
      if (
        typeof layer.trimStartSec === 'number'
        && typeof layer.trimEndSec === 'number'
        && layer.trimEndSec <= layer.trimStartSec
      ) {
        issues.push({ code: 'INVALID_TRIM', message: 'Конец обрезки раньше начала.', sceneId: scene.id });
      }
    }

    // Прежняя форма записи проверяется отдельно: у неё источник лежит на самой сцене.
    if (!scene.layers && scene.source && scene.source.kind === 'color') {
      if (!scene.source.color) {
        issues.push({ code: 'COLOR_REQUIRED', message: 'У сцены-заливки не задан цвет.', sceneId: scene.id });
      }
    } else if (!scene.layers && scene.source && !scene.source.url) {
      issues.push({ code: 'SOURCE_REQUIRED', message: 'У сцены не задан файл-источник.', sceneId: scene.id });
    }

    if (
      typeof scene.trimStartSec === 'number'
      && typeof scene.trimEndSec === 'number'
      && scene.trimEndSec <= scene.trimStartSec
    ) {
      issues.push({ code: 'INVALID_TRIM', message: 'Конец обрезки раньше начала.', sceneId: scene.id });
    }
  }

  const total = timelineDurationSec(timeline);
  if (total > TIMELINE_LIMITS.maxTotalDurationSec) {
    issues.push({
      code: 'TOO_LONG',
      message: `Ролик длиннее допустимого: ${Math.round(total)} с из ${TIMELINE_LIMITS.maxTotalDurationSec}.`,
    });
  }

  return issues;
}

/** Секунды в mm:ss для интерфейса. */
export function formatTimelineDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}
