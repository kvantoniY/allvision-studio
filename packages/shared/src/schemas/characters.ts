import { z } from 'zod';
import { CharacterGender, CharacterStatus, CharacterType } from '../types';

const booleanFromForm = z.preprocess((value) => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}, z.boolean());

const emptyToUndefined = (value: unknown) => (value === '' ? undefined : value);

export const listCharactersQuerySchema = z.object({
  status: z.nativeEnum(CharacterStatus).optional(),
  type: z.nativeEnum(CharacterType).optional(),
});

export const createCharacterSchema = z.object({
  name: z.string().trim().min(1).max(100),
  type: z.nativeEnum(CharacterType),
  gender: z.preprocess(emptyToUndefined, z.nativeEnum(CharacterGender).optional()),
  ageGroup: z.preprocess(emptyToUndefined, z.string().trim().min(1).max(50).optional()),
  description: z.preprocess(emptyToUndefined, z.string().trim().max(2000).optional()),
  consentGiven: booleanFromForm.optional().default(false),
});

export const updateCharacterSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  description: z.preprocess(emptyToUndefined, z.string().trim().max(2000).optional()),
  gender: z.preprocess(emptyToUndefined, z.nativeEnum(CharacterGender).optional()),
  ageGroup: z.preprocess(emptyToUndefined, z.string().trim().min(1).max(50).optional()),
  primaryImageId: z.coerce.number().int().min(0).optional(),
  isActive: booleanFromForm.optional(),
});

export type ListCharactersQuery = z.infer<typeof listCharactersQuerySchema>;
export type CreateCharacterInput = z.infer<typeof createCharacterSchema>;
export type UpdateCharacterInput = z.infer<typeof updateCharacterSchema>;
