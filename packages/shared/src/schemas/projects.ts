import { z } from 'zod';
import { ProjectStatus } from '../types';

export const createProjectSchema = z.object({
  serviceSlug: z.string().min(1),
  trendId: z.string().min(1).optional(),
}).superRefine((data, ctx) => {
  if (data.serviceSlug === 'trends' && !data.trendId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['trendId'],
      message: 'TREND_REQUIRED',
    });
  }
});

export const listProjectsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  status: z.nativeEnum(ProjectStatus).optional(),
  serviceSlug: z.string().min(1).optional(),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type ListProjectsQuery = z.infer<typeof listProjectsQuerySchema>;
