import { Router, type NextFunction, type Request, type Response } from 'express';
import { prisma } from '@allvision/database';
import {
  overrideNextTopicSchema,
  setSkillProgressSchema,
  setTopicProgressSchema,
} from '@allvision/shared';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/require-role';
import { HttpError } from '../utils/http-error';
import { buildEnrollmentProgress, currentNextTopicId } from '../services/academy-progress-service';

/** Проведение прогресса ученика: TEACHER | METHODIST (+ ADMIN всегда). */
export const academyProgressRouter = Router();

academyProgressRouter.use(requireAuth, requireRole('TEACHER', 'METHODIST'));

// Отметить статус темы в рамках энролмента
academyProgressRouter.post('/topic', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = setTopicProgressSchema.parse(req.body);
    const enrollment = await prisma.enrollment.findUnique({ where: { id: data.enrollmentId } });
    if (!enrollment) throw new HttpError(404, 'ENROLLMENT_NOT_FOUND', 'Запись на курс не найдена');
    // Тема должна принадлежать курсу энролмента.
    const topic = await prisma.topic.findFirst({
      where: { id: data.topicId, module: { courseId: enrollment.courseId } },
    });
    if (!topic) throw new HttpError(400, 'TOPIC_NOT_IN_COURSE', 'Тема не принадлежит курсу записи');

    await prisma.topicProgress.upsert({
      where: { enrollmentId_topicId: { enrollmentId: data.enrollmentId, topicId: data.topicId } },
      create: {
        enrollmentId: data.enrollmentId,
        topicId: data.topicId,
        status: data.status,
        teacherNote: data.teacherNote ?? null,
        completedAt: data.status === 'COMPLETED' ? new Date() : null,
      },
      update: {
        status: data.status,
        ...(data.teacherNote !== undefined ? { teacherNote: data.teacherNote } : {}),
        completedAt: data.status === 'COMPLETED' ? new Date() : null,
      },
    });

    // Если все темы курса пройдены — закрываем энролмент.
    const progress = await buildEnrollmentProgress(data.enrollmentId);
    if (progress && progress.totalTopics > 0 && progress.completedTopics === progress.totalTopics) {
      await prisma.enrollment.update({ where: { id: data.enrollmentId }, data: { status: 'COMPLETED' } });
    }
    res.json({ progress: await buildEnrollmentProgress(data.enrollmentId) });
  } catch (err) {
    next(err);
  }
});

// Установить уровень навыка ребёнка (0..3)
academyProgressRouter.post('/skill', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = setSkillProgressSchema.parse(req.body);
    const [child, skill] = await Promise.all([
      prisma.childProfile.findFirst({ where: { id: data.childId, deletedAt: null } }),
      prisma.skillDef.findUnique({ where: { id: data.skillId } }),
    ]);
    if (!child) throw new HttpError(404, 'CHILD_NOT_FOUND', 'Ребёнок не найден');
    if (!skill) throw new HttpError(404, 'SKILL_NOT_FOUND', 'Навык не найден');

    const row = await prisma.skillProgress.upsert({
      where: { childId_skillId: { childId: data.childId, skillId: data.skillId } },
      create: { childId: data.childId, skillId: data.skillId, level: data.level },
      update: { level: data.level },
    });
    res.json({ skill: { skillId: row.skillId, level: row.level } });
  } catch (err) {
    next(err);
  }
});

// Сменить рекомендованную тему (обязательная причина → журнал TopicChangeLog)
academyProgressRouter.post('/enrollments/:id/override', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = overrideNextTopicSchema.parse(req.body);
    const enrollment = await prisma.enrollment.findUnique({ where: { id: req.params.id } });
    if (!enrollment) throw new HttpError(404, 'ENROLLMENT_NOT_FOUND', 'Запись на курс не найдена');
    const topic = await prisma.topic.findFirst({
      where: { id: data.toTopicId, module: { courseId: enrollment.courseId } },
    });
    if (!topic) throw new HttpError(400, 'TOPIC_NOT_IN_COURSE', 'Тема не принадлежит курсу записи');

    const fromTopicId = await currentNextTopicId(req.params.id);

    await prisma.$transaction(async (tx) => {
      await tx.topicChangeLog.create({
        data: {
          enrollmentId: req.params.id,
          fromTopicId,
          toTopicId: data.toTopicId,
          reason: data.reason,
          note: data.note ?? null,
          changedById: req.user!.id,
        },
      });
      // Снимаем прежний ручной RECOMMENDED, ставим новый.
      await tx.topicProgress.updateMany({
        where: { enrollmentId: req.params.id, status: 'RECOMMENDED' },
        data: { status: 'LOCKED' },
      });
      await tx.topicProgress.upsert({
        where: { enrollmentId_topicId: { enrollmentId: req.params.id, topicId: data.toTopicId } },
        create: { enrollmentId: req.params.id, topicId: data.toTopicId, status: 'RECOMMENDED' },
        update: { status: 'RECOMMENDED' },
      });
    });
    res.json({ progress: await buildEnrollmentProgress(req.params.id) });
  } catch (err) {
    next(err);
  }
});

// Рекомендованная следующая тема энролмента
academyProgressRouter.get('/enrollments/:id/next-topic', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const progress = await buildEnrollmentProgress(req.params.id);
    if (!progress) throw new HttpError(404, 'ENROLLMENT_NOT_FOUND', 'Запись на курс не найдена');
    res.json({ nextTopicId: progress.nextTopicId, progress });
  } catch (err) {
    next(err);
  }
});
