import { Router, type NextFunction, type Request, type Response } from 'express';
import { Prisma, prisma } from '@allvision/database';
import {
  upsertCourseSchema,
  upsertModuleSchema,
  upsertSkillSchema,
  upsertSubjectSchema,
  upsertTopicSchema,
} from '@allvision/shared';
import { requireAuth } from '../middleware/auth';
import { requireMethodist } from '../middleware/require-role';
import { HttpError } from '../utils/http-error';

/** Учебная программа: Направление → Курс → Модуль → Тема → Навык (ADMIN | METHODIST). */
export const academyCurriculumRouter = Router();

academyCurriculumRouter.use(requireAuth, requireMethodist);

async function ensureExists<T>(value: T | null, code: string, message: string): Promise<T> {
  if (!value) throw new HttpError(404, code, message);
  return value;
}

// === Полное дерево программы ===

academyCurriculumRouter.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const [subjects, skills] = await Promise.all([
      prisma.subject.findMany({
        orderBy: { sortOrder: 'asc' },
        include: {
          courses: {
            orderBy: { sortOrder: 'asc' },
            include: {
              modules: {
                orderBy: { sortOrder: 'asc' },
                include: {
                  topics: {
                    orderBy: { sortOrder: 'asc' },
                    include: { skills: { select: { skillId: true } } },
                  },
                },
              },
            },
          },
        },
      }),
      prisma.skillDef.findMany({ orderBy: { createdAt: 'asc' } }),
    ]);
    res.json({ subjects, skills });
  } catch (err) {
    next(err);
  }
});

// === Направления ===

academyCurriculumRouter.post('/subjects', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = upsertSubjectSchema.parse(req.body);
    const existing = await prisma.subject.findUnique({ where: { slug: data.slug } });
    if (existing) throw new HttpError(409, 'SLUG_TAKEN', 'Направление с таким слагом уже есть');
    res.status(201).json(await prisma.subject.create({ data }));
  } catch (err) {
    next(err);
  }
});

academyCurriculumRouter.patch('/subjects/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = upsertSubjectSchema.partial().parse(req.body);
    await ensureExists(
      await prisma.subject.findUnique({ where: { id: req.params.id } }),
      'SUBJECT_NOT_FOUND',
      'Направление не найдено',
    );
    res.json(await prisma.subject.update({ where: { id: req.params.id }, data }));
  } catch (err) {
    next(err);
  }
});

academyCurriculumRouter.delete('/subjects/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await ensureExists(
      await prisma.subject.findUnique({ where: { id: req.params.id } }),
      'SUBJECT_NOT_FOUND',
      'Направление не найдено',
    );
    await prisma.subject.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// === Курсы ===

academyCurriculumRouter.post('/courses', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = upsertCourseSchema.parse(req.body);
    await ensureExists(
      await prisma.subject.findUnique({ where: { id: data.subjectId } }),
      'SUBJECT_NOT_FOUND',
      'Направление не найдено',
    );
    const existing = await prisma.course.findUnique({ where: { slug: data.slug } });
    if (existing) throw new HttpError(409, 'SLUG_TAKEN', 'Курс с таким слагом уже есть');
    res.status(201).json(await prisma.course.create({ data }));
  } catch (err) {
    next(err);
  }
});

academyCurriculumRouter.patch('/courses/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = upsertCourseSchema.partial().parse(req.body);
    await ensureExists(
      await prisma.course.findUnique({ where: { id: req.params.id } }),
      'COURSE_NOT_FOUND',
      'Курс не найден',
    );
    res.json(await prisma.course.update({ where: { id: req.params.id }, data }));
  } catch (err) {
    next(err);
  }
});

academyCurriculumRouter.delete('/courses/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await ensureExists(
      await prisma.course.findUnique({ where: { id: req.params.id } }),
      'COURSE_NOT_FOUND',
      'Курс не найден',
    );
    await prisma.course.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// === Модули ===

academyCurriculumRouter.post('/modules', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = upsertModuleSchema.parse(req.body);
    await ensureExists(
      await prisma.course.findUnique({ where: { id: data.courseId } }),
      'COURSE_NOT_FOUND',
      'Курс не найден',
    );
    res.status(201).json(await prisma.courseModule.create({ data }));
  } catch (err) {
    next(err);
  }
});

academyCurriculumRouter.patch('/modules/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = upsertModuleSchema.partial().parse(req.body);
    await ensureExists(
      await prisma.courseModule.findUnique({ where: { id: req.params.id } }),
      'MODULE_NOT_FOUND',
      'Модуль не найден',
    );
    res.json(await prisma.courseModule.update({ where: { id: req.params.id }, data }));
  } catch (err) {
    next(err);
  }
});

academyCurriculumRouter.delete('/modules/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await ensureExists(
      await prisma.courseModule.findUnique({ where: { id: req.params.id } }),
      'MODULE_NOT_FOUND',
      'Модуль не найден',
    );
    await prisma.courseModule.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// === Темы ===

academyCurriculumRouter.post('/topics', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { skillIds, ...data } = upsertTopicSchema.parse(req.body);
    await ensureExists(
      await prisma.courseModule.findUnique({ where: { id: data.moduleId } }),
      'MODULE_NOT_FOUND',
      'Модуль не найден',
    );
    const topic = await prisma.topic.create({
      data: {
        ...data,
        content: data.content === null
          ? Prisma.JsonNull
          : (data.content as Prisma.InputJsonValue | undefined),
        skills: skillIds?.length
          ? { create: skillIds.map((skillId) => ({ skillId })) }
          : undefined,
      },
      include: { skills: { select: { skillId: true } } },
    });
    res.status(201).json(topic);
  } catch (err) {
    next(err);
  }
});

academyCurriculumRouter.patch('/topics/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { skillIds, ...data } = upsertTopicSchema.partial().parse(req.body);
    await ensureExists(
      await prisma.topic.findUnique({ where: { id: req.params.id } }),
      'TOPIC_NOT_FOUND',
      'Тема не найдена',
    );
    const topic = await prisma.$transaction(async (tx) => {
      if (skillIds !== undefined) {
        await tx.topicSkill.deleteMany({ where: { topicId: req.params.id } });
        if (skillIds.length > 0) {
          await tx.topicSkill.createMany({
            data: skillIds.map((skillId) => ({ topicId: req.params.id, skillId })),
          });
        }
      }
      return tx.topic.update({
        where: { id: req.params.id },
        data: {
          ...data,
          content: data.content === null
            ? Prisma.JsonNull
            : (data.content as Prisma.InputJsonValue | undefined),
        },
        include: { skills: { select: { skillId: true } } },
      });
    });
    res.json(topic);
  } catch (err) {
    next(err);
  }
});

academyCurriculumRouter.delete('/topics/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await ensureExists(
      await prisma.topic.findUnique({ where: { id: req.params.id } }),
      'TOPIC_NOT_FOUND',
      'Тема не найдена',
    );
    await prisma.topic.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// === Навыки ===

academyCurriculumRouter.post('/skills', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = upsertSkillSchema.parse(req.body);
    await ensureExists(
      await prisma.subject.findUnique({ where: { id: data.subjectId } }),
      'SUBJECT_NOT_FOUND',
      'Направление не найдено',
    );
    const existing = await prisma.skillDef.findUnique({ where: { slug: data.slug } });
    if (existing) throw new HttpError(409, 'SLUG_TAKEN', 'Навык с таким слагом уже есть');
    res.status(201).json(await prisma.skillDef.create({ data }));
  } catch (err) {
    next(err);
  }
});

academyCurriculumRouter.patch('/skills/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = upsertSkillSchema.partial().parse(req.body);
    await ensureExists(
      await prisma.skillDef.findUnique({ where: { id: req.params.id } }),
      'SKILL_NOT_FOUND',
      'Навык не найден',
    );
    res.json(await prisma.skillDef.update({ where: { id: req.params.id }, data }));
  } catch (err) {
    next(err);
  }
});

academyCurriculumRouter.delete('/skills/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await ensureExists(
      await prisma.skillDef.findUnique({ where: { id: req.params.id } }),
      'SKILL_NOT_FOUND',
      'Навык не найден',
    );
    await prisma.skillDef.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
