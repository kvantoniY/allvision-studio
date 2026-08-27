'use client';

import { useCallback } from 'react';
import {
  COLLAGE_LAYOUTS,
  FULL_FRAME_BOX,
  TIMELINE_LIMITS,
  collageBoxes,
  newMediaLayer,
  newTextLayer,
  sceneLayers,
  sceneWithLayers,
  type CollageLayout,
  type MediaLayer,
  type SceneLayer,
  type TextLayer,
  type Timeline,
  type TimelineScene,
} from '@allvision/shared';

export type LayerPatch = Partial<MediaLayer> & Partial<TextLayer>;

export function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

export function newScene(): TimelineScene {
  return {
    id: uid('scene'),
    layers: [newMediaLayer({ id: uid('layer'), kind: 'color', color: '#0b1020' })],
    background: '#0b1020',
    durationSec: 4,
    transition: 'dissolve',
    transitionDurationSec: 0.6,
    muted: false,
    volume: 1,
    overlays: [],
  };
}

/**
 * Операции редактора над таймлайном.
 *
 * Вынесены из компонента: это чистые преобразования, у них нет ни состояния, ни разметки,
 * и держать их рядом с JSX значило бы прятать правила изменения ролика внутри вёрстки.
 */
export function useEditorOperations(
  timeline: Timeline | null,
  apply: (next: Timeline) => void,
) {
  const patchScene = useCallback(
    (sceneIndex: number, patch: Partial<TimelineScene>) => {
      if (!timeline) return;
      const scenes = timeline.scenes.map((scene, index) => (index === sceneIndex ? { ...scene, ...patch } : scene));
      apply({ ...timeline, scenes });
    },
    [timeline, apply],
  );

  /** Любая правка слоёв идёт через сцену, переведённую в слои. */
  const withLayers = useCallback(
    (sceneIndex: number, mutate: (layers: SceneLayer[]) => SceneLayer[]) => {
      if (!timeline) return;
      const scenes = timeline.scenes.map((scene, index) => {
        if (index !== sceneIndex) return scene;
        const layered = sceneWithLayers(scene);
        return { ...layered, layers: mutate(layered.layers as SceneLayer[]) };
      });
      apply({ ...timeline, scenes });
    },
    [timeline, apply],
  );

  const changeLayer = useCallback(
    (sceneIndex: number, layerId: string, patch: LayerPatch) => {
      withLayers(sceneIndex, (layers) =>
        layers.map((layer) => (layer.id === layerId ? ({ ...layer, ...patch } as SceneLayer) : layer)),
      );
    },
    [withLayers],
  );

  const addMediaLayer = useCallback(
    (sceneIndex: number, input: { kind: 'image' | 'video' | 'color'; url?: string; color?: string }) => {
      if (!timeline) return null;
      const id = uid('layer');
      const existing = sceneLayers(timeline.scenes[sceneIndex]).length;
      if (existing >= TIMELINE_LIMITS.maxLayersPerScene) return null;
      // Новый слой кладём не на весь кадр, а меньше и со сдвигом: иначе он полностью
      // накрыл бы предыдущий, и человек решил бы, что тот пропал.
      const box = existing === 0
        ? FULL_FRAME_BOX
        : { x: 0.12 + existing * 0.04, y: 0.12 + existing * 0.04, w: 0.6, h: 0.4 };
      withLayers(sceneIndex, (layers) => [...layers, newMediaLayer({ id, ...input, box })]);
      return id;
    },
    [timeline, withLayers],
  );

  const addTextLayer = useCallback(
    (sceneIndex: number) => {
      const id = uid('text');
      withLayers(sceneIndex, (layers) => [...layers, newTextLayer({ id, text: 'Новый титр' })]);
      return id;
    },
    [withLayers],
  );

  const removeLayer = useCallback(
    (sceneIndex: number, layerId: string) => {
      withLayers(sceneIndex, (layers) => (layers.length <= 1 ? layers : layers.filter((layer) => layer.id !== layerId)));
    },
    [withLayers],
  );

  const moveLayer = useCallback(
    (sceneIndex: number, layerId: string, direction: -1 | 1) => {
      withLayers(sceneIndex, (layers) => {
        const index = layers.findIndex((layer) => layer.id === layerId);
        const target = index + direction;
        if (index < 0 || target < 0 || target >= layers.length) return layers;
        const next = [...layers];
        [next[index], next[target]] = [next[target], next[index]];
        return next;
      });
    },
    [withLayers],
  );

  /**
   * Раскладка коллажа: медиа-слои расставляются по готовым рамкам.
   * Титры не трогаем — они живут поверх и своей рамкой не участвуют в сетке.
   */
  const applyCollage = useCallback(
    (sceneIndex: number, layout: CollageLayout) => {
      const boxes = collageBoxes(layout);
      withLayers(sceneIndex, (layers) => {
        const media = layers.filter((layer): layer is MediaLayer => layer.kind === 'media');
        const rest = layers.filter((layer) => layer.kind !== 'media');
        const placed = media.slice(0, boxes.length).map((layer, index) => ({
          ...layer,
          box: boxes[index],
          // В сетке кадр должен заполнять свою плитку целиком, иначе между плитками
          // появятся неровные поля и коллаж будет выглядеть неаккуратно.
          fit: 'cover' as const,
          rotation: 0,
        }));
        // Слои, которым не хватило места, остаются как были — удалять чужую работу нельзя.
        const leftovers = media.slice(boxes.length);
        return [...placed, ...leftovers, ...rest];
      });
    },
    [withLayers],
  );

  return {
    patchScene,
    changeLayer,
    addMediaLayer,
    addTextLayer,
    removeLayer,
    moveLayer,
    applyCollage,
    collageLayouts: COLLAGE_LAYOUTS,
  };
}
