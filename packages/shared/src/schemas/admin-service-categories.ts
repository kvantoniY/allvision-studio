import { z } from 'zod';
import { CATEGORY_SECTIONS } from '../catalog/sections';

export const categoryCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[A-Z0-9_-]+$/, 'Category code must be UPPERCASE letters, digits, underscores or hyphens');

const baseFields = {
  section: z.enum(CATEGORY_SECTIONS).optional(),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).nullable().optional(),
  shortDescription: z.string().trim().max(500).nullable().optional(),
  iconName: z.string().trim().max(60).nullable().optional(),
  sortOrder: z.coerce.number().int().min(0).max(10000).optional(),
  isActive: z.boolean().optional(),
  isFeatured: z.boolean().optional(),
} as const;

export const adminCategoryCreateSchema = z.object({
  code: categoryCodeSchema,
  ...baseFields,
});

export const adminCategoryUpdateSchema = z.object({
  ...baseFields,
});

export const adminCategoryReorderSchema = z.object({
  orderedCodes: z.array(categoryCodeSchema).min(1),
});

export type AdminCategoryCreateInput = z.infer<typeof adminCategoryCreateSchema>;
export type AdminCategoryUpdateInput = z.infer<typeof adminCategoryUpdateSchema>;
export type AdminCategoryReorderInput = z.infer<typeof adminCategoryReorderSchema>;
