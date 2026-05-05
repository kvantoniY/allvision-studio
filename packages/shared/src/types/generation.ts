import { z } from 'zod';
import { GenerationKind as PrismaGenerationKind } from '@allvision/database';
import type { GenerationKind, GenerationStatus } from '@allvision/database';

export {
  AvatarStatus,
  AvatarType,
  GenerationKind,
  GenerationStatus,
  PresetCategory,
  Role,
  VoiceSourceType,
  VoiceStatus,
} from '@allvision/database';

export type {
  Avatar,
  ChatThread,
  CoinTransaction,
  Generation,
  PresetRecipe,
  Prisma,
  Scene,
  User,
  Voice,
} from '@allvision/database';

export const GENERATION_KIND_VALUES = ['TEXT', 'AUDIO', 'IMAGE', 'VIDEO'] as const;
export type GenerationKindValue = (typeof GENERATION_KIND_VALUES)[number];

export const GENERATION_STATUS_VALUES = ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'] as const;
export type GenerationStatusValue = (typeof GENERATION_STATUS_VALUES)[number];

export const GENERATION_MODES = {
  CHAT: 'chat',
  TTS: 'tts',
  TEXT_TO_IMAGE: 'text-to-image',
  IMAGE_TO_IMAGE: 'image-to-image',
  ANIMATE: 'animate',
  FACE_SWAP: 'face-swap',
  IMAGE_TO_VIDEO: 'image-to-video',
  TEXT_TO_VIDEO: 'text-to-video',
  PRESET_PHOTO_RESTORE: 'preset-photo-restore',
  PRESET_PHOTO_ANIMATE: 'preset-photo-animate',
  PRESET_PHOTO_ENHANCE_ANIMATE: 'preset-photo-enhance-animate',
  PRESET_TALE: 'preset-tale',
  PRESET_LETTER: 'preset-letter',
} as const;

export type GenerationMode = (typeof GENERATION_MODES)[keyof typeof GENERATION_MODES];

export const GENERATION_RESULT_FIELD_BY_KIND = {
  TEXT: 'resultText',
  AUDIO: 'resultAudio',
  IMAGE: 'resultImage',
  VIDEO: 'resultVideo',
} as const satisfies Record<GenerationKindValue, string>;

export function getGenerationResultField(kind: GenerationKindValue) {
  return GENERATION_RESULT_FIELD_BY_KIND[kind];
}

export function isTerminalGenerationStatus(status: GenerationStatusValue) {
  return status === 'COMPLETED' || status === 'FAILED';
}

export function isMediaGenerationKind(kind: GenerationKindValue) {
  return kind === 'AUDIO' || kind === 'IMAGE' || kind === 'VIDEO';
}

export type CreateGenerationDto = {
  kind: GenerationKind;
  mode: string;
  prompt?: string;
  inputImages?: string[];
  inputVideo?: string;
  inputAudio?: string;
  avatarIds?: string[];
  sceneId?: string;
  voiceId?: string;
  durationSeconds?: number;
  aspectRatio?: string;
  style?: string;
  aiConfig?: Record<string, unknown>;
  threadId?: string;
  parentGenerationId?: string;
  coinsCost: number;
};

export type GenerationResponseDto = {
  id: string;
  userId: string;
  kind: GenerationKind;
  mode: string;
  status: GenerationStatus;
  progress: number;
  prompt?: string | null;
  inputImages: string[];
  inputVideo?: string | null;
  inputAudio?: string | null;
  avatarIds: string[];
  sceneId?: string | null;
  voiceId?: string | null;
  aiProvider: string;
  aiModel: string;
  aiConfig?: unknown;
  durationSeconds?: number | null;
  aspectRatio?: string | null;
  style?: string | null;
  resultText?: string | null;
  resultImage?: string | null;
  resultVideo?: string | null;
  resultAudio?: string | null;
  resultThumbnail?: string | null;
  coinsCost: number;
  parentGenerationId?: string | null;
  watermarkRemoved: boolean;
  threadId?: string | null;
  aiProviderJobId?: string | null;
  errorMessage?: string | null;
  createdAt: Date | string;
  completedAt?: Date | string | null;
};

export type GenerationStatusDto = {
  id: string;
  status: GenerationStatus;
  progress: number;
  resultText?: string | null;
  resultImage?: string | null;
  resultVideo?: string | null;
  resultAudio?: string | null;
  resultThumbnail?: string | null;
  errorMessage?: string | null;
  completedAt?: Date | string | null;
};

export const listGenerationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  kind: z.nativeEnum(PrismaGenerationKind).optional(),
  threadId: z.string().min(1).optional(),
});

export type ListGenerationsQueryDto = z.infer<typeof listGenerationsQuerySchema>;
