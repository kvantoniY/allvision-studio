import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { Prisma, prisma } from '@allvision/database';
import { createEmptyScene, validateScene } from '@allvision/shared';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/require-role';
import { HttpError } from '../utils/http-error';

/** Конструктор сцен: шаблоны уроков (METHODIST | ADMIN). */
export const academyLessonTemplatesRouter = Router();

academyLessonTemplatesRouter.use(requireAuth, requireRole('METHODIST'));

const MAX_SCENE_BYTES = 2 * 1024 * 1024; // защита от гигантского черновика

const createSchema = z.object({
  title: z.string().trim().min(1).max(200),
  topicId: z.string().min(1).nullable().optional(),
});

const updateSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  topicId: z.string().min(1).nullable().optional(),
  status: z.enum(['draft', 'published']).optional(),
  // Черновик хранится как есть (промежуточные невалидные состояния допустимы);
  // строгая проверка — по кнопке «Проверить» на клиенте и при публикации (A6.3).
  scene: z.record(z.unknown()).optional(),
});

function isAdmin(req: Request) {
  return req.user!.role === 'ADMIN';
}

async function findTemplate(req: Request) {
  const template = await prisma.lessonTemplate.findUnique({ where: { id: req.params.id } });
  if (!template) throw new HttpError(404, 'TEMPLATE_NOT_FOUND', 'Шаблон урока не найден');
  // Методист видит/меняет свои; админ — любые.
  if (!isAdmin(req) && template.createdById !== req.user!.id) {
    throw new HttpError(404, 'TEMPLATE_NOT_FOUND', 'Шаблон урока не найден');
  }
  return template;
}

function toListItem(t: { id: string; title: string; status: string; topicId: string | null; updatedAt: Date; createdById: string }) {
  return { id: t.id, title: t.title, status: t.status, topicId: t.topicId, updatedAt: t.updatedAt.toISOString() };
}

academyLessonTemplatesRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const where = isAdmin(req) ? {} : { createdById: req.user!.id };
    const templates = await prisma.lessonTemplate.findMany({ where, orderBy: { updatedAt: 'desc' } });
    res.json({ items: templates.map(toListItem) });
  } catch (err) {
    next(err);
  }
});

academyLessonTemplatesRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createSchema.parse(req.body);
    const scene = createEmptyScene({ title: data.title });
    const template = await prisma.lessonTemplate.create({
      data: {
        title: data.title,
        topicId: data.topicId ?? null,
        status: 'draft',
        scene: scene as unknown as Prisma.InputJsonValue,
        createdById: req.user!.id,
      },
    });
    res.status(201).json({ template: { ...toListItem(template), scene: template.scene } });
  } catch (err) {
    next(err);
  }
});

academyLessonTemplatesRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const template = await findTemplate(req);
    res.json({ template: { ...toListItem(template), scene: template.scene } });
  } catch (err) {
    next(err);
  }
});

academyLessonTemplatesRouter.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = updateSchema.parse(req.body);
    await findTemplate(req);

    if (data.scene !== undefined) {
      if (Buffer.byteLength(JSON.stringify(data.scene)) > MAX_SCENE_BYTES) {
        throw new HttpError(413, 'SCENE_TOO_LARGE', 'Сцена слишком большая');
      }
      if (!Array.isArray((data.scene as { layers?: unknown }).layers)) {
        throw new HttpError(400, 'INVALID_SCENE_SHAPE', 'Некорректная структура сцены');
      }
    }
    // Публикация требует строго валидной сцены.
    if (data.status === 'published') {
      const sceneToCheck = data.scene ?? (await prisma.lessonTemplate.findUnique({ where: { id: req.params.id } }))?.scene;
      const check = validateScene(sceneToCheck);
      if (!check.ok) throw new HttpError(400, 'SCENE_INVALID', `Нельзя опубликовать: ${check.issues[0] ?? 'сцена невалидна'}`);
    }

    const template = await prisma.lessonTemplate.update({
      where: { id: req.params.id },
      data: {
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.topicId !== undefined ? { topicId: data.topicId } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.scene !== undefined ? { scene: data.scene as Prisma.InputJsonValue } : {}),
      },
    });
    res.json({ template: { ...toListItem(template), scene: template.scene } });
  } catch (err) {
    next(err);
  }
});

// Публикация = immutable-снапшот текущей сцены новой версией.
academyLessonTemplatesRouter.post('/:id/publish', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const template = await findTemplate(req);
    const check = validateScene(template.scene);
    if (!check.ok) throw new HttpError(400, 'SCENE_INVALID', `Нельзя опубликовать: ${check.issues[0] ?? 'сцена невалидна'}`);
    const version = template.latestVersion + 1;
    const created = await prisma.$transaction(async (tx) => {
      const v = await tx.lessonTemplateVersion.create({
        data: {
          templateId: template.id,
          version,
          scene: template.scene as Prisma.InputJsonValue,
          publishedById: req.user!.id,
        },
      });
      await tx.lessonTemplate.update({ where: { id: template.id }, data: { status: 'published', latestVersion: version } });
      return v;
    });
    res.status(201).json({ version: { id: created.id, version: created.version } });
  } catch (err) {
    next(err);
  }
});

academyLessonTemplatesRouter.get('/:id/versions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await findTemplate(req);
    const versions = await prisma.lessonTemplateVersion.findMany({
      where: { templateId: req.params.id },
      orderBy: { version: 'desc' },
      select: { id: true, version: true, createdAt: true },
    });
    res.json({ items: versions.map((v) => ({ id: v.id, version: v.version, createdAt: v.createdAt.toISOString() })) });
  } catch (err) {
    next(err);
  }
});

academyLessonTemplatesRouter.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await findTemplate(req);
    await prisma.lessonTemplate.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
