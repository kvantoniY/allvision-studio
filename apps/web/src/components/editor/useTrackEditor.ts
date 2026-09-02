'use client';

import { useCallback, useMemo } from 'react';
import {
  LAYER_SPEED_LIMITS,
  TIMELINE_LIMITS,
  TRACK_LIMITS,
  clipEndSec,
  layerSpeed,
  newMediaLayer,
  newTextLayer,
  sortedClips,
  timelineScenes,
  timelineTimings,
  timelineTracks,
  tracksDurationSec,
  tracksFromScenes,
  type MediaLayer,
  type SceneLayer,
  type TextLayer,
  type Timeline,
  type TimelineClip,
  type TimelineTrack,
  type TimelineTransition,
} from '@allvision/shared';

/**
 * Операции редактора над дорожками.
 *
 * Здесь только преобразования: ни состояния, ни разметки. Правила монтажа — что клип
 * нельзя утащить в минус, что клипы одной дорожки не залезают друг на друга, что удаление
 * последнего клипа оставляет ролик живым — должны читаться в одном месте, а не быть
 * рассыпанными по обработчикам мыши.
 */

export function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

/** Правка слоя: медиа и текст правятся одним и тем же вызовом. */
export type LayerPatch = Partial<MediaLayer> & Partial<TextLayer>;

/** Куда сложить клип: индекс дорожки и секунда начала. */
export type ClipPlacement = { trackIndex: number; startSec: number };

export const DEFAULT_CLIP_SEC = 4;
/** Стандартная длина перехода: столько же по умолчанию предлагают монтажки. */
export const DEFAULT_TRANSITION_SEC = 0.5;

/**
 * Дорожки ролика для редактора.
 *
 * Ролик, записанный сценами (в том числе любой шаблон поздравления), переводится на
 * дорожки при открытии. Переписывать данные заранее незачем: перевод обратим и считается
 * из тех же таймингов, по которым ролик рендерится.
 */
export function editorTracks(timeline: Timeline | null): TimelineTrack[] {
  if (!timeline) return [];
  const existing = timelineTracks(timeline);
  if (existing.length > 0) return existing;
  return tracksFromScenes(timelineScenes(timeline), timelineTimings(timeline));
}

/** Ролик, гарантированно записанный дорожками. Правки идут только через него. */
export function timelineWithTracks(timeline: Timeline): Timeline {
  if (timelineTracks(timeline).length > 0) return timeline;
  return { ...timeline, tracks: editorTracks(timeline), scenes: [] };
}

function clampDuration(value: number) {
  return Math.min(
    TIMELINE_LIMITS.maxSceneDurationSec,
    Math.max(TRACK_LIMITS.minClipDurationSec, Number(value.toFixed(2))),
  );
}

/**
 * Ближайшая свободная секунда на дорожке начиная с желаемой.
 *
 * Клип, положенный поверх соседа, читается как ошибка редактора, а не как приём: на одной
 * дорожке в одну секунду может быть только один кадр. Поэтому новый клип встаёт за тем,
 * с кем он пересёкся, а не поверх него.
 */
function freeSlotSec(track: TimelineTrack, wantedSec: number, durationSec: number, ignoreClipId?: string): number {
  const clips = sortedClips(track).filter((clip) => clip.id !== ignoreClipId);
  let start = Math.max(0, wantedSec);
  for (const clip of clips) {
    const overlaps = start < clipEndSec(clip) && clip.startSec < start + durationSec;
    if (overlaps) start = clipEndSec(clip);
  }
  return Number(start.toFixed(3));
}

/**
 * Сколько ещё осталось в исходнике после уже срезанного начала.
 *
 * null — ограничения нет: у картинки и заливки нет «конца записи», их можно держать в
 * кадре сколько угодно.
 */
export function clipSourceLimitSec(clip: TimelineClip): number | null {
  if (clip.layer.kind !== 'media' || clip.layer.source.kind !== 'video') return null;
  const source = clip.layer.sourceDurationSec;
  if (!source || source <= 0) return null;
  return Math.max(TRACK_LIMITS.minClipDurationSec, source - (clip.layer.trimStartSec ?? 0));
}

/** На сколько левый край можно увести влево: дальше начала записи показывать нечего. */
export function clipHeadRoomSec(clip: TimelineClip): number | null {
  if (clip.layer.kind !== 'media' || clip.layer.source.kind !== 'video') return null;
  if (!clip.layer.sourceDurationSec) return null;
  return Math.max(0, clip.layer.trimStartSec ?? 0);
}

export type TrackEditorOps = ReturnType<typeof useTrackEditor>;

export function useTrackEditor(timeline: Timeline | null, apply: (next: Timeline) => void) {
  const tracks = useMemo(() => editorTracks(timeline), [timeline]);

  const setTracks = useCallback(
    (next: TimelineTrack[]) => {
      if (!timeline) return;
      // Сцены очищаем: держать обе записи разом значило бы иметь два источника правды
      // об одном ролике, и рендер выбрал бы дорожки, а интерфейс мог бы показать сцены.
      apply({ ...timeline, tracks: next, scenes: [] });
    },
    [timeline, apply],
  );

  const mapTrack = useCallback(
    (trackIndex: number, mutate: (track: TimelineTrack) => TimelineTrack) => {
      setTracks(tracks.map((track, index) => (index === trackIndex ? mutate(track) : track)));
    },
    [tracks, setTracks],
  );

  /** Дорожка и клип по id клипа: почти каждая операция начинается с этого поиска. */
  const locate = useCallback(
    (clipId: string): { trackIndex: number; clip: TimelineClip } | null => {
      for (const [trackIndex, track] of tracks.entries()) {
        const clip = track.clips.find((item) => item.id === clipId);
        if (clip) return { trackIndex, clip };
      }
      return null;
    },
    [tracks],
  );

  const addClip = useCallback(
    (layer: SceneLayer, placement?: Partial<ClipPlacement> & { durationSec?: number }) => {
      if (!timeline) return null;
      const trackIndex = Math.min(placement?.trackIndex ?? 0, Math.max(0, tracks.length - 1));
      const track = tracks[trackIndex];
      if (!track) return null;
      if (track.clips.length >= TRACK_LIMITS.maxClipsPerTrack) return null;

      const durationSec = clampDuration(placement?.durationSec ?? DEFAULT_CLIP_SEC);
      const startSec = freeSlotSec(track, placement?.startSec ?? tracksDurationSec([track]), durationSec);
      const clip: TimelineClip = { id: uid('clip'), startSec, durationSec, layer, transition: 'cut' };
      mapTrack(trackIndex, (item) => ({ ...item, clips: [...item.clips, clip] }));
      return clip.id;
    },
    [timeline, tracks, mapTrack],
  );

  const addMediaClip = useCallback(
    (
      input: { kind: 'image' | 'video' | 'color'; url?: string; color?: string },
      placement?: Partial<ClipPlacement> & { durationSec?: number },
    ) => addClip(
      // Измеренную длину записи кладём на слой: по ней потом ограничивается обрезка.
      newMediaLayer({
        id: uid('layer'),
        ...input,
        sourceDurationSec: input.kind === 'video' ? placement?.durationSec : undefined,
      }),
      placement,
    ),
    [addClip],
  );

  const addTextClip = useCallback(
    (placement?: Partial<ClipPlacement> & { durationSec?: number }) =>
      addClip(newTextLayer({ id: uid('text'), text: 'Новый титр' }), {
        // Титр по умолчанию кладём на дорожку поверх основной: подпись поверх кадра —
        // это то, зачем верхние дорожки и нужны.
        trackIndex: Math.min(1, Math.max(0, tracks.length - 1)),
        ...placement,
      }),
    [addClip, tracks.length],
  );

  const patchClip = useCallback(
    (clipId: string, patch: Partial<Omit<TimelineClip, 'id' | 'layer'>>) => {
      const found = locate(clipId);
      if (!found) return;
      mapTrack(found.trackIndex, (track) => ({
        ...track,
        clips: track.clips.map((clip) => (clip.id === clipId ? { ...clip, ...patch } : clip)),
      }));
    },
    [locate, mapTrack],
  );

  const patchClipLayer = useCallback(
    (clipId: string, patch: Partial<SceneLayer>) => {
      const found = locate(clipId);
      if (!found) return;
      mapTrack(found.trackIndex, (track) => ({
        ...track,
        clips: track.clips.map((clip) =>
          clip.id === clipId ? ({ ...clip, layer: { ...clip.layer, ...patch } as SceneLayer }) : clip,
        ),
      }));
    },
    [locate, mapTrack],
  );

  /** Правка слоя по его id — так его знает холст, который про клипы ничего не знает. */
  const patchLayerById = useCallback(
    (layerId: string, patch: Partial<SceneLayer>) => {
      setTracks(
        tracks.map((track) => ({
          ...track,
          clips: track.clips.map((clip) =>
            clip.layer.id === layerId ? ({ ...clip, layer: { ...clip.layer, ...patch } as SceneLayer }) : clip,
          ),
        })),
      );
    },
    [tracks, setTracks],
  );

  const clipIdByLayerId = useCallback(
    (layerId: string | null) => {
      if (!layerId) return null;
      for (const track of tracks) {
        const clip = track.clips.find((item) => item.layer.id === layerId);
        if (clip) return clip.id;
      }
      return null;
    },
    [tracks],
  );

  /**
   * Перенос клипа: по времени и, если нужно, на другую дорожку.
   *
   * Секунда начала прижимается к свободному месту — на занятое клип не встаёт, иначе на
   * одной дорожке в одну секунду оказались бы два кадра.
   */
  const moveClip = useCallback(
    (clipId: string, target: { startSec: number; trackIndex?: number }) => {
      const found = locate(clipId);
      if (!found) return;
      const toIndex = Math.min(Math.max(0, target.trackIndex ?? found.trackIndex), tracks.length - 1);
      const startSec = Math.max(0, Number(target.startSec.toFixed(3)));

      if (toIndex === found.trackIndex) {
        const slot = freeSlotSec(tracks[toIndex], startSec, found.clip.durationSec, clipId);
        const clips = sortedClips(tracks[toIndex]);
        const wasAfter = clips[clips.findIndex((clip) => clip.id === clipId) - 1];
        mapTrack(toIndex, (track) => ({
          ...track,
          clips: track.clips.map((clip) => {
            if (clip.id === clipId) return { ...clip, startSec: slot, transition: 'cut' as TimelineTransition };
            // Переход принадлежит стыку. Уехал клип — стыка больше нет, и наложение,
            // оставшееся от перехода, читалось бы как случайно надвинутый кадр.
            if (wasAfter && clip.id === wasAfter.id) return { ...clip, transition: 'cut' as TimelineTransition };
            return clip;
          }),
        }));
        return;
      }

      const slot = freeSlotSec(tracks[toIndex], startSec, found.clip.durationSec);
      setTracks(
        tracks.map((track, index) => {
          if (index === found.trackIndex) return { ...track, clips: track.clips.filter((clip) => clip.id !== clipId) };
          if (index === toIndex) {
            return { ...track, clips: [...track.clips, { ...found.clip, startSec: slot, transition: 'cut' as TimelineTransition }] };
          }
          return track;
        }),
      );
    },
    [locate, tracks, patchClip, setTracks],
  );

  /**
   * Растянуть или сжать клип за край.
   *
   * У видео правая ручка одновременно правит обрезку: показать кусок длиннее исходника
   * нельзя, поэтому длина клипа и окно файла обязаны совпадать.
   */
  const trimClip = useCallback(
    (clipId: string, edge: 'start' | 'end', deltaSec: number) => {
      const found = locate(clipId);
      if (!found) return;
      const { clip } = found;
      const isVideo = clip.layer.kind === 'media' && clip.layer.source.kind === 'video';
      // Ручку тянут по секундам ролика, а обрезка живёт в секундах записи.
      const speed = clip.layer.kind === 'media' ? layerSpeed(clip.layer) : 1;

      if (edge === 'end') {
        const limit = clipSourceLimitSec(clip);
        const wanted = clampDuration(clip.durationSec + deltaSec);
        // Правый край режет КОНЕЦ записи и не может показать того, чего в файле нет.
        const durationSec = limit === null ? wanted : Math.min(wanted, limit / speed);
        const patch: Partial<TimelineClip> = { durationSec };
        if (isVideo && clip.layer.kind === 'media') {
          const trimStart = clip.layer.trimStartSec ?? 0;
          patchClipLayer(clipId, { trimStartSec: trimStart, trimEndSec: trimStart + durationSec * speed } as Partial<SceneLayer>);
        }
        patchClip(clipId, patch);
        return;
      }

      // Левый край режет НАЧАЛО записи: двигает и позицию, и точку входа в файл.
      // Левее начала записи уходить некуда — там ничего не снято.
      const headRoom = clipHeadRoomSec(clip);
      const earliest = headRoom === null ? 0 : Math.max(0, clip.startSec - headRoom / speed);
      const rawStart = Math.max(earliest, clip.startSec + deltaSec);
      const end = clipEndSec(clip);
      const durationSec = clampDuration(end - rawStart);
      const startSec = Number((end - durationSec).toFixed(3));
      if (isVideo && clip.layer.kind === 'media') {
        const trimStart = Math.max(0, (clip.layer.trimStartSec ?? 0) + (startSec - clip.startSec) * speed);
        patchClipLayer(clipId, { trimStartSec: trimStart, trimEndSec: trimStart + durationSec * speed } as Partial<SceneLayer>);
      }
      patchClip(clipId, { startSec, durationSec });
    },
    [locate, patchClip, patchClipLayer],
  );

  const removeClip = useCallback(
    (clipId: string) => {
      const found = locate(clipId);
      if (!found) return;
      mapTrack(found.trackIndex, (track) => ({ ...track, clips: track.clips.filter((clip) => clip.id !== clipId) }));
    },
    [locate, mapTrack],
  );

  const duplicateClip = useCallback(
    (clipId: string) => {
      const found = locate(clipId);
      if (!found) return null;
      const track = tracks[found.trackIndex];
      if (track.clips.length >= TRACK_LIMITS.maxClipsPerTrack) return null;
      const id = uid('clip');
      const startSec = freeSlotSec(track, clipEndSec(found.clip), found.clip.durationSec);
      mapTrack(found.trackIndex, (item) => ({
        ...item,
        clips: [
          ...item.clips,
          {
            ...found.clip,
            id,
            startSec,
            // Копия не забирает метку генерации: результат чужого запуска должен встать
            // в оригинал, а не в дубль.
            layer: { ...found.clip.layer, id: uid('layer'), generationProjectId: undefined } as SceneLayer,
          },
        ],
      }));
      return id;
    },
    [locate, tracks, mapTrack],
  );

  /** Разрез клипа под курсором — то же самое, что ножницы в любой монтажке. */
  const splitClip = useCallback(
    (clipId: string, atSec: number) => {
      const found = locate(clipId);
      if (!found) return null;
      const { clip } = found;
      const offset = atSec - clip.startSec;
      if (offset <= TRACK_LIMITS.minClipDurationSec || offset >= clip.durationSec - TRACK_LIMITS.minClipDurationSec) {
        return null;
      }
      const track = tracks[found.trackIndex];
      if (track.clips.length >= TRACK_LIMITS.maxClipsPerTrack) return null;

      const isVideo = clip.layer.kind === 'media' && clip.layer.source.kind === 'video';
      const trimStart = isVideo && clip.layer.kind === 'media' ? clip.layer.trimStartSec ?? 0 : 0;
      // Разрез на дорожке приходится на другую секунду файла, если клип ускорен.
      const speed = clip.layer.kind === 'media' ? layerSpeed(clip.layer) : 1;
      const sourceOffset = offset * speed;
      const tailId = uid('clip');

      mapTrack(found.trackIndex, (item) => ({
        ...item,
        clips: item.clips.flatMap((current) => {
          if (current.id !== clipId) return [current];
          const head: TimelineClip = {
            ...current,
            durationSec: Number(offset.toFixed(3)),
            layer: isVideo && current.layer.kind === 'media'
              ? { ...current.layer, trimStartSec: trimStart, trimEndSec: trimStart + sourceOffset }
              : current.layer,
          };
          const tail: TimelineClip = {
            ...current,
            id: tailId,
            startSec: Number((current.startSec + offset).toFixed(3)),
            durationSec: Number((current.durationSec - offset).toFixed(3)),
            // Хвост продолжает файл ровно с той секунды, где кончилась голова.
            layer: {
              ...current.layer,
              id: uid('layer'),
              generationProjectId: undefined,
              ...(isVideo
                ? { trimStartSec: trimStart + sourceOffset, trimEndSec: trimStart + current.durationSec * speed }
                : {}),
            } as SceneLayer,
          };
          return [head, tail];
        }),
      }));
      return tailId;
    },
    [locate, tracks, mapTrack],
  );

  /**
   * Скорость клипа.
   *
   * Кусок записи остаётся тем же — меняется только то, за сколько он проигрывается,
   * поэтому клип на дорожке становится короче или длиннее. Так это работает в любой
   * монтажке: ускорил вдвое — занял вдвое меньше места.
   */
  const setClipSpeed = useCallback(
    (clipId: string, speed: number) => {
      const found = locate(clipId);
      if (!found) return;
      const { clip } = found;
      if (clip.layer.kind !== 'media') return;
      const next = Math.min(LAYER_SPEED_LIMITS.max, Math.max(LAYER_SPEED_LIMITS.min, speed));
      const current = layerSpeed(clip.layer);
      if (Math.abs(next - current) < 0.001) return;

      const durationSec = clampDuration((clip.durationSec * current) / next);
      patchClipLayer(clipId, { speed: next } as Partial<SceneLayer>);
      if (clip.layer.source.kind === 'video') {
        const trimStart = clip.layer.trimStartSec ?? 0;
        patchClipLayer(clipId, {
          speed: next,
          trimStartSec: trimStart,
          trimEndSec: trimStart + durationSec * next,
        } as Partial<SceneLayer>);
      }
      patchClip(clipId, { durationSec });
    },
    [locate, patchClip, patchClipLayer],
  );

  /**
   * Переход на стыке двух клипов.
   *
   * Переход — это наложение: следующий клип заходит на предыдущий, и ffmpeg растворяет
   * один в другом. Поэтому смена перехода двигает соседа И ВЕСЬ ХВОСТ дорожки: иначе за
   * соседом оставалась бы дыра, а ролик не укорачивался бы на длину перехода — в любой
   * монтажке он укорачивается.
   *
   * Требование «клипы должны стоять вплотную» живёт в интерфейсе: плашка стыка просто не
   * появляется там, где между клипами пауза. Накладывать далеко стоящие клипы значило бы
   * молча стирать кусок ролика.
   */
  const setTransition = useCallback(
    (clipId: string, transition: TimelineTransition, durationSec = DEFAULT_TRANSITION_SEC) => {
      const found = locate(clipId);
      if (!found) return;
      const track = tracks[found.trackIndex];
      const clips = sortedClips(track);
      const position = clips.findIndex((clip) => clip.id === clipId);
      const nextClip = clips[position + 1];
      if (!nextClip) return;

      const wanted = transition === 'cut'
        ? 0
        : Math.min(
            durationSec,
            TIMELINE_LIMITS.maxTransitionDurationSec,
            found.clip.durationSec / 2,
            nextClip.durationSec / 2,
          );
      // Куда сосед обязан встать: конец предыдущего минус длина наложения. Пауза при этом
      // закрывается сама — переход без стыка не бывает.
      const targetStart = Math.max(0, clipEndSec(found.clip) - wanted);
      const shift = Number((nextClip.startSec - targetStart).toFixed(3));

      mapTrack(found.trackIndex, (item) => ({
        ...item,
        clips: item.clips.map((clip) => {
          if (clip.id === clipId) return { ...clip, transition };
          const order = clips.findIndex((entry) => entry.id === clip.id);
          // Хвост едет вместе с соседом: стык остаётся стыком, а не превращается в дыру.
          if (order > position) return { ...clip, startSec: Math.max(0, Number((clip.startSec - shift).toFixed(3))) };
          return clip;
        }),
      }));
    },
    [locate, tracks, mapTrack],
  );

  /**
   * Придвинуть клип вплотную к предыдущему.
   *
   * Пауза между кадрами — законный приём, но чаще она случайна: клип не дотащили пару
   * пикселей. Без этой кнопки попасть в стык мышью почти невозможно, а без стыка нельзя
   * поставить переход.
   */
  const snapToPrevious = useCallback(
    (clipId: string) => {
      const found = locate(clipId);
      if (!found) return;
      const clips = sortedClips(tracks[found.trackIndex]);
      const position = clips.findIndex((clip) => clip.id === clipId);
      const previous = clips[position - 1];
      if (!previous) return;
      const shift = Number((found.clip.startSec - clipEndSec(previous)).toFixed(3));
      if (Math.abs(shift) < 0.01) return;
      mapTrack(found.trackIndex, (item) => ({
        ...item,
        clips: item.clips.map((clip) => {
          const order = clips.findIndex((entry) => entry.id === clip.id);
          if (order < position) return clip;
          return { ...clip, startSec: Math.max(0, Number((clip.startSec - shift).toFixed(3))) };
        }),
      }));
    },
    [locate, tracks, mapTrack],
  );
  const addTrack = useCallback(() => {
    if (tracks.length >= TRACK_LIMITS.maxTracks) return false;
    setTracks([...tracks, { id: uid('track'), title: `Слой ${tracks.length + 1}`, clips: [], hidden: false, muted: false }]);
    return true;
  }, [tracks, setTracks]);

  const removeTrack = useCallback(
    (trackIndex: number) => {
      // Основную дорожку не удаляем: без неё в кадре не осталось бы ничего.
      if (trackIndex === 0 || tracks.length <= 1) return;
      setTracks(tracks.filter((_, index) => index !== trackIndex));
    },
    [tracks, setTracks],
  );

  const patchTrack = useCallback(
    (trackIndex: number, patch: Partial<Pick<TimelineTrack, 'hidden' | 'muted' | 'title'>>) => {
      mapTrack(trackIndex, (track) => ({ ...track, ...patch }));
    },
    [mapTrack],
  );

  return {
    tracks,
    locate,
    clipIdByLayerId,
    addClip,
    addMediaClip,
    addTextClip,
    patchClip,
    patchClipLayer,
    patchLayerById,
    moveClip,
    trimClip,
    setClipSpeed,
    snapToPrevious,
    removeClip,
    duplicateClip,
    splitClip,
    setTransition,
    addTrack,
    removeTrack,
    patchTrack,
  };
}
