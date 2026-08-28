import { z } from 'zod';
import {
  TIMELINE_LIMITS,
  TIMELINE_SOURCE_KINDS,
  TIMELINE_TEXT_POSITIONS,
  TIMELINE_TEXT_STYLES,
  timelineSourceSchema,
  type TimelineScene,
  type TimelineTextOverlay,
} from './types';

/**
 * Слои сцены.
 *
 * До этого сцена держала ровно один файл, и из этого следовало всё остальное: нельзя было
 * положить два кадра, собрать коллаж, подвинуть или обрезать — двигать было нечего.
 * Теперь сцена это список слоёв, а «одно фото на весь кадр» стало частным случаем.
 *
 * Геометрия задаётся в ДОЛЯХ кадра, а не в пикселях: один и тот же ролик рендерится
 * и в 1080x1920, и в 1920x1080, и раскладка не должна от этого разъезжаться.
 */

export const LAYER_KINDS = ['media', 'text'] as const;
export type LayerKind = (typeof LAYER_KINDS)[number];

/** Как медиа вписывается в свою рамку. */
export const LAYER_FITS = ['cover', 'contain'] as const;
export type LayerFit = (typeof LAYER_FITS)[number];

/**
 * Прямоугольник в долях кадра: x/y — левый верхний угол, w/h — размеры.
 * Немного за пределы кадра выходить разрешено (наезд, частичный вылет) — это приём,
 * а не ошибка, поэтому границы шире 0..1.
 */
export const layerBoxSchema = z.object({
  x: z.number().min(-1).max(2).default(0),
  y: z.number().min(-1).max(2).default(0),
  w: z.number().min(0.02).max(3).default(1),
  h: z.number().min(0.02).max(3).default(1),
});

export type LayerBox = z.infer<typeof layerBoxSchema>;

export const FULL_FRAME_BOX: LayerBox = { x: 0, y: 0, w: 1, h: 1 };

/** Какую часть исходника берём (тоже в долях, но уже исходного кадра). */
export const layerCropSchema = z.object({
  x: z.number().min(0).max(0.99).default(0),
  y: z.number().min(0).max(0.99).default(0),
  w: z.number().min(0.01).max(1).default(1),
  h: z.number().min(0.01).max(1).default(1),
});

export type LayerCrop = z.infer<typeof layerCropSchema>;

const baseLayerFields = {
  id: z.string().trim().min(1).max(80),
  box: layerBoxSchema.default(FULL_FRAME_BOX),
  rotation: z.number().min(-180).max(180).default(0),
  opacity: z.number().min(0).max(1).default(1),
  /** Секунды от начала сцены; пусто — слой виден всю сцену. */
  startSec: z.number().min(0).max(TIMELINE_LIMITS.maxSceneDurationSec).optional(),
  endSec: z.number().min(0).max(TIMELINE_LIMITS.maxSceneDurationSec).optional(),
  /** Заблокированный слой не выделяется мышью — фон не должен ловить клики. */
  locked: z.boolean().default(false),
};

export const mediaLayerSchema = z.object({
  ...baseLayerFields,
  kind: z.literal('media'),
  source: timelineSourceSchema,
  fit: z.enum(LAYER_FITS).default('cover'),
  crop: layerCropSchema.optional(),
  /** Обрезка исходного видео по времени. */
  trimStartSec: z.number().min(0).max(3600).optional(),
  trimEndSec: z.number().min(0).max(3600).optional(),
  muted: z.boolean().default(false),
  volume: z.number().min(0).max(2).default(1),
  /** Скругление углов в долях меньшей стороны рамки — для коллажей. */
  cornerRadius: z.number().min(0).max(0.5).default(0),
  /** Откуда слой взялся: нужно интерфейсу, на рендер не влияет. */
  origin: z.enum(['upload', 'library', 'generated', 'template']).optional(),
  /** Проект генерации, если слой сделал ИИ. */
  generationProjectId: z.string().trim().max(80).optional(),
});

export type MediaLayer = z.infer<typeof mediaLayerSchema>;

export const textLayerSchema = z.object({
  ...baseLayerFields,
  kind: z.literal('text'),
  text: z.string().trim().min(1).max(TIMELINE_LIMITS.maxTextLength),
  subtext: z.string().trim().max(TIMELINE_LIMITS.maxTextLength).optional(),
  style: z.enum(TIMELINE_TEXT_STYLES).default('clean'),
});

export type TextLayer = z.infer<typeof textLayerSchema>;

export const sceneLayerSchema = z.discriminatedUnion('kind', [mediaLayerSchema, textLayerSchema]);
export type SceneLayer = z.infer<typeof sceneLayerSchema>;

/** Рамка титра по старому «сверху/по центру/снизу» — нужна при переносе старых роликов. */
export function boxForTextPosition(position: (typeof TIMELINE_TEXT_POSITIONS)[number]): LayerBox {
  if (position === 'top') return { x: 0, y: 0.06, w: 1, h: 0.25 };
  if (position === 'center') return { x: 0, y: 0.38, w: 1, h: 0.25 };
  return { x: 0, y: 0.66, w: 1, h: 0.28 };
}

function textLayerFromOverlay(overlay: TimelineTextOverlay, index: number): TextLayer {
  return textLayerSchema.parse({
    id: overlay.id || `text_${index + 1}`,
    kind: 'text',
    text: overlay.text,
    subtext: overlay.subtext,
    style: overlay.style,
    box: boxForTextPosition(overlay.position),
    startSec: overlay.startSec,
    endSec: overlay.endSec,
  });
}

/**
 * Приводит сцену к слоям.
 *
 * Старые ролики и все двенадцать шаблонов записаны в прежнем формате «один source плюс
 * overlays». Переписывать их незачем: раскладываем на слои на чтении, и обе формы
 * продолжают работать.
 */
export function sceneLayers(scene: TimelineScene): SceneLayer[] {
  if (scene.layers && scene.layers.length > 0) {
    // Слои приезжают из БД как обычный JSON, поэтому разбираем схемой и молча
    // отбрасываем битые: один испорченный слой не должен ронять всю сцену.
    const parsed: SceneLayer[] = [];
    for (const raw of scene.layers) {
      const result = sceneLayerSchema.safeParse(raw);
      if (result.success) parsed.push(result.data);
    }
    if (parsed.length > 0) return parsed;
  }

  const layers: SceneLayer[] = [];
  if (scene.source) {
    layers.push(
      mediaLayerSchema.parse({
        id: `${scene.id}_media`,
        kind: 'media',
        source: scene.source,
        box: FULL_FRAME_BOX,
        fit: 'contain',
        trimStartSec: scene.trimStartSec,
        trimEndSec: scene.trimEndSec,
        muted: scene.muted,
        volume: scene.volume,
        origin: scene.origin,
        generationProjectId: scene.generationProjectId,
      }),
    );
  }
  for (const [index, overlay] of (scene.overlays ?? []).entries()) {
    layers.push(textLayerFromOverlay(overlay, index));
  }
  return layers;
}

/**
 * Сцена, гарантированно записанная слоями.
 *
 * Любая правка слоёв должна идти через неё: прежние поля при этом очищаются, иначе
 * у одного кадра осталось бы два источника правды.
 */
export function sceneWithLayers(scene: TimelineScene): TimelineScene {
  return {
    ...scene,
    layers: sceneLayers(scene),
    source: undefined,
    overlays: [],
    trimStartSec: undefined,
    trimEndSec: undefined,
  };
}

/** Медиа-слои сцены в порядке отрисовки (снизу вверх). */
export function sceneMediaLayers(scene: TimelineScene): MediaLayer[] {
  return sceneLayers(scene).filter((layer): layer is MediaLayer => layer.kind === 'media');
}

export function sceneTextLayers(scene: TimelineScene): TextLayer[] {
  return sceneLayers(scene).filter((layer): layer is TextLayer => layer.kind === 'text');
}

/**
 * Слой, по которому считается длительность сцены и который считается «главным»
 * (его показывает миниатюра, он же по умолчанию идёт референсом в генерацию).
 * Это первый видео-слой, а если видео нет — первый медиа-слой вообще.
 */
export function primaryMediaLayer(scene: TimelineScene): MediaLayer | undefined {
  const media = sceneMediaLayers(scene);
  return media.find((layer) => layer.source.kind === 'video') ?? media[0];
}

export function newMediaLayer(input: {
  id: string;
  kind: (typeof TIMELINE_SOURCE_KINDS)[number];
  url?: string;
  color?: string;
  box?: LayerBox;
}): MediaLayer {
  return mediaLayerSchema.parse({
    id: input.id,
    kind: 'media',
    source: { kind: input.kind, url: input.url, color: input.color },
    box: input.box ?? FULL_FRAME_BOX,
    fit: input.kind === 'color' ? 'cover' : 'contain',
  });
}

export function newTextLayer(input: { id: string; text: string; box?: LayerBox }): TextLayer {
  return textLayerSchema.parse({
    id: input.id,
    kind: 'text',
    text: input.text,
    box: input.box ?? boxForTextPosition('bottom'),
  });
}

/**
 * Готовые раскладки коллажа: пользователю проще выбрать «две рядом», чем выставлять
 * четыре числа руками. Возвращает рамки в порядке слоёв.
 */
export const COLLAGE_LAYOUTS = ['single', 'side-by-side', 'stacked', 'grid-4', 'pip'] as const;
export type CollageLayout = (typeof COLLAGE_LAYOUTS)[number];

export const COLLAGE_LAYOUT_TITLES: Record<CollageLayout, string> = {
  single: 'Один кадр',
  'side-by-side': 'Два рядом',
  stacked: 'Два друг над другом',
  'grid-4': 'Четыре плиткой',
  pip: 'Кадр в кадре',
};

export function collageBoxes(layout: CollageLayout): LayerBox[] {
  const gap = 0.012;
  switch (layout) {
    case 'side-by-side':
      return [
        { x: 0, y: 0, w: 0.5 - gap / 2, h: 1 },
        { x: 0.5 + gap / 2, y: 0, w: 0.5 - gap / 2, h: 1 },
      ];
    case 'stacked':
      return [
        { x: 0, y: 0, w: 1, h: 0.5 - gap / 2 },
        { x: 0, y: 0.5 + gap / 2, w: 1, h: 0.5 - gap / 2 },
      ];
    case 'grid-4':
      return [
        { x: 0, y: 0, w: 0.5 - gap / 2, h: 0.5 - gap / 2 },
        { x: 0.5 + gap / 2, y: 0, w: 0.5 - gap / 2, h: 0.5 - gap / 2 },
        { x: 0, y: 0.5 + gap / 2, w: 0.5 - gap / 2, h: 0.5 - gap / 2 },
        { x: 0.5 + gap / 2, y: 0.5 + gap / 2, w: 0.5 - gap / 2, h: 0.5 - gap / 2 },
      ];
    case 'pip':
      return [
        FULL_FRAME_BOX,
        { x: 0.62, y: 0.04, w: 0.34, h: 0.24 },
      ];
    // «Один кадр» — единственная раскладка, где рамка одна на всех: остальные слои не
    // остаются висеть поверх, а тоже разворачиваются во весь экран.
    default:
      return [FULL_FRAME_BOX];
  }
}

/** Пиксельная рамка слоя в кадре заданного размера. */
export function layerRect(box: LayerBox, width: number, height: number) {
  return {
    x: Math.round(box.x * width),
    y: Math.round(box.y * height),
    width: Math.max(2, Math.round(box.w * width)),
    height: Math.max(2, Math.round(box.h * height)),
  };
}
