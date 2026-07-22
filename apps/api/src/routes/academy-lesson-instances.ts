import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { Prisma, prisma } from '@allvision/database';
import {
  pickCharacterReferenceKind,
  readSceneDocument,
  resolveInstanceScene,
  type AcademyScene,
  type CharacterInjection,
  type InstanceOverrides,
} from '@allvision/shared';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/require-role';
import { HttpError } from '../utils/http-error';
import { readCharacterRef } from '../services/child-photo-storage';

export const academyLessonInstancesRouter = Router();
academyLessonInstancesRouter.use(requireAuth);

const createSchema = z.object({
  lessonId: z.string().min(1),
  templateVersionId: z.string().min(1),
  overrides: z.object({ hiddenElementIds: z.array(z.string()).max(500).optional() }).optional(),
});

function isAdmin(req: Request) {
  return req.user!.role === 'ADMIN';
}

/** Загружает урок с полями для проверки участника (преподаватель / родитель). */
async function loadLessonParticipants(lessonId: string) {
  return prisma.lesson.findUnique({
    where: { id: lessonId },
    include: { teacher: { select: { userId: true } }, child: { select: { id: true, parentId: true } } },
  });
}

function assertParticipant(
  req: Request,
  lesson: { teacher: { userId: string }; child: { parentId: string } },
) {
  const uid = req.user!.id;
  if (isAdmin(req) || lesson.teacher.userId === uid || lesson.child.parentId === uid) return;
  throw new HttpError(403, 'FORBIDDEN', 'Нет доступа к этому уроку');
}

// === Список опубликованных шаблонов для подготовки урока (преподаватель) ===
academyLessonInstancesRouter.get('/published-templates', requireRole('TEACHER', 'METHODIST'), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const templates = await prisma.lessonTemplate.findMany({
      where: { status: 'published', latestVersion: { gt: 0 } },
      orderBy: { updatedAt: 'desc' },
      include: { versions: { orderBy: { version: 'desc' }, take: 1, select: { id: true, version: true } } },
    });
    res.json({
      items: templates
        .filter((t) => t.versions.length > 0)
        .map((t) => ({ templateId: t.id, title: t.title, versionId: t.versions[0].id, version: t.versions[0].version })),
    });
  } catch (err) {
    next(err);
  }
});

// === Создать/обновить экземпляр урока (преподаватель урока или админ) ===
academyLessonInstancesRouter.post('/', requireRole('TEACHER', 'METHODIST'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createSchema.parse(req.body);
    const lesson = await loadLessonParticipants(data.lessonId);
    if (!lesson) throw new HttpError(404, 'LESSON_NOT_FOUND', 'Урок не найден');
    if (!isAdmin(req) && lesson.teacher.userId !== req.user!.id) {
      throw new HttpError(403, 'FORBIDDEN', 'Это не ваш урок');
    }
    const version = await prisma.lessonTemplateVersion.findUnique({ where: { id: data.templateVersionId } });
    if (!version) throw new HttpError(404, 'VERSION_NOT_FOUND', 'Версия шаблона не найдена');

    const instance = await prisma.$transaction(async (tx) => {
      const created = await tx.lessonInstance.upsert({
        where: { lessonId: lesson.id },
        create: {
          lessonId: lesson.id,
          templateVersionId: version.id,
          childId: lesson.child.id,
          overrides: (data.overrides ?? {}) as Prisma.InputJsonValue,
          createdById: req.user!.id,
        },
        update: { templateVersionId: version.id, overrides: (data.overrides ?? {}) as Prisma.InputJsonValue },
      });
      // Урок подготовлен → READY.
      await tx.lesson.update({ where: { id: lesson.id }, data: { status: 'READY' } });
      return created;
    });
    res.status(201).json({ instanceId: instance.id });
  } catch (err) {
    next(err);
  }
});

// === Экземпляр по уроку (участник) ===
academyLessonInstancesRouter.get('/by-lesson/:lessonId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const lesson = await loadLessonParticipants(req.params.lessonId);
    if (!lesson) throw new HttpError(404, 'LESSON_NOT_FOUND', 'Урок не найден');
    assertParticipant(req, lesson);
    const instance = await prisma.lessonInstance.findUnique({
      where: { lessonId: req.params.lessonId },
      include: { version: { include: { template: { select: { title: true } } } } },
    });
    if (!instance) return res.json({ instance: null });
    res.json({
      instance: {
        id: instance.id,
        title: instance.version.template.title,
        version: instance.version.version,
        overrides: instance.overrides ?? {},
      },
    });
  } catch (err) {
    next(err);
  }
});

async function loadInstanceForParticipant(req: Request) {
  const instance = await prisma.lessonInstance.findUnique({
    where: { id: req.params.id },
    include: {
      version: true,
      lesson: { include: { teacher: { select: { userId: true } }, child: { select: { id: true, parentId: true } } } },
    },
  });
  if (!instance) throw new HttpError(404, 'INSTANCE_NOT_FOUND', 'Экземпляр урока не найден');
  assertParticipant(req, instance.lesson);
  return instance;
}

// === Финальная сцена экземпляра (участник): версия + персонаж ребёнка + оверрайды ===
academyLessonInstancesRouter.get('/:id/scene', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const instance = await loadInstanceForParticipant(req);
    const scene = instance.version.scene as unknown as AcademyScene;

    // Подстановка персонажа: APPROVED-профиль ребёнка → лучший референс.
    let character: CharacterInjection | null = null;
    const profile = await prisma.characterProfile.findFirst({
      where: { childId: instance.childId, status: 'APPROVED' },
      include: { references: true },
    });
    if (profile && profile.references.length > 0) {
      const kind = pickCharacterReferenceKind(profile.references.map((r) => r.kind));
      const ref = profile.references.find((r) => r.kind === kind) ?? profile.references[0];
      character = {
        assetId: ref.id,
        fileUrl: `/api/academy/lesson-instances/${instance.id}/character/${ref.id}/file`,
        mimeType: ref.mimeType,
      };
    }

    const resolved = resolveInstanceScene(scene, { character, overrides: (instance.overrides ?? {}) as InstanceOverrides });
    res.json({ scene: resolved, hasCharacter: Boolean(character) });
  } catch (err) {
    next(err);
  }
});

// Резолвит референс персонажа ребёнка для инъекции в сцены экземпляра.
async function characterForInstance(instanceId: string, childId: string): Promise<CharacterInjection | null> {
  const profile = await prisma.characterProfile.findFirst({
    where: { childId, status: 'APPROVED' },
    include: { references: true },
  });
  if (!profile || profile.references.length === 0) return null;
  const kind = pickCharacterReferenceKind(profile.references.map((r) => r.kind));
  const ref = profile.references.find((r) => r.kind === kind) ?? profile.references[0];
  return {
    assetId: ref.id,
    fileUrl: `/api/academy/lesson-instances/${instanceId}/character/${ref.id}/file`,
    mimeType: ref.mimeType,
  };
}

// === Все сцены урока (маршрут) для живой комнаты (участник) ===
academyLessonInstancesRouter.get('/:id/scenes', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const instance = await loadInstanceForParticipant(req);
    const character = await characterForInstance(instance.id, instance.childId);
    const overrides = (instance.overrides ?? {}) as InstanceOverrides;
    const scenes = readSceneDocument(instance.version.scene).map((s) => resolveInstanceScene(s, { character, overrides }));
    res.json({ scenes, hasCharacter: Boolean(character) });
  } catch (err) {
    next(err);
  }
});

// === Файл референса персонажа (участник урока), из закрытого хранилища ===
academyLessonInstancesRouter.get('/:id/character/:refId/file', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const instance = await loadInstanceForParticipant(req);
    const ref = await prisma.characterReference.findUnique({
      where: { id: req.params.refId },
      include: { profile: { select: { childId: true } } },
    });
    if (!ref || ref.profile.childId !== instance.childId) {
      throw new HttpError(404, 'REFERENCE_NOT_FOUND', 'Референс не найден');
    }
    const buffer = await readCharacterRef(ref.storageKey).catch(() => {
      throw new HttpError(404, 'REFERENCE_FILE_MISSING', 'Файл референса недоступен');
    });
    res.setHeader('Content-Type', ref.mimeType);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});
