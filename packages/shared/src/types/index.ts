export * from './generation';
export * from './public';
export * from './account';
export * from './queue';

import type { Avatar, AvatarStatus, AvatarType, Generation, GenerationStatus, PresetRecipe } from './generation';

export const CharacterType = {
  HUMAN: 'HUMAN',
  PET: 'PET',
  GROUP: 'GROUP',
  MASCOT: 'MASCOT',
  OBJECT: 'OBJECT',
  OTHER: 'OTHER',
} as const;
export type CharacterType = (typeof CharacterType)[keyof typeof CharacterType];

export const CharacterGender = {
  MALE: 'MALE',
  FEMALE: 'FEMALE',
  OTHER: 'OTHER',
} as const;
export type CharacterGender = (typeof CharacterGender)[keyof typeof CharacterGender];

export const CharacterStatus = {
  DRAFT: 'DRAFT',
  PROCESSING: 'PROCESSING',
  READY: 'READY',
  REJECTED: 'REJECTED',
  PAYMENT_PENDING: 'PAYMENT_PENDING',
} as const;
export type CharacterStatus = (typeof CharacterStatus)[keyof typeof CharacterStatus];

export const ProjectStatus = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
} as const;
export type ProjectStatus = GenerationStatus;

export const EpisodeStatus = {
  PENDING: 'PENDING',
  PROCESSING_IMAGE: 'PROCESSING_IMAGE',
  PROCESSING_VIDEO: 'PROCESSING_VIDEO',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
} as const;
export type EpisodeStatus = (typeof EpisodeStatus)[keyof typeof EpisodeStatus];

export const ProcessingType = {
  AUTO: 'AUTO',
  MANUAL: 'MANUAL',
  HYBRID: 'HYBRID',
} as const;
export type ProcessingType = (typeof ProcessingType)[keyof typeof ProcessingType];

export const ServiceCategory = {
  PHOTO_RESTORE: 'PHOTO_RESTORE',
  PHOTO_ANIMATE: 'PHOTO_ANIMATE',
  TREND: 'TREND',
  CARTOON_CUSTOM: 'CARTOON_CUSTOM',
  REALISTIC_CUSTOM: 'REALISTIC_CUSTOM',
  FAIRY_TALE: 'FAIRY_TALE',
} as const;
export type ServiceCategory = (typeof ServiceCategory)[keyof typeof ServiceCategory];

export const OrderType = {
  CARTOON: 'CARTOON',
  REALISTIC: 'REALISTIC',
  FAIRY_TALE: 'FAIRY_TALE',
} as const;
export type OrderType = (typeof OrderType)[keyof typeof OrderType];

export const OrderStatus = {
  NEW: 'NEW',
  NEGOTIATING: 'NEGOTIATING',
  PRICE_SET: 'PRICE_SET',
  PAID: 'PAID',
  IN_PROGRESS: 'IN_PROGRESS',
  REVIEW: 'REVIEW',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;
export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

export const FairyTaleTier = {
  BASIC: 'BASIC',
  EXTENDED: 'EXTENDED',
} as const;
export type FairyTaleTier = (typeof FairyTaleTier)[keyof typeof FairyTaleTier];

export const PaymentStatus = {
  PENDING: 'PENDING',
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
} as const;
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

export const PaymentPurpose = {
  TOPUP: 'TOPUP',
  ORDER: 'ORDER',
} as const;
export type PaymentPurpose = (typeof PaymentPurpose)[keyof typeof PaymentPurpose];

export type Character = Avatar & {
  gender?: CharacterGender | null;
  ageGroup?: string | null;
  isActive?: boolean;
  lastUsedAt?: Date | string | null;
};

export type Project = Generation;
export type Episode = Generation;
export type Trend = PresetRecipe;
export type Service = PresetRecipe;
export type Order = Generation;
export type Payment = {
  id: string;
  createdAt: Date | string;
};
export type TokenTransaction = {
  id: string;
  userId: string;
  amount: number;
  reason: string;
  refId?: string | null;
  balanceAfter: number;
  createdAt: Date | string;
};
export type TokenPackage = {
  id: string;
  title: string;
  tokens: number;
  priceRub: number;
  bonus: number;
  isPopular: boolean;
  sortOrder: number;
};
export type Setting = {
  key: string;
  value: string;
};
export type FairyTaleScriptRecord = Generation;
export type EpisodeCharacter = {
  episodeId: string;
  characterId: string;
};
export type ScenarioTemplate = PresetRecipe;
export type AbuseReport = {
  id: string;
  createdAt: Date | string;
};

export type LegacyAvatarStatus = AvatarStatus;
export type LegacyAvatarType = AvatarType;
