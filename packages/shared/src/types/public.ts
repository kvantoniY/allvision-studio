import type { ProcessingType, ServiceCategory } from '@allvision/database';

export type PublicService = {
  id: string;
  slug: string;
  title: string;
  description: string;
  shortDesc: string;
  category: ServiceCategory;
  priceTokens: number;
  coverImage: string | null;
  galleryImages: string[];
  processingType: ProcessingType;
  sortOrder: number;
};

export type PublicTrend = {
  id: string;
  title: string;
  description: string | null;
  previewVideo: string;
  referenceImg: string | null;
  prompt: string;
  tags: string[];
  priceTokens: number;
  sortOrder: number;
  viewsCount: number;
  usedCount: number;
  serviceId: string;
};

export type PublicTokenPackage = {
  id: string;
  title: string;
  tokens: number;
  priceRub: number;
  bonus: number;
  isPopular: boolean;
  sortOrder: number;
};

export type PublicSettings = {
  supportTelegram: string;
  supportEmail: string;
  companyName: string;
  fairyTaleTierBasicPrice: string;
  fairyTaleTierExtendedPrice: string;
  cartoonBaseRatePerMinute: string;
  realisticBaseRatePerMinute: string;
};

export type PublicServicesResponse = { services: PublicService[] };
export type PublicServiceResponse = { service: PublicService };
export type PublicTrendsResponse = { trends: PublicTrend[] };
export type PublicTrendResponse = { trend: PublicTrend };
export type PublicTokenPackagesResponse = { packages: PublicTokenPackage[] };
export type PublicSettingsResponse = { settings: PublicSettings };
export type ContactResponse = { ok: true };
