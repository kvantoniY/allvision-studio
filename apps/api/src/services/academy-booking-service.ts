import { prisma, type Prisma } from '@allvision/database';
import {
  LESSON_STATUS_LABELS,
  type LessonBalanceDto,
  type LessonDto,
  type LessonStatusValue,
} from '@allvision/shared';

/** Лениво создаёт профиль преподавателя для пользователя с ролью TEACHER. */
export async function ensureTeacherProfile(userId: string) {
  const existing = await prisma.teacherProfile.findUnique({ where: { userId } });
  if (existing) return existing;
  return prisma.teacherProfile.create({ data: { userId, subjects: [] } });
}

/** Баланс занятий родителя: непотреблённые кредиты, сгруппированные по длительности. */
export async function getLessonBalance(parentId: string): Promise<LessonBalanceDto[]> {
  const grouped = await prisma.lessonCredit.groupBy({
    by: ['durationMin'],
    where: { parentId, consumedAt: null },
    _count: { _all: true },
  });
  return grouped.map((g) => ({ durationMin: g.durationMin, available: g._count._all }));
}

/** Берёт один свободный кредит нужной длительности (в транзакции). */
export async function consumeCredit(
  tx: Prisma.TransactionClient,
  parentId: string,
  durationMin: number,
  lessonId: string,
): Promise<string | null> {
  const credit = await tx.lessonCredit.findFirst({
    where: { parentId, durationMin, consumedAt: null },
    orderBy: { createdAt: 'asc' },
  });
  if (!credit) return null;
  await tx.lessonCredit.update({
    where: { id: credit.id },
    data: { consumedAt: new Date(), lessonId },
  });
  return credit.id;
}

type LessonWithRelations = {
  id: string;
  childId: string;
  durationMin: number;
  startsAt: Date;
  status: string;
  priceRub: number;
  topicId: string | null;
  child: { name: string };
  teacher: { user: { name: string | null; email: string } };
};

export async function topicTitles(topicIds: string[]): Promise<Map<string, string>> {
  const ids = topicIds.filter((id): id is string => !!id);
  if (ids.length === 0) return new Map();
  const topics = await prisma.topic.findMany({ where: { id: { in: ids } }, select: { id: true, title: true } });
  return new Map(topics.map((t) => [t.id, t.title]));
}

export function toLessonDto(lesson: LessonWithRelations, titles: Map<string, string>): LessonDto {
  return {
    id: lesson.id,
    childId: lesson.childId,
    childName: lesson.child.name,
    teacherName: lesson.teacher.user.name ?? lesson.teacher.user.email,
    durationMin: lesson.durationMin,
    startsAt: lesson.startsAt.toISOString(),
    status: lesson.status as LessonStatusValue,
    statusLabel: LESSON_STATUS_LABELS[lesson.status as LessonStatusValue] ?? lesson.status,
    topicTitle: lesson.topicId ? titles.get(lesson.topicId) ?? null : null,
    priceRub: lesson.priceRub,
  };
}

export const lessonInclude = {
  child: { select: { name: true } },
  teacher: { select: { user: { select: { name: true, email: true } } } },
} satisfies Prisma.LessonInclude;
