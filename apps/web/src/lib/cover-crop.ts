import type { CSSProperties } from 'react';

export type CoverCrop = { x: number; y: number; w: number; h: number };

/**
 * Соотношение сторон карточки обложки на витрине услуг (`aspect-[16/10]`).
 * Кроп-рамка в конструкторе заблокирована на это же соотношение, поэтому нормализованный
 * прямоугольник ровно отображается в карточке.
 */
export const COVER_ASPECT = 16 / 10;

export function isValidCrop(crop: unknown): crop is CoverCrop {
  if (!crop || typeof crop !== 'object') return false;
  const c = crop as Record<string, unknown>;
  return (
    typeof c.x === 'number' && typeof c.y === 'number' && typeof c.w === 'number' && typeof c.h === 'number'
    && c.w > 0 && c.h > 0 && c.x >= 0 && c.y >= 0 && c.x + c.w <= 1.0001 && c.y + c.h <= 1.0001
  );
}

/**
 * Инлайновый стиль, который показывает ровно выбранный прямоугольник `crop` картинки в
 * контейнере с тем же соотношением 16:10 (контейнер должен быть `relative overflow-hidden`).
 * Возвращает undefined, если кропа нет — тогда используется обычный object-cover (центр).
 */
export function coverCropStyle(crop?: CoverCrop | null): CSSProperties | undefined {
  if (!isValidCrop(crop)) return undefined;
  const { x, y, w, h } = crop;
  return {
    position: 'absolute',
    width: `${100 / w}%`,
    height: `${100 / h}%`,
    left: `${-(x / w) * 100}%`,
    top: `${-(y / h) * 100}%`,
    maxWidth: 'none',
  };
}
