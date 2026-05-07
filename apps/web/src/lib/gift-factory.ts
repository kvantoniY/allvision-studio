import type { PublicService, ServiceCategory } from '@allvision/shared';

export type GiftCategory = {
  value: ServiceCategory;
  label: string;
  description: string;
  shortDescription: string;
  href: string;
};

export const GIFT_CATEGORIES: GiftCategory[] = [
  {
    value: 'NOSTALGIA',
    label: 'Ностальгия',
    description: 'Оживите старое фото, восстановите выцветшие воспоминания',
    shortDescription: 'Семейный архив, старые снимки и тёплые видео-воспоминания.',
    href: '/services?category=NOSTALGIA',
  },
  {
    value: 'TRENDS_MEMES',
    label: 'Тренды и мемы',
    description: 'Лицо в трендовом видео или киносцене',
    shortDescription: 'Быстрые ролики, мемные сцены и форматы для семейного чата.',
    href: '/services?category=TRENDS_MEMES',
  },
  {
    value: 'KIDS_HEROES',
    label: 'Дети-герои',
    description: 'Ваш ребёнок — герой собственной сказки или мультика',
    shortDescription: 'Добрые стилизованные миры, где ребёнок в центре истории.',
    href: '/services?category=KIDS_HEROES',
  },
  {
    value: 'SPECIAL_OCCASIONS',
    label: 'Особые поводы',
    description: 'Юбилеи, свадьбы, корпоративы, 8 марта и 23 февраля',
    shortDescription: 'Видео-открытки и сюрпризы для дат, которые хочется помнить.',
    href: '/services?category=SPECIAL_OCCASIONS',
  },
];

export const CATEGORY_LABELS = Object.fromEntries(
  GIFT_CATEGORIES.map((category) => [category.value, category.label]),
) as Record<ServiceCategory, string>;

export function giftServicePriceFrom(service: PublicService) {
  return service.priceCoinsStandard ?? service.priceTokens;
}
