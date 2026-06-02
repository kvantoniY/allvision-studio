import type { ProcessingType } from '@allvision/database';

export type ServiceCategory = string;

export type PublicService = {
  id: string;
  slug: string;
  title: string;
  description: string;
  shortDesc: string;
  category: ServiceCategory;
  priceTokens: number;
  priceCoinsStandard: number | null;
  priceCoinsPro: number | null;
  coverImage: string | null;
  galleryImages: string[];
  previewImage: string | null;
  previewVideo: string | null;
  isFeatured: boolean;
  userInputForm?: unknown;
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

export type PublicScenarioTemplateRole = {
  role: string;
  required: boolean;
  label: string;
};

export type PublicScenarioTemplate = {
  id: string;
  slug: string;
  title: string;
  shortDesc: string;
  description: string;
  category: string;
  previewVideo: string | null;
  previewImage: string | null;
  promptTemplate: string;
  characterRoles: PublicScenarioTemplateRole[];
  needsScene: boolean;
  recommendedDuration: number;
  defaultStyle: string;
  priceTokens: number;
  tags: string[];
  popularityScore: number;
  isFeatured: boolean;
  sortOrder: number;
};

export type PublicTokenPackage = {
  id: string;
  title: string;
  subtitle: string | null;
  tokens: number;
  priceRub: number;
  originalPriceRub: number | null;
  bonus: number;
  badgeText: string | null;
  features: string[];
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

export type PublicMediaAsset = {
  id: string;
  kind: string;
  groupCode?: string | null;
  title: string;
  description: string | null;
  tags: string[];
  publicUrl: string;
  thumbnailUrl: string | null;
  durationSec: number | null;
  width: number | null;
  height: number | null;
  fileSize: number;
  mimeType: string;
  sortOrder: number;
};

export type PublicServiceCategory = {
  code: string;
  title: string;
  description: string | null;
  shortDescription: string | null;
  iconName: string | null;
  sortOrder: number;
  isActive: boolean;
  isFeatured: boolean;
};

export type PublicServiceCategoriesResponse = { categories: PublicServiceCategory[] };

export type PublicStylePreset = {
  id: string;
  slug: string;
  kind: 'user-avatar' | 'user-location';
  title: string;
  description: string;
  promptText: string;
  thumbnail: string | null;
  sortOrder: number;
};

export type PublicServicesResponse = { services: PublicService[] };
export type PublicServiceResponse = { service: PublicService };
export type PublicTrendsResponse = { trends: PublicTrend[] };
export type PublicTrendResponse = { trend: PublicTrend };
export type PublicScenarioTemplatesResponse = { templates: PublicScenarioTemplate[] };
export type PublicScenarioTemplateResponse = { template: PublicScenarioTemplate };
export type PublicTokenPackagesResponse = { packages: PublicTokenPackage[] };
export type PublicSettingsResponse = { settings: PublicSettings };
export type PublicMediaAssetsResponse = { assets: PublicMediaAsset[] };
export type PublicStylePresetsResponse = { presets: PublicStylePreset[] };
export type ContactResponse = { ok: true };
