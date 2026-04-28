import { z } from 'zod';

const booleanFromForm = z.preprocess((value) => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}, z.boolean());

const emptyToUndefined = (value: unknown) => (value === '' ? undefined : value);

export const scenarioTemplateCategorySchema = z.enum([
  'wedding',
  'birthday',
  'newyear',
  'memorial',
  'kids',
  'holiday',
  'pets',
  'marketing',
]);

export const characterRoleSchema = z.object({
  role: z.string().trim().min(1).max(50),
  required: z.boolean(),
  label: z.string().trim().min(1).max(100),
});

export const adminScenarioTemplateListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  category: scenarioTemplateCategorySchema.optional(),
  isActive: booleanFromForm.optional(),
  isFeatured: booleanFromForm.optional(),
  search: z.string().trim().min(1).optional(),
});

export const createAdminScenarioTemplateSchema = z.object({
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).min(1).max(100),
  title: z.string().trim().min(1).max(120),
  shortDesc: z.string().trim().min(1).max(240),
  description: z.string().trim().min(1).max(3000),
  category: scenarioTemplateCategorySchema,
  promptTemplate: z.string().trim().min(1).max(5000),
  characterRoles: z.string().min(1),
  needsScene: booleanFromForm.optional().default(false),
  recommendedDuration: z.coerce.number().int().min(1).max(600).optional().default(10),
  defaultStyle: z.preprocess(emptyToUndefined, z.string().trim().min(1).max(80).optional().default('cinematic')),
  aiProvider: z.preprocess(emptyToUndefined, z.string().trim().min(1).max(80).optional().default('fal')),
  aiModel: z.string().trim().min(1).max(160),
  aiConfig: z.string().optional(),
  priceTokens: z.coerce.number().int().min(1),
  tags: z.preprocess(emptyToUndefined, z.string().optional()),
  isActive: booleanFromForm.optional().default(true),
  isFeatured: booleanFromForm.optional().default(false),
});

export const updateAdminScenarioTemplateSchema = z.object({
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).min(1).max(100).optional(),
  title: z.string().trim().min(1).max(120).optional(),
  shortDesc: z.string().trim().min(1).max(240).optional(),
  description: z.string().trim().min(1).max(3000).optional(),
  category: scenarioTemplateCategorySchema.optional(),
  promptTemplate: z.string().trim().min(1).max(5000).optional(),
  characterRoles: z.string().min(1).optional(),
  needsScene: booleanFromForm.optional(),
  recommendedDuration: z.coerce.number().int().min(1).max(600).optional(),
  defaultStyle: z.preprocess(emptyToUndefined, z.string().trim().min(1).max(80).optional()),
  aiProvider: z.preprocess(emptyToUndefined, z.string().trim().min(1).max(80).optional()),
  aiModel: z.string().trim().min(1).max(160).optional(),
  aiConfig: z.string().optional(),
  priceTokens: z.coerce.number().int().min(1).optional(),
  tags: z.preprocess(emptyToUndefined, z.string().optional()),
  isActive: booleanFromForm.optional(),
  isFeatured: booleanFromForm.optional(),
});

export const reorderAdminScenarioTemplateSchema = z.object({
  direction: z.enum(['up', 'down']),
});

export type AdminScenarioTemplateListQuery = z.infer<typeof adminScenarioTemplateListQuerySchema>;
export type CreateAdminScenarioTemplateInput = z.infer<typeof createAdminScenarioTemplateSchema>;
export type UpdateAdminScenarioTemplateInput = z.infer<typeof updateAdminScenarioTemplateSchema>;
export type ReorderAdminScenarioTemplateInput = z.infer<typeof reorderAdminScenarioTemplateSchema>;
