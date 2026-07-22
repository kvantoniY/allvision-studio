import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { Prisma, prisma } from '@allvision/database';
import {
  pickCharacterReferenceKind,
  readSceneDocument,
  resolveInstanceScene,
  setSceneBackground,
  type CharacterInjection,
  type InstanceOverrides,
} from '@allvision/shared';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/require-role';
import { HttpError } from '../utils/http-error';
import { readCharacterRef, readChildAsset } from '../services/child-photo-storage';
import { ensureFullAiSceneGenerations, fullSceneStatuses, regenerateFullAiScene } from '../services/academy-full-scene-service';
import { addLessonSystemMessage } from '../services/academy-operations-service';

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
      if (lesson.status !== 'READY') {
        await addLessonSystemMessage(tx, {
          parentId: lesson.child.parentId,
          teacherId: lesson.teacherId,
          childId: lesson.child.id,
          body: 'Материалы готовы: урок подготовлен преподавателем.',
        });
      }
      return created;
    });
    // Запускаем генерацию цельных AI-сцен по референсу ученика (fire-and-forget, не блокирует ответ).
    void ensureFullAiSceneGenerations({ id: instance.id, childId: lesson.child.id, version: { scene: version.scene } }, req.user!.id)
      .catch(() => undefined);
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
    // Первая сцена документа урока (для быстрого превью подготовки).
    const first = readSceneDocument(instance.version.scene)[0];
    if (!first) throw new HttpError(404, 'SCENE_EMPTY', 'В уроке нет сцен');
    const character = await characterForInstance(instance.id, instance.childId);
    const resolved = resolveInstanceScene(first, { character, overrides: (instance.overrides ?? {}) as InstanceOverrides });
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
    const statuses = await fullSceneStatuses(instance.id);
    const scenes = readSceneDocument(instance.version.scene).map((s) => {
      let resolved = resolveInstanceScene(s, { character, overrides });
      // Цельная AI-сцена: если генерация по референсу ученика готова — ставим её фоном.
      const st = statuses.get(s.id);
      if (s.generation?.mode === 'full-ai' && st?.status === 'COMPLETED' && st.childAssetId) {
        resolved = setSceneBackground(resolved, {
          type: 'academy-asset',
          assetId: st.childAssetId,
          scope: 'child',
          kind: 'scene',
          fileUrl: `/api/academy/lesson-instances/${instance.id}/scene-file/${st.childAssetId}`,
          mimeType: 'image/jpeg',
        });
      }
      return resolved;
    });
    res.json({
      scenes,
      hasCharacter: Boolean(character),
      sceneStatuses: [...statuses.values()],
    });
  } catch (err) {
    next(err);
  }
});

// === Отчёт по генерациям сцен (участник): что генерируется, что готово, что не требует AI ===
academyLessonInstancesRouter.get('/:id/generations', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const instance = await loadInstanceForParticipant(req);
    const statuses = await fullSceneStatuses(instance.id);
    const hasCharacter = Boolean(await characterForInstance(instance.id, instance.childId));

    const scenes = readSceneDocument(instance.version.scene).map((scene, index) => {
      const prompt = (scene.generation?.prompt ?? '').trim();
      // AI-генерация нужна только цельным сценам с промптом; послойные собраны из
      // готовых материалов и переделывать в них нечего.
      const needsGeneration = scene.generation?.mode === 'full-ai' && prompt.length >= 8;
      const status = statuses.get(scene.id);
      return {
        sceneId: scene.id,
        index,
        title: scene.title,
        mode: (scene.generation?.mode ?? 'layered') as 'layered' | 'full-ai',
        needsGeneration,
        prompt: needsGeneration ? prompt : null,
        status: needsGeneration ? (status?.status ?? (hasCharacter ? 'NOT_STARTED' : 'BLOCKED')) : 'NOT_NEEDED',
        previewUrl: status?.childAssetId
          ? `/api/academy/lesson-instances/${instance.id}/scene-file/${status.childAssetId}`
          : null,
      };
    });

    res.json({
      hasCharacter,
      scenes,
      total: scenes.filter((s) => s.needsGeneration).length,
      ready: scenes.filter((s) => s.status === 'COMPLETED').length,
      running: scenes.filter((s) => s.status === 'PENDING' || s.status === 'PROCESSING').length,
      failed: scenes.filter((s) => s.status === 'FAILED').length,
    });
  } catch (err) {
    next(err);
  }
});

// === Перегенерация одной AI-сцены (преподаватель урока или админ) ===
academyLessonInstancesRouter.post('/:id/generations/:sceneId/regenerate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const instance = await loadInstanceForParticipant(req);
    if (!isAdmin(req) && instance.lesson.teacher.userId !== req.user!.id) {
      throw new HttpError(403, 'FORBIDDEN', 'Перегенерацию запускает преподаватель урока');
    }
    const result = await regenerateFullAiScene(
      { id: instance.id, childId: instance.childId, version: { scene: instance.version.scene } },
      req.params.sceneId,
      req.user!.id,
    );
    if (!result.ok) {
      if (result.reason === 'SCENE_NOT_AI') {
        throw new HttpError(400, 'SCENE_NOT_AI', 'Эта сцена собрана из готовых материалов — генерировать в ней нечего');
      }
      if (result.reason === 'CHARACTER_NOT_READY') {
        throw new HttpError(409, 'CHARACTER_NOT_READY', 'У ребёнка нет утверждённого AI-персонажа');
      }
      throw new HttpError(500, 'REGENERATE_FAILED', 'Не удалось запустить генерацию');
    }
    res.status(202).json({ ok: true });
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
    await prisma.accessLog.create({
      data: {
        actorId: req.user!.id,
        childId: instance.childId,
        actorRole: req.user!.role,
        action: 'VIEW',
        resourceType: 'CHARACTER_REFERENCE',
        resourceId: ref.id,
      },
    });
    res.setHeader('Content-Type', ref.mimeType);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

// === Файл сгенерированной цельной AI-сцены (участник урока), из закрытого хранилища ===
academyLessonInstancesRouter.get('/:id/scene-file/:childAssetId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const instance = await loadInstanceForParticipant(req);
    const asset = await prisma.childAsset.findUnique({ where: { id: req.params.childAssetId } });
    if (!asset || asset.childId !== instance.childId) {
      throw new HttpError(404, 'SCENE_ASSET_NOT_FOUND', 'Иллюстрация сцены не найдена');
    }
    const buffer = await readChildAsset(asset.storageKey).catch(() => {
      throw new HttpError(404, 'SCENE_FILE_MISSING', 'Файл иллюстрации недоступен');
    });
    res.setHeader('Content-Type', asset.mimeType);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});
