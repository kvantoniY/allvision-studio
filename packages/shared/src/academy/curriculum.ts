import { z } from 'zod';

// === Учебная программа (Направление → Курс → Модуль → Тема → Навык) ===

const slugSchema = z
  .string()
  .trim()
  .min(2)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Слаг: латиница, цифры и дефисы');

export const upsertSubjectSchema = z.object({
  slug: slugSchema,
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(4000).nullable().optional(),
  iconName: z.string().trim().max(60).nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

export const upsertCourseSchema = z.object({
  subjectId: z.string().min(1),
  slug: slugSchema,
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(4000).nullable().optional(),
  level: z.string().trim().max(40).nullable().optional(),
  ageMin: z.number().int().min(2).max(18).nullable().optional(),
  ageMax: z.number().int().min(2).max(18).nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

export const upsertModuleSchema = z.object({
  courseId: z.string().min(1),
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(4000).nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export const TOPIC_DURATIONS = [25, 45] as const;

export const upsertTopicSchema = z.object({
  moduleId: z.string().min(1),
  title: z.string().trim().min(1).max(160),
  goal: z.string().trim().max(2000).nullable().optional(),
  durationMin: z
    .number()
    .int()
    .refine((v) => TOPIC_DURATIONS.includes(v as (typeof TOPIC_DURATIONS)[number]), 'Длительность: 25 или 45 минут')
    .optional(),
  difficulty: z.number().int().min(1).max(5).optional(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
  content: z.record(z.unknown()).nullable().optional(),
  aiBudgetUsd: z.number().min(0).max(50).optional(),
  skillIds: z.array(z.string().min(1)).optional(),
});

export const upsertSkillSchema = z.object({
  subjectId: z.string().min(1),
  slug: slugSchema,
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).nullable().optional(),
});

export type UpsertSubjectInput = z.infer<typeof upsertSubjectSchema>;
export type UpsertCourseInput = z.infer<typeof upsertCourseSchema>;
export type UpsertModuleInput = z.infer<typeof upsertModuleSchema>;
export type UpsertTopicInput = z.infer<typeof upsertTopicSchema>;
export type UpsertSkillInput = z.infer<typeof upsertSkillSchema>;
