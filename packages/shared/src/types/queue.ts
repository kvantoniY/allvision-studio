export const QUEUE_NAMES = {
  PHOTO_RESTORE: 'photo-restore',
  PHOTO_ANIMATE: 'photo-animate',
  TREND: 'trend',
  FAIRY_TALE_SCRIPT: 'fairy-tale-script',
  CHARACTER_NSFW: 'character-nsfw',
  EPISODE: 'episode',
  SERVICE_PIPELINE: 'service-pipeline',
  VIDEO_RENDER: 'video-render',
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

/**
 * Экспорт из редактора. Отдельная очередь, потому что это дешёвая локальная склейка:
 * ей незачем стоять за дорогими AI-генерациями, которые идут по одной.
 */
export interface VideoRenderJobData {
  projectId: string;
  userId: string;
  videoProjectId: string;
}
