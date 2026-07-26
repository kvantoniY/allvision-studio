import { Prisma, prisma } from '@allvision/database';
import { buildEnrollmentProgress, currentNextTopicId } from './academy-progress-service';

type Tx = Prisma.TransactionClient;

/**
 * Последовательность тем урока (Phase B): по умолчанию уроки идут по порядку тем курса,
 * на который записан ребёнок. Преподаватель может выбрать другую тему при подготовке
 * (пропустить = пометить пройденной, вернуться = перепройти без повторных очков).
 */

/** Находит активную запись ребёнка на курс, релевантную предмету преподавателя. */
export async function resolveLessonEnrollment(lesson: { childId: string; teacherId: string }) {
  const enrollments = await prisma.enrollment.findMany({
    where: { childId: lesson.childId, status: 'ACTIVE' },
    orderBy: { createdAt: 'asc' },
    include: { course: { select: { subject: { select: { id: true, title: true } } } } },
  });
  if (enrollments.length === 0) return null;
  if (enrollments.length === 1) return enrollments[0];

  // Несколько активных записей — предпочитаем ту, чей предмет ведёт этот преподаватель.
  const teacher = await prisma.teacherProfile.findUnique({ where: { id: lesson.teacherId }, select: { subjects: true } });
  const subjects = new Set(teacher?.subjects ?? []);
  const matched = enrollments.find(
    (e) => subjects.has(e.course.subject.id) || subjects.has(e.course.subject.title),
  );
  return matched ?? enrollments[0];
}

export interface LessonTopicOption {
  topicId: string;
  title: string;
  moduleTitle: string;
  status: string; // LOCKED | RECOMMENDED | IN_PROGRESS | COMPLETED
  isNextRecommended: boolean;
}

export interface LessonTopicOptions {
  enrollmentId: string | null;
  courseTitle: string | null;
  subjectTitle: string | null;
  recommendedTopicId: string | null;
  currentTopicId: string | null; // тема, уже выбранная на этот урок (если есть)
  topics: LessonTopicOption[];
}

/** Опции тем для подготовки урока: список тем курса + рекомендованная следующая. */
export async function lessonTopicOptions(lesson: { childId: string; teacherId: string; topicId: string | null }): Promise<LessonTopicOptions> {
  const enrollment = await resolveLessonEnrollment(lesson);
  if (!enrollment) {
    return { enrollmentId: null, courseTitle: null, subjectTitle: null, recommendedTopicId: null, currentTopicId: lesson.topicId, topics: [] };
  }
  const progress = await buildEnrollmentProgress(enrollment.id);
  if (!progress) {
    return { enrollmentId: enrollment.id, courseTitle: null, subjectTitle: null, recommendedTopicId: null, currentTopicId: lesson.topicId, topics: [] };
  }

  // Названия модулей для подписи тем.
  const modules = await prisma.courseModule.findMany({
    where: { courseId: enrollment.courseId },
    orderBy: { sortOrder: 'asc' },
    select: { title: true, topics: { select: { id: true } } },
  });
  const moduleByTopic = new Map<string, string>();
  for (const m of modules) for (const t of m.topics) moduleByTopic.set(t.id, m.title);

  return {
    enrollmentId: enrollment.id,
    courseTitle: progress.courseTitle,
    subjectTitle: progress.subjectTitle,
    recommendedTopicId: progress.nextTopicId,
    currentTopicId: lesson.topicId,
    topics: progress.topics.map((t) => ({
      topicId: t.topicId,
      title: t.title,
      moduleTitle: moduleByTopic.get(t.topicId) ?? '',
      status: t.status,
      isNextRecommended: t.isNextRecommended,
    })),
  };
}

/** Тема по умолчанию при подготовке урока — рекомендованная следующая тема записи. */
export async function defaultLessonTopicId(lesson: { childId: string; teacherId: string }): Promise<string | null> {
  const enrollment = await resolveLessonEnrollment(lesson);
  if (!enrollment) return null;
  return currentNextTopicId(enrollment.id);
}

/**
 * Отмечает тему урока пройденной по завершении. Возвращает `newlyCompleted=false`,
 * если тема уже была пройдена (перепрохождение) — тогда очки повторно не начисляются.
 */
export async function completeLessonTopic(
  tx: Tx,
  lesson: { id: string; childId: string; teacherId: string; topicId: string | null },
): Promise<{ newlyCompleted: boolean }> {
  if (!lesson.topicId) return { newlyCompleted: true }; // урок без темы — очки как обычно

  // Запись ребёнка, к курсу которой относится тема урока.
  const topic = await tx.topic.findUnique({
    where: { id: lesson.topicId },
    select: { module: { select: { courseId: true } } },
  });
  const courseId = topic?.module.courseId;
  if (!courseId) return { newlyCompleted: true };

  const enrollment = await tx.enrollment.findFirst({
    where: { childId: lesson.childId, courseId },
    select: { id: true },
  });
  if (!enrollment) return { newlyCompleted: true }; // не записан на курс — не блокируем очки

  const existing = await tx.topicProgress.findUnique({
    where: { enrollmentId_topicId: { enrollmentId: enrollment.id, topicId: lesson.topicId } },
    select: { status: true },
  });
  const alreadyCompleted = existing?.status === 'COMPLETED';

  await tx.topicProgress.upsert({
    where: { enrollmentId_topicId: { enrollmentId: enrollment.id, topicId: lesson.topicId } },
    create: { enrollmentId: enrollment.id, topicId: lesson.topicId, status: 'COMPLETED', completedAt: new Date() },
    update: { status: 'COMPLETED', ...(alreadyCompleted ? {} : { completedAt: new Date() }) },
  });

  return { newlyCompleted: !alreadyCompleted };
}
