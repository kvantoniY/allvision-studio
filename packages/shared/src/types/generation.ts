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
