export const QUEUE_NAMES = {
  PHOTO_RESTORE: 'photo-restore',
  PHOTO_ANIMATE: 'photo-animate',
  TREND: 'trend',
  FAIRY_TALE_SCRIPT: 'fairy-tale-script',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export interface ProjectJobData {
  projectId: string;
  userId: string;
  inputImageUrl?: string;
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
