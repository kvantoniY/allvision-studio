import { z } from 'zod';

const booleanFromForm = z.preprocess((value) => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}, z.boolean());

const optionalPriceTokens = z.preprocess((value) => {
  if (value === '' || value === null) return null;
  if (value === undefined) return undefined;
  return value;
}, z.coerce.number().int().min(1).nullable().optional());

export const adminTrendListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  serviceSlug: z.string().min(1).optional(),
  isActive: booleanFromForm.optional(),
  search: z.string().trim().min(1).optional(),
});

export const createAdminTrendSchema = z.object({
  title: z.string().trim().min(1).max(100),
  description: z.string().trim().min(1).max(500),
  prompt: z.string().trim().min(1).max(2000),
  serviceSlug: z.literal('trends'),
  aiModel: z.string().trim().min(1).max(100),
  aiConfig: z.string().optional(),
  priceTokens: optionalPriceTokens,
  isActive: booleanFromForm.default(true),
});

export const updateAdminTrendSchema = createAdminTrendSchema.partial();

export const reorderAdminTrendSchema = z.object({
  direction: z.enum(['up', 'down']),
});

export type AdminTrendListQuery = z.infer<typeof adminTrendListQuerySchema>;
export type CreateAdminTrendInput = z.infer<typeof createAdminTrendSchema>;
export type UpdateAdminTrendInput = z.infer<typeof updateAdminTrendSchema>;
export type ReorderAdminTrendInput = z.infer<typeof reorderAdminTrendSchema>;
