import { z } from 'zod';

// === Запись и деньги (A4) ===

export const LESSON_DURATIONS = [25, 45] as const;
export type LessonDuration = (typeof LESSON_DURATIONS)[number];

/** Базовая цена одного занятия по длительности (₽). */
export const LESSON_BASE_PRICE_RUB: Record<LessonDuration, number> = {
  25: 1000,
  45: 1500,
};

/** Размеры абонементов и скидки. */
export const LESSON_PACKAGE_SIZES = [
  { count: 1, discountPct: 0 },
  { count: 4, discountPct: 3 },
  { count: 8, discountPct: 7 },
  { count: 16, discountPct: 12 },
] as const;

export type LessonPackageSize = (typeof LESSON_PACKAGE_SIZES)[number]['count'];

/** Доля преподавателя от фактической стоимости урока. */
export const TEACHER_SHARE = 0.3;

/** За сколько часов до урока родитель может отменить с возвратом кредита. */
export const CANCEL_FREE_HOURS = 8;

export function lessonPackagePriceRub(durationMin: LessonDuration, count: number): number {
  const size = LESSON_PACKAGE_SIZES.find((s) => s.count === count);
  const discountPct = size?.discountPct ?? 0;
  const base = LESSON_BASE_PRICE_RUB[durationMin];
  return Math.round(base * count * (1 - discountPct / 100));
}

export interface LessonPackageOption {
  durationMin: LessonDuration;
  count: number;
  discountPct: number;
  priceRub: number;
  pricePerLessonRub: number;
}

/** Полный каталог абонементов (длительности × размеры). */
export function buildLessonPackages(): LessonPackageOption[] {
  const result: LessonPackageOption[] = [];
  for (const duration of LESSON_DURATIONS) {
    for (const size of LESSON_PACKAGE_SIZES) {
      const priceRub = lessonPackagePriceRub(duration, size.count);
      result.push({
        durationMin: duration,
        count: size.count,
        discountPct: size.discountPct,
        priceRub,
        pricePerLessonRub: Math.round(priceRub / size.count),
      });
    }
  }
  return result;
}

export function teacherEarningRub(priceRub: number): number {
  return Math.round(priceRub * TEACHER_SHARE);
}

// === Статусы ===

export const LESSON_STATUSES = [
  'BOOKED',
  'AWAITING_PREP',
  'GENERATING',
  'READY',
  'IN_PROGRESS',
  'COMPLETED',
  'REPORT_SENT',
  'CANCELLED_PARENT',
  'CANCELLED_TEACHER',
  'NO_SHOW',
] as const;
export type LessonStatusValue = (typeof LESSON_STATUSES)[number];

export const LESSON_STATUS_LABELS: Record<LessonStatusValue, string> = {
  BOOKED: 'Забронирован',
  AWAITING_PREP: 'Ожидает подготовки',
  GENERATING: 'Материалы генерируются',
  READY: 'Урок готов',
  IN_PROGRESS: 'Идёт занятие',
  COMPLETED: 'Завершён',
  REPORT_SENT: 'Отчёт отправлен',
  CANCELLED_PARENT: 'Отменён родителем',
  CANCELLED_TEACHER: 'Отменён преподавателем',
  NO_SHOW: 'Неявка',
};

export const CANCELLED_LESSON_STATUSES: LessonStatusValue[] = [
  'CANCELLED_PARENT',
  'CANCELLED_TEACHER',
  'NO_SHOW',
];

/** Урок ещё не начался и не отменён — можно отменять/переносить. */
export function isLessonCancellable(status: LessonStatusValue): boolean {
  return ['BOOKED', 'AWAITING_PREP', 'GENERATING', 'READY'].includes(status);
}

export interface CancelOutcome {
  allowed: boolean;
  refundCredit: boolean;
  reason?: string;
}

/**
 * Правила отмены: преподаватель/система — всегда возврат кредита; родитель — возврат,
 * если до урока ≥ CANCEL_FREE_HOURS, иначе кредит сгорает.
 */
export function resolveCancellation(params: {
  by: 'parent' | 'teacher' | 'system';
  status: LessonStatusValue;
  startsAt: Date | string;
  now?: Date;
}): CancelOutcome {
  if (!isLessonCancellable(params.status)) {
    return { allowed: false, refundCredit: false, reason: 'Урок уже нельзя отменить' };
  }
  if (params.by === 'teacher' || params.by === 'system') {
    return { allowed: true, refundCredit: true };
  }
  const startsAt = new Date(params.startsAt).getTime();
  const now = (params.now ?? new Date()).getTime();
  const hoursBefore = (startsAt - now) / (1000 * 60 * 60);
  return { allowed: true, refundCredit: hoursBefore >= CANCEL_FREE_HOURS };
}

export const EARNING_STATUSES = ['PENDING', 'AVAILABLE', 'PAID', 'REJECTED'] as const;
export type EarningStatusValue = (typeof EARNING_STATUSES)[number];

export const EARNING_STATUS_LABELS: Record<EarningStatusValue, string> = {
  PENDING: 'Ожидает подтверждения',
  AVAILABLE: 'Доступно к выплате',
  PAID: 'Выплачено',
  REJECTED: 'Отклонено / корректировка',
};

// === Схемы ===

export const purchaseLessonPackageSchema = z.object({
  durationMin: z.union([z.literal(25), z.literal(45)]),
  count: z.number().int().refine((v) => LESSON_PACKAGE_SIZES.some((s) => s.count === v), 'Недопустимый размер абонемента'),
});

export const createSlotSchema = z.object({
  startsAt: z.string().datetime({ offset: true }).or(z.string().datetime()),
  durationMin: z.union([z.literal(25), z.literal(45)]),
});

export const bookLessonSchema = z.object({
  childId: z.string().min(1),
  slotId: z.string().min(1),
  topicId: z.string().min(1).optional(),
});

export const cancelLessonSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

export type PurchaseLessonPackageInput = z.infer<typeof purchaseLessonPackageSchema>;
export type CreateSlotInput = z.infer<typeof createSlotSchema>;
export type BookLessonInput = z.infer<typeof bookLessonSchema>;

// === DTO ===

export interface LessonBalanceDto {
  durationMin: number;
  available: number;
}

export interface LessonDto {
  id: string;
  childId: string;
  teacherId: string;
  childName: string;
  teacherName: string;
  durationMin: number;
  startsAt: string;
  status: LessonStatusValue;
  statusLabel: string;
  topicTitle: string | null;
  priceRub: number;
}

export interface TeacherSlotDto {
  id: string;
  startsAt: string;
  durationMin: number;
  isBooked: boolean;
}

export interface AvailableTeacherDto {
  teacherId: string;
  name: string;
  bio: string | null;
  photoUrl: string | null;
  lessonsCount: number;
  subjects: string[];
  courses: Array<{ id: string; title: string; subjectTitle: string }>;
  slots: TeacherSlotDto[];
}
