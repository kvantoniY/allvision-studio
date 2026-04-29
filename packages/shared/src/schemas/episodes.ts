import { z } from 'zod';
import { EpisodeStatus } from '../types';

export const episodeStyleSchema = z.enum(['realistic', 'cinematic', 'cartoon', 'vintage']);
export const episodeAspectRatioSchema = z.enum(['9:16', '16:9', '1:1']);

export const createEpisodeSchema = z.object({
  templateId: z.string().min(1),
  characterIds: z.array(z.string().min(1)).min(1),
  sceneId: z.string().min(1).optional(),
  customScenario: z.string().trim().max(500).optional(),
  durationSeconds: z.coerce.number().int().min(3).max(30).optional(),
  style: episodeStyleSchema.optional(),
  aspectRatio: episodeAspectRatioSchema.optional(),
});

export const listEpisodesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(12),
  status: z.nativeEnum(EpisodeStatus).optional(),
  templateId: z.string().min(1).optional(),
});

export type CreateEpisodeInput = z.infer<typeof createEpisodeSchema>;
export type ListEpisodesQuery = z.infer<typeof listEpisodesQuerySchema>;
