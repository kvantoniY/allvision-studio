import type { LayerBox, MediaLayer } from '@allvision/shared';

/**
 * Геометрия холста.
 *
 * Таймлайн хранит рамки в долях кадра, холст рисует в пикселях своего размера, а экспорт —
 * в пикселях итогового разрешения. Пересчёт живёт здесь одним местом, иначе три стороны
 * начнут расходиться на округлениях.
 */

export type PixelRect = { x: number; y: number; width: number; height: number };

export function boxToRect(box: LayerBox, stageWidth: number, stageHeight: number): PixelRect {
  return {
    x: box.x * stageWidth,
    y: box.y * stageHeight,
    width: Math.max(4, box.w * stageWidth),
    height: Math.max(4, box.h * stageHeight),
  };
}

export function rectToBox(rect: PixelRect, stageWidth: number, stageHeight: number): LayerBox {
  return {
    x: clamp(rect.x / stageWidth, -1, 2),
    y: clamp(rect.y / stageHeight, -1, 2),
    w: clamp(rect.width / stageWidth, 0.02, 3),
    h: clamp(rect.height / stageHeight, 0.02, 3),
  };
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export type MediaFitResult = {
  /** Где и какого размера рисовать изображение. */
  draw: PixelRect;
  /** Какую часть исходника брать (в пикселях источника) — для cover и ручной обрезки. */
  crop?: { x: number; y: number; width: number; height: number };
};

/**
 * Вписывание источника в рамку слоя.
 *
 * cover заполняет рамку и срезает лишнее, contain вписывает целиком и центрируется —
 * ровно как object-fit в браузере и как это делает ffmpeg на экспорте.
 */
export function fitMedia(
  layer: MediaLayer,
  sourceWidth: number,
  sourceHeight: number,
  rect: PixelRect,
): MediaFitResult {
  // Ручная обрезка сужает исходник ещё до вписывания.
  const crop = layer.crop;
  const srcX = crop ? crop.x * sourceWidth : 0;
  const srcY = crop ? crop.y * sourceHeight : 0;
  const srcW = crop ? crop.w * sourceWidth : sourceWidth;
  const srcH = crop ? crop.h * sourceHeight : sourceHeight;

  if (srcW <= 0 || srcH <= 0) return { draw: rect };

  if (layer.fit === 'cover') {
    // Берём из источника ту часть, у которой пропорции совпадают с рамкой.
    const targetRatio = rect.width / rect.height;
    const sourceRatio = srcW / srcH;
    let visibleW = srcW;
    let visibleH = srcH;
    if (sourceRatio > targetRatio) {
      visibleW = srcH * targetRatio;
    } else {
      visibleH = srcW / targetRatio;
    }
    return {
      draw: rect,
      crop: {
        x: srcX + (srcW - visibleW) / 2,
        y: srcY + (srcH - visibleH) / 2,
        width: visibleW,
        height: visibleH,
      },
    };
  }

  const scale = Math.min(rect.width / srcW, rect.height / srcH);
  const width = srcW * scale;
  const height = srcH * scale;
  return {
    draw: {
      x: rect.x + (rect.width - width) / 2,
      y: rect.y + (rect.height - height) / 2,
      width,
      height,
    },
    crop: crop ? { x: srcX, y: srcY, width: srcW, height: srcH } : undefined,
  };
}

export type SnapGuide = { orientation: 'v' | 'h'; position: number };

const SNAP_THRESHOLD_PX = 6;

/**
 * Прилипание при перетаскивании: к центру и краям кадра, а также к краям соседних слоёв.
 * Без него собрать ровный коллаж мышью почти невозможно — глаз ловит перекос в один пиксель.
 */
export function snapRect(
  rect: PixelRect,
  stageWidth: number,
  stageHeight: number,
  others: PixelRect[],
): { rect: PixelRect; guides: SnapGuide[] } {
  const guides: SnapGuide[] = [];

  const verticalTargets = [0, stageWidth / 2, stageWidth];
  const horizontalTargets = [0, stageHeight / 2, stageHeight];
  for (const other of others) {
    verticalTargets.push(other.x, other.x + other.width / 2, other.x + other.width);
    horizontalTargets.push(other.y, other.y + other.height / 2, other.y + other.height);
  }

  let { x, y } = rect;
  const edgesX = [
    { value: x, offset: 0 },
    { value: x + rect.width / 2, offset: rect.width / 2 },
    { value: x + rect.width, offset: rect.width },
  ];
  for (const edge of edgesX) {
    const target = verticalTargets.find((candidate) => Math.abs(candidate - edge.value) <= SNAP_THRESHOLD_PX);
    if (target !== undefined) {
      x = target - edge.offset;
      guides.push({ orientation: 'v', position: target });
      break;
    }
  }

  const edgesY = [
    { value: y, offset: 0 },
    { value: y + rect.height / 2, offset: rect.height / 2 },
    { value: y + rect.height, offset: rect.height },
  ];
  for (const edge of edgesY) {
    const target = horizontalTargets.find((candidate) => Math.abs(candidate - edge.value) <= SNAP_THRESHOLD_PX);
    if (target !== undefined) {
      y = target - edge.offset;
      guides.push({ orientation: 'h', position: target });
      break;
    }
  }

  return { rect: { ...rect, x, y }, guides };
}
