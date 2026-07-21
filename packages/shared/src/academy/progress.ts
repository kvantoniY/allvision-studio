import { z } from 'zod';

// === Прогресс обучения (A3) ===

export const ENROLLMENT_STATUSES = ['ACTIVE', 'PAUSED', 'COMPLETED'] as const;
export type EnrollmentStatusValue = (typeof ENROLLMENT_STATUSES)[number];

export const TOPIC_PROGRESS_STATUSES = ['LOCKED', 'RECOMMENDED', 'IN_PROGRESS', 'COMPLETED'] as const;
export type TopicProgressStatusValue = (typeof TOPIC_PROGRESS_STATUSES)[number];

export const TOPIC_PROGRESS_LABELS: Record<TopicProgressStatusValue, string> = {
  LOCKED: 'Закрыто',
  RECOMMENDED: 'Рекомендуется',
  IN_PROGRESS: 'В процессе',
  COMPLETED: 'Пройдено',
};

export const TOPIC_CHANGE_REASONS = ['REPEAT', 'GAP', 'PARENT_WISH', 'SPECIAL_PROJECT'] as const;
export type TopicChangeReasonValue = (typeof TOPIC_CHANGE_REASONS)[number];

export const TOPIC_CHANGE_REASON_LABELS: Record<TopicChangeReasonValue, string> = {
  REPEAT: 'Повторение',
  GAP: 'Пробел в знаниях',
  PARENT_WISH: 'Пожелание родителя',
  SPECIAL_PROJECT: 'Специальный проект',
};

/** Максимальный уровень владения навыком. */
export const SKILL_MAX_LEVEL = 3;

export const SKILL_LEVEL_LABELS: Record<number, string> = {
  0: 'Не начато',
  1: 'Знакомится',
  2: 'Уверенно',
  3: 'Освоено',
};

// === Алгоритм рекомендации следующей темы ===

export interface OrderedTopic {
  id: string;
  /** ids тем, которые нужно пройти перед этой (из Topic.content.prerequisites). */
  prerequisites: string[];
}

export interface NextTopicResult {
  /** id рекомендованной темы или null, если все пройдены / нет доступных. */
  topicId: string | null;
  /** Пройдены все темы курса. */
  allCompleted: boolean;
  /** Есть незакрытые темы, но их prerequisites не выполнены (курс «застрял»). */
  blocked: boolean;
}

/**
 * Рекомендует следующую тему: первую незакрытую по порядку (topics уже отсортированы:
 * module.sortOrder → topic.sortOrder), у которой все prerequisites пройдены.
 * Чистая функция — тестируется без БД.
 */
export function computeNextTopic(
  topics: OrderedTopic[],
  completedTopicIds: Iterable<string>,
): NextTopicResult {
  const completed = new Set(completedTopicIds);
  const pending = topics.filter((topic) => !completed.has(topic.id));
  if (pending.length === 0) {
    return { topicId: null, allCompleted: topics.length > 0, blocked: false };
  }
  for (const topic of pending) {
    const ready = topic.prerequisites.every((id) => completed.has(id));
    if (ready) return { topicId: topic.id, allCompleted: false, blocked: false };
  }
  // Есть незакрытые темы, но ни одна не разблокирована prerequisites.
  return { topicId: null, allCompleted: false, blocked: true };
}

/** Извлекает prerequisites из Topic.content (мягко: массив строковых id или пусто). */
export function readTopicPrerequisites(content: unknown): string[] {
  if (content && typeof content === 'object' && 'prerequisites' in content) {
    const raw = (content as { prerequisites?: unknown }).prerequisites;
    if (Array.isArray(raw)) return raw.filter((v): v is string => typeof v === 'string');
  }
  return [];
}

// === Схемы запросов ===

export const enrollChildSchema = z.object({
  courseId: z.string().min(1),
});

export const setTopicProgressSchema = z.object({
  enrollmentId: z.string().min(1),
  topicId: z.string().min(1),
  status: z.enum(TOPIC_PROGRESS_STATUSES),
  teacherNote: z.string().trim().max(2000).nullable().optional(),
});

export const setSkillProgressSchema = z.object({
  childId: z.string().min(1),
  skillId: z.string().min(1),
  level: z.number().int().min(0).max(SKILL_MAX_LEVEL),
});

export const overrideNextTopicSchema = z.object({
  toTopicId: z.string().min(1),
  reason: z.enum(TOPIC_CHANGE_REASONS),
  note: z.string().trim().max(2000).nullable().optional(),
});

export type EnrollChildInput = z.infer<typeof enrollChildSchema>;
export type SetTopicProgressInput = z.infer<typeof setTopicProgressSchema>;
export type SetSkillProgressInput = z.infer<typeof setSkillProgressSchema>;
export type OverrideNextTopicInput = z.infer<typeof overrideNextTopicSchema>;

// === DTO ===

export interface TopicProgressDto {
  topicId: string;
  title: string;
  durationMin: number;
  status: TopicProgressStatusValue;
  completedAt: string | null;
  teacherNote: string | null;
  isNextRecommended: boolean;
}

export interface EnrollmentProgressDto {
  enrollmentId: string;
  courseId: string;
  courseTitle: string;
  subjectTitle: string;
  status: EnrollmentStatusValue;
  totalTopics: number;
  completedTopics: number;
  nextTopicId: string | null;
  topics: TopicProgressDto[];
}

export interface SkillProgressDto {
  skillId: string;
  title: string;
  level: number;
  levelLabel: string;
}

export interface ChildProgressDto {
  childId: string;
  enrollments: EnrollmentProgressDto[];
  skills: SkillProgressDto[];
}
