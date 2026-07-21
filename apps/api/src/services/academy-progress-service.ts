import { prisma } from '@allvision/database';
import {
  computeNextTopic,
  readTopicPrerequisites,
  SKILL_LEVEL_LABELS,
  type ChildProgressDto,
  type EnrollmentProgressDto,
  type OrderedTopic,
  type TopicProgressDto,
  type TopicProgressStatusValue,
} from '@allvision/shared';

type EnrollmentWithCourse = {
  id: string;
  status: string;
  course: {
    id: string;
    title: string;
    subject: { title: string };
    modules: Array<{
      sortOrder: number;
      topics: Array<{ id: string; title: string; durationMin: number; sortOrder: number; content: unknown }>;
    }>;
  };
};

const enrollmentInclude = {
  course: {
    include: {
      subject: { select: { title: true } },
      modules: {
        orderBy: { sortOrder: 'asc' as const },
        include: {
          topics: {
            orderBy: { sortOrder: 'asc' as const },
            select: { id: true, title: true, durationMin: true, sortOrder: true, content: true },
          },
        },
      },
    },
  },
};

/** Плоский список тем курса в порядке модуль→тема. */
function flattenTopics(enrollment: EnrollmentWithCourse) {
  return enrollment.course.modules.flatMap((m) => m.topics);
}

/**
 * Определяет рекомендованную тему: явный IN_PROGRESS важнее, затем явный RECOMMENDED
 * (ручной override преподавателя), иначе — алгоритм по порядку с учётом prerequisites.
 */
function resolveNextTopicId(
  orderedTopics: OrderedTopic[],
  progressByTopic: Map<string, TopicProgressStatusValue>,
): string | null {
  const inProgress = orderedTopics.find((t) => progressByTopic.get(t.id) === 'IN_PROGRESS');
  if (inProgress) return inProgress.id;
  const recommended = orderedTopics.find((t) => progressByTopic.get(t.id) === 'RECOMMENDED');
  if (recommended) return recommended.id;
  const completed = orderedTopics.filter((t) => progressByTopic.get(t.id) === 'COMPLETED').map((t) => t.id);
  return computeNextTopic(orderedTopics, completed).topicId;
}

export async function buildEnrollmentProgress(enrollmentId: string): Promise<EnrollmentProgressDto | null> {
  const enrollment = (await prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    include: enrollmentInclude,
  })) as EnrollmentWithCourse | null;
  if (!enrollment) return null;

  const progressRows = await prisma.topicProgress.findMany({ where: { enrollmentId } });
  const progressByTopic = new Map(progressRows.map((row) => [row.topicId, row]));

  const topics = flattenTopics(enrollment);
  const orderedTopics: OrderedTopic[] = topics.map((t) => ({
    id: t.id,
    prerequisites: readTopicPrerequisites(t.content),
  }));
  const statusByTopic = new Map<string, TopicProgressStatusValue>(
    topics.map((t) => [t.id, (progressByTopic.get(t.id)?.status as TopicProgressStatusValue) ?? 'LOCKED']),
  );
  const nextTopicId = resolveNextTopicId(orderedTopics, statusByTopic);

  const topicDtos: TopicProgressDto[] = topics.map((t) => {
    const row = progressByTopic.get(t.id);
    return {
      topicId: t.id,
      title: t.title,
      durationMin: t.durationMin,
      status: (row?.status as TopicProgressStatusValue) ?? 'LOCKED',
      completedAt: row?.completedAt ? row.completedAt.toISOString() : null,
      teacherNote: row?.teacherNote ?? null,
      isNextRecommended: t.id === nextTopicId,
    };
  });

  return {
    enrollmentId: enrollment.id,
    courseId: enrollment.course.id,
    courseTitle: enrollment.course.title,
    subjectTitle: enrollment.course.subject.title,
    status: enrollment.status as EnrollmentProgressDto['status'],
    totalTopics: topics.length,
    completedTopics: topicDtos.filter((t) => t.status === 'COMPLETED').length,
    nextTopicId,
    topics: topicDtos,
  };
}

export async function buildChildProgress(childId: string): Promise<ChildProgressDto> {
  const enrollments = await prisma.enrollment.findMany({
    where: { childId },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  const enrollmentDtos = (
    await Promise.all(enrollments.map((e) => buildEnrollmentProgress(e.id)))
  ).filter((e): e is EnrollmentProgressDto => e !== null);

  const skillRows = await prisma.skillProgress.findMany({
    where: { childId },
    include: { skill: { select: { title: true } } },
    orderBy: { updatedAt: 'desc' },
  });

  return {
    childId,
    enrollments: enrollmentDtos,
    skills: skillRows.map((row) => ({
      skillId: row.skillId,
      title: row.skill.title,
      level: row.level,
      levelLabel: SKILL_LEVEL_LABELS[row.level] ?? String(row.level),
    })),
  };
}

/** Текущая рекомендованная тема энролмента (для override fromTopicId и teacher-запросов). */
export async function currentNextTopicId(enrollmentId: string): Promise<string | null> {
  const dto = await buildEnrollmentProgress(enrollmentId);
  return dto?.nextTopicId ?? null;
}
