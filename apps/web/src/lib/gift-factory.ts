import type { PublicService, PublicServiceCategory, ServiceCategory } from '@allvision/shared';

export type GiftCategory = {
  value: ServiceCategory;
  label: string;
  description: string;
  shortDescription: string;
  href: string;
};

export function categoryHref(code: string) {
  return `/services?category=${encodeURIComponent(code)}`;
}

export function fromPublicCategory(category: PublicServiceCategory): GiftCategory {
  return {
    value: category.code,
    label: category.title,
    description: category.description ?? category.title,
    shortDescription: category.shortDescription ?? category.description ?? '',
    href: categoryHref(category.code),
  };
}

export function buildCategoryLabels(categories: PublicServiceCategory[] | undefined): Record<string, string> {
  if (!categories || categories.length === 0) return {};
  return Object.fromEntries(categories.map((category) => [category.code, category.title]));
}

export function giftServicePriceFrom(service: PublicService) {
  return service.priceCoinsPro ?? service.priceCoinsStandard ?? service.priceTokens;
}
