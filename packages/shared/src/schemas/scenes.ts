import { z } from 'zod';

const booleanFromForm = z.preprocess((value) => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}, z.boolean());

const emptyToUndefined = (value: unknown) => (value === '' ? undefined : value);

export const createSceneSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().min(1).max(3000),
  category: z.preprocess(emptyToUndefined, z.string().trim().min(1).max(50).optional()),
});

export const updateSceneSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  description: z.string().trim().min(1).max(3000).optional(),
  category: z.preprocess(emptyToUndefined, z.string().trim().min(1).max(50).optional()),
  isActive: booleanFromForm.optional(),
});

export type CreateSceneInput = z.infer<typeof createSceneSchema>;
export type UpdateSceneInput = z.infer<typeof updateSceneSchema>;
