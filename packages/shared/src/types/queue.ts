import type { AcademyGenerationInput } from '../academy/materials';

export const QUEUE_NAMES = {
  PHOTO_RESTORE: 'photo-restore',
  PHOTO_ANIMATE: 'photo-animate',
  TREND: 'trend',
  FAIRY_TALE_SCRIPT: 'fairy-tale-script',
  CHARACTER_NSFW: 'character-nsfw',
  EPISODE: 'episode',
  SERVICE_PIPELINE: 'service-pipeline',
  CHARACTER_PROFILE: 'character-profile',
  ACADEMY_GENERATION: 'academy-generation',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export interface ProjectJobData {
  projectId: string;
  userId: string;
  serviceId: string;
  trendId?: string;
  inputImages: string[];
  inputText?: string;
  aiConfig: Record<string, any>;
}

export interface FairyTaleJobData {
  scriptId: string;
  userId: string;
  childName: string;
  childAge: number;
  moralLesson: string;
  additionalDetails?: string;
  durationMinutes: number;
}

export interface CharacterNsfwJobData {
  characterId: string;
  userId: string;
}

export interface EpisodeJobData {
  episodeId: string;
  userId: string;
}

export interface ServicePipelineJobData {
  projectId: string;
  userId: string;
  mode?: 'production' | 'test-run';
}

// Academy A2: генерация профиля внешности ребёнка
export interface CharacterProfileJobData {
  characterProfileId: string;
  /** Пусто = полный набор; иначе перегенерация только этих kind'ов. */
  kinds?: string[];
}

// Academy A5: одна заявка панели генерации (может создать 1–4 ассета).
export interface AcademyGenerationJobData {
  projectId: string;
  requestedById: string;
  input: AcademyGenerationInput;
  estimatedCostUsd: number;
}
