/**
 * G1 — витрина подарков.
 *
 * Каталог `/services` разбит на вкладки. Вкладка выбирается пользователем (и рекламой
 * через `?tab=`), а не выводится из категории услуги, поэтому список фиксирован в коде:
 * это навигация продукта, а не справочные данные.
 *
 * Категории (`ServiceCategoryDef.section`) распределены между двумя контентными
 * вкладками — `services` и `greetings`. Вкладка `popular` кураторская: собирает
 * услуги с `isFeatured` из любых категорий.
 */

export const CATALOG_SECTIONS = ['popular', 'services', 'greetings'] as const;

export type CatalogSection = (typeof CATALOG_SECTIONS)[number];

/** Секции, к которым может быть привязана категория услуг. */
export const CATEGORY_SECTIONS = ['services', 'greetings'] as const satisfies readonly CatalogSection[];

export type CategorySection = (typeof CATEGORY_SECTIONS)[number];

export const DEFAULT_CATALOG_SECTION: CatalogSection = 'popular';
export const DEFAULT_CATEGORY_SECTION: CategorySection = 'services';

export type CatalogSectionDef = {
  code: CatalogSection;
  /** Подпись вкладки. */
  title: string;
  /** Заголовок H1 на вкладке. */
  heading: string;
  /** Подзаголовок под H1. */
  subtitle: string;
  iconName: string;
};

export const CATALOG_SECTION_DEFS: readonly CatalogSectionDef[] = [
  {
    code: 'popular',
    title: 'Популярное',
    heading: 'Популярные подарки и услуги',
    subtitle: 'Лучшее из каталога: то, что чаще всего дарят и заказывают прямо сейчас.',
    iconName: 'Flame',
  },
  {
    code: 'services',
    title: 'Готовые услуги',
    heading: 'Готовые AI-услуги',
    subtitle: 'Загрузите фото и получите результат за несколько минут. Без промптов и настроек.',
    iconName: 'Sparkles',
  },
  {
    code: 'greetings',
    title: 'Видео-поздравления',
    heading: 'Видео-поздравления',
    subtitle: 'Готовый шаблон из нескольких сцен или свой ролик в редакторе — с музыкой, титрами и переходами.',
    iconName: 'Clapperboard',
  },
];

export function isCatalogSection(value: unknown): value is CatalogSection {
  return typeof value === 'string' && (CATALOG_SECTIONS as readonly string[]).includes(value);
}

export function isCategorySection(value: unknown): value is CategorySection {
  return typeof value === 'string' && (CATEGORY_SECTIONS as readonly string[]).includes(value);
}

/**
 * Приводит значение из БД (там это обычная строка) к секции витрины.
 * Неизвестное значение уводим в раздел по умолчанию: категория с опечаткой
 * должна просто оказаться не в той вкладке, а не ронять весь каталог.
 */
export function toCategorySection(value: unknown): CategorySection {
  return isCategorySection(value) ? value : DEFAULT_CATEGORY_SECTION;
}

export function catalogSectionDef(code: CatalogSection): CatalogSectionDef {
  return CATALOG_SECTION_DEFS.find((section) => section.code === code) ?? CATALOG_SECTION_DEFS[0];
}

/**
 * Поводы — сквозной фильтр поверх вкладок. Услуга может относиться к нескольким
 * («оживить фото» дарят и на юбилей, и на 9 мая), поэтому это теги, а не категория.
 * Порядок в списке — порядок чипов в интерфейсе, сезонные поводы идут первыми.
 */
export const OCCASION_TAGS = [
  'BIRTHDAY',
  'NEW_YEAR',
  'MARCH_8',
  'FEB_23',
  'VALENTINE',
  'ANNIVERSARY',
  'JUBILEE',
  'WEDDING',
  'NEWBORN',
  'GRADUATION',
  'MEMORY',
  'JUST_BECAUSE',
] as const;

export type OccasionTag = (typeof OCCASION_TAGS)[number];

export type OccasionDef = {
  code: OccasionTag;
  title: string;
  /** Короткая подпись для чипа на мобильном. */
  shortTitle: string;
  emoji: string;
};

export const OCCASION_DEFS: readonly OccasionDef[] = [
  { code: 'BIRTHDAY', title: 'День рождения', shortTitle: 'День рождения', emoji: '🎂' },
  { code: 'NEW_YEAR', title: 'Новый год', shortTitle: 'Новый год', emoji: '🎄' },
  { code: 'MARCH_8', title: '8 марта', shortTitle: '8 марта', emoji: '🌷' },
  { code: 'FEB_23', title: '23 февраля', shortTitle: '23 февраля', emoji: '🎖️' },
  { code: 'VALENTINE', title: '14 февраля', shortTitle: '14 февраля', emoji: '❤️' },
  { code: 'ANNIVERSARY', title: 'Годовщина', shortTitle: 'Годовщина', emoji: '💍' },
  { code: 'JUBILEE', title: 'Юбилей', shortTitle: 'Юбилей', emoji: '🥂' },
  { code: 'WEDDING', title: 'Свадьба', shortTitle: 'Свадьба', emoji: '💒' },
  { code: 'NEWBORN', title: 'Рождение ребёнка', shortTitle: 'Малыш', emoji: '👶' },
  { code: 'GRADUATION', title: 'Выпускной и 1 сентября', shortTitle: 'Школа', emoji: '🎓' },
  { code: 'MEMORY', title: 'Семейная память', shortTitle: 'Память', emoji: '🕰️' },
  { code: 'JUST_BECAUSE', title: 'Просто так', shortTitle: 'Просто так', emoji: '✨' },
];

export function isOccasionTag(value: unknown): value is OccasionTag {
  return typeof value === 'string' && (OCCASION_TAGS as readonly string[]).includes(value);
}

export function occasionDef(code: string): OccasionDef | undefined {
  return OCCASION_DEFS.find((occasion) => occasion.code === code);
}

export function occasionTitle(code: string): string {
  return occasionDef(code)?.title ?? code;
}
