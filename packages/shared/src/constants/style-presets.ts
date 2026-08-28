/**
 * Виды шаблонов образов и сцен.
 *
 * Список общий для админки, публичного API и редактора: раньше он был продублирован в
 * четырёх местах строковыми литералами, и новый вид приходилось дописывать в каждое.
 */
export const STYLE_PRESET_KINDS = [
  'user-avatar',
  'user-location',
  'editor-scene',
  'editor-scene-duo',
] as const;

export type StylePresetKind = (typeof STYLE_PRESET_KINDS)[number];

export const STYLE_PRESET_KIND_TITLES: Record<StylePresetKind, string> = {
  'user-avatar': 'Аватар',
  'user-location': 'Локация',
  'editor-scene': 'Сцена в редакторе',
  'editor-scene-duo': 'Совместное фото',
};

export function isStylePresetKind(value: unknown): value is StylePresetKind {
  return typeof value === 'string' && (STYLE_PRESET_KINDS as readonly string[]).includes(value);
}
