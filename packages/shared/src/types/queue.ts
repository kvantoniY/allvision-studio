export const QUEUE_NAMES = {
  GENERATION: 'generation',
  NSFW_CHECK: 'nsfw-check',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export interface GenerationJobData {
  generationId: string;
  userId: string;
}

export interface NsfwCheckJobData {
  targetId: string;
  userId?: string;
  targetType: 'avatar' | 'image' | 'video' | 'audio';
}
