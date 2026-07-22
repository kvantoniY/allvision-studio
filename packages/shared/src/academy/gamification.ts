import { z } from 'zod';

// === Геймификация Academy (A9) ===

export const LESSON_COMPLETED_XP = 50;
export const MOSCOW_UTC_OFFSET_HOURS = 3;

export const XP_EVENT_REASONS = [
  'LESSON_COMPLETED',
  'MISSION',
  'INDEPENDENT_ANSWER',
  'EFFORT',
  'PROJECT',
  'STREAK',
  'HOMEWORK',
  'ACHIEVEMENT',
  'MANUAL',
] as const;
export type XpEventReasonValue = (typeof XP_EVENT_REASONS)[number];

export const XP_REASON_LABELS: Record<XpEventReasonValue, string> = {
  LESSON_COMPLETED: 'Завершённый урок',
  MISSION: 'Выполненная миссия',
  INDEPENDENT_ANSWER: 'Самостоятельный ответ',
  EFFORT: 'За старание',
  PROJECT: 'Учебный проект',
  STREAK: 'Серия занятий',
  HOMEWORK: 'Домашнее задание',
  ACHIEVEMENT: 'Достижение',
  MANUAL: 'Награда преподавателя',
};

export const TEACHER_XP_REASONS = [
  'MISSION',
  'INDEPENDENT_ANSWER',
  'EFFORT',
  'PROJECT',
  'HOMEWORK',
  'MANUAL',
] as const;

export const ACHIEVEMENT_METRICS = ['LESSONS_COMPLETED', 'TOTAL_XP', 'STREAK'] as const;
export type AchievementMetricValue = (typeof ACHIEVEMENT_METRICS)[number];

export const REWARD_KINDS = [
  'BACKGROUND', 'FRAME', 'COSTUME', 'EFFECT', 'ROOM_ITEM', 'LOCATION', 'EMOTION', 'ARTIFACT',
] as const;
export type RewardKindValue = (typeof REWARD_KINDS)[number];

export const REWARD_KIND_LABELS: Record<RewardKindValue, string> = {
  BACKGROUND: 'Фон профиля',
  FRAME: 'Рамка',
  COSTUME: 'Костюм',
  EFFECT: 'Эффект',
  ROOM_ITEM: 'Предмет комнаты',
  LOCATION: 'Локация',
  EMOTION: 'Эмоция',
  ARTIFACT: 'Артефакт',
};

/** Суммарный XP, необходимый для начала уровня. Уровень 1 начинается с 0 XP. */
export function xpForLevel(level: number): number {
  const safeLevel = Math.max(1, Math.floor(level));
  return 100 * (safeLevel - 1) ** 2;
}

/** Уровень по суммарному XP: 1 + floor(sqrt(xp / 100)). */
export function levelFromXp(xp: number): number {
  return Math.max(1, Math.floor(Math.sqrt(Math.max(0, xp) / 100)) + 1);
}

export interface LevelProgress {
  level: number;
  levelStartXp: number;
  nextLevelXp: number;
  xpIntoLevel: number;
  xpNeeded: number;
  percent: number;
}

export function levelProgressFromXp(xp: number): LevelProgress {
  const safeXp = Math.max(0, Math.floor(xp));
  const level = levelFromXp(safeXp);
  const levelStartXp = xpForLevel(level);
  const nextLevelXp = xpForLevel(level + 1);
  const span = Math.max(1, nextLevelXp - levelStartXp);
  const xpIntoLevel = safeXp - levelStartXp;
  return {
    level,
    levelStartXp,
    nextLevelXp,
    xpIntoLevel,
    xpNeeded: nextLevelXp - safeXp,
    percent: Math.max(0, Math.min(100, Math.round((xpIntoLevel / span) * 100))),
  };
}

function moscowDayNumber(value: Date | string): number {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('INVALID_STREAK_DATE');
  const shifted = date.getTime() + MOSCOW_UTC_OFFSET_HOURS * 60 * 60 * 1000;
  const day = new Date(shifted);
  return Math.floor(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()) / 86_400_000);
}

export interface StreakUpdate {
  streakCount: number;
  streakFreezes: number;
  usedFreeze: boolean;
  changed: boolean;
}

/**
 * Серия по учебным дням Europe/Moscow: соседний день продолжает серию, один
 * пропущенный день расходует одну заморозку, больший разрыв начинает серию заново.
 */
export function updateLessonStreak(input: {
  previousActivityAt: Date | string | null;
  currentActivityAt: Date | string;
  streakCount: number;
  streakFreezes: number;
}): StreakUpdate {
  const currentCount = Math.max(0, Math.floor(input.streakCount));
  const freezes = Math.max(0, Math.floor(input.streakFreezes));
  if (!input.previousActivityAt) {
    return { streakCount: Math.max(1, currentCount), streakFreezes: freezes, usedFreeze: false, changed: true };
  }
  const gap = moscowDayNumber(input.currentActivityAt) - moscowDayNumber(input.previousActivityAt);
  if (gap <= 0) {
    return { streakCount: Math.max(1, currentCount), streakFreezes: freezes, usedFreeze: false, changed: false };
  }
  if (gap === 1) {
    return { streakCount: Math.max(1, currentCount) + 1, streakFreezes: freezes, usedFreeze: false, changed: true };
  }
  if (gap === 2 && freezes > 0) {
    return { streakCount: Math.max(1, currentCount) + 1, streakFreezes: freezes - 1, usedFreeze: true, changed: true };
  }
  return { streakCount: 1, streakFreezes: freezes, usedFreeze: false, changed: true };
}

export const teacherXpGrantSchema = z.object({
  amount: z.number().int().min(1).max(100),
  reason: z.enum(TEACHER_XP_REASONS),
  requestId: z.string().uuid(),
  note: z.string().trim().max(300).optional(),
});

export const teacherRewardGrantSchema = z.object({
  rewardItemId: z.string().min(1),
  childAssetId: z.string().min(1).optional(),
});

export type TeacherXpGrantInput = z.infer<typeof teacherXpGrantSchema>;
export type TeacherRewardGrantInput = z.infer<typeof teacherRewardGrantSchema>;

export interface KidAchievementDto {
  id: string;
  slug: string;
  title: string;
  description: string;
  icon: string;
  metric: AchievementMetricValue;
  threshold: number;
  progress: number;
  unlockedAt: string | null;
}

export interface KidRewardDto {
  rewardItemId: string;
  childRewardId: string | null;
  slug: string;
  title: string;
  description: string | null;
  icon: string;
  kind: RewardKindValue;
  kindLabel: string;
  owned: boolean;
  acquiredAt: string | null;
  equipped: boolean;
  childAssetId: string | null;
  assetFileUrl: string | null;
}

export interface KidXpEventDto {
  id: string;
  amount: number;
  reason: XpEventReasonValue;
  reasonLabel: string;
  createdAt: string;
}

export interface KidProfileDto {
  child: {
    id: string;
    name: string;
    level: number;
    xp: number;
    streakCount: number;
    streakFreezes: number;
    characterImageUrl: string | null;
  };
  levelProgress: LevelProgress;
  completedLessons: number;
  achievements: KidAchievementDto[];
  rewards: KidRewardDto[];
  recentXp: KidXpEventDto[];
}

export interface TeacherRewardCatalogItem {
  id: string;
  title: string;
  description: string | null;
  icon: string;
  kind: RewardKindValue;
  kindLabel: string;
}

export interface TeacherRewardAssetDto {
  id: string;
  title: string;
  kind: string;
  fileUrl: string;
}
