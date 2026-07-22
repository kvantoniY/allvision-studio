import { z } from 'zod';
import { CONSENT_TYPES, type ConsentTypeValue } from './consents';

// === Профили детей (кабинет родителя) ===

export const CHILD_NAME_MAX = 60;
export const CHILD_NOTES_MAX = 1000;
export const CHILD_PHOTOS_MAX = 10;
export const CHILD_PHOTO_MAX_SIZE_MB = 15;

const birthDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Дата рождения в формате ГГГГ-ММ-ДД')
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) return false;
    const now = new Date();
    const age = (now.getTime() - date.getTime()) / (365.25 * 24 * 3600 * 1000);
    return age >= 2 && age <= 18;
  }, 'Возраст ребёнка должен быть от 2 до 18 лет');

export const createChildProfileSchema = z.object({
  name: z.string().trim().min(1, 'Укажите имя или псевдоним').max(CHILD_NAME_MAX),
  birthDate: birthDateSchema.optional(),
  notes: z.string().trim().max(CHILD_NOTES_MAX).optional(),
});

export const updateChildProfileSchema = z.object({
  name: z.string().trim().min(1).max(CHILD_NAME_MAX).optional(),
  birthDate: birthDateSchema.nullable().optional(),
  notes: z.string().trim().max(CHILD_NOTES_MAX).nullable().optional(),
});

export const acceptConsentsSchema = z.object({
  types: z.array(z.enum(CONSENT_TYPES)).min(1, 'Выберите хотя бы одно согласие'),
});

export type CreateChildProfileInput = z.infer<typeof createChildProfileSchema>;
export type UpdateChildProfileInput = z.infer<typeof updateChildProfileSchema>;

// === DTO ===

export interface ConsentDto {
  type: ConsentTypeValue;
  version: string;
  textSnapshot: string;
  acceptedAt: string;
  revokedAt: string | null;
}

export interface ChildPhotoDto {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  width: number | null;
  height: number | null;
  createdAt: string;
  /** Авторизованный URL раздачи файла (не публичный /static). */
  fileUrl: string;
}

export interface ChildProfileDto {
  id: string;
  name: string;
  birthDate: string | null;
  avatar: string | null;
  notes: string | null;
  level: number;
  xp: number;
  streakCount: number;
  createdAt: string;
  consents: ConsentDto[];
  photosCount: number;
  /** Приняты ли все согласия, обязательные для загрузки фото. */
  photoConsentsComplete: boolean;
}
