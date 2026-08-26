import crypto from 'node:crypto';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { prisma } from '@allvision/database';
import {
  TIMELINE_LIMITS,
  generationExpiresAt,
  timelineDurationSec,
  timelineSchema,
  validateTimeline,
} from '@allvision/shared';
import { requireAuth } from '../../middleware/auth';
import { uploadEditorMedia } from '../../middleware/upload';
import { HttpError } from '../../utils/http-error';
import { logger } from '../../utils/logger';
import { createFreeChatProject } from '../../services/free-chat-generation';
import * as fileService from '../../services/file-service';
import * as queues from '../../queues';

export const videoProjectsRouter = Router();

videoProjectsRouter.use(requireAuth);

const listSelect = {
  id: true,
  title: true,
  timeline: true,
  lastExportId: true,
  createdAt: true,
  updatedAt: true,
} as const;

const createSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  timeline: z.unknown().optional(),
});

const updateSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  timeline: z.unknown().optional(),
});

/** Пустой ролик: один чёрный кадр, чтобы редактору было что показать сразу после создания. */
function emptyTimeline() {
  return timelineSchema.parse({
    aspect: '9:16',
    scenes: [
      {
        id: `scene_${crypto.randomUUID().slice(0, 8)}`,
        source: { kind: 'color', color: '#0b1020' },
        durationSec: 4,
        transition: 'dissolve',
        transitionDurationSec: 0.6,
      },
    ],
  });
}

/**
 * Черновик проверяется только схемой.
 *
 * Ролик в работе может временно нарушать лимиты — например, пользователь набросал сцен
 * и собирается подрезать длительности. Отказывать такому автосохранению нельзя: он потеряет
 * работу из-за состояния, которое сам собирался поправить. Полная проверка — на экспорте,
 * где нерендерящийся ролик действительно нельзя пропускать.
 */
function parseDraftTimeline(value: unknown) {
  const parsed = timelineSchema.safeParse(value);
  if (!parsed.success) {
    throw new HttpError(400, 'INVALID_TIMELINE', 'Не удалось разобрать раскладку ролика');
  }
  return parsed.data;
}

/** Перед сборкой ролик обязан пройти и схему, и проверки целиком. */
function parseRenderableTimeline(value: unknown) {
  const timeline = parseDraftTimeline(value);
  const issues = validateTimeline(timeline);
  if (issues.length > 0) {
    throw new HttpError(400, 'INVALID_TIMELINE', issues.map((issue) => issue.message).join(' '));
  }
  return timeline;
}

async function ownedProject(userId: string, id: string) {
  const project = await prisma.videoProject.findFirst({
    where: { id, userId, deletedAt: null },
    select: listSelect,
  });
  // 404 вместо 403: существование чужого ролика — тоже информация.
  if (!project) throw new HttpError(404, 'VIDEO_PROJECT_NOT_FOUND', 'Ролик не найден');
  return project;
}

videoProjectsRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const items = await prisma.videoProject.findMany({
      where: { userId: req.user!.id, deletedAt: null },
      orderBy: { updatedAt: 'desc' },
      take: 100,
      select: listSelect,
    });
    res.json({ items });
  } catch (err) {
    next(err);
  }
});

videoProjectsRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = createSchema.parse(req.body ?? {});
    const timeline = body.timeline ? parseDraftTimeline(body.timeline) : emptyTimeline();
    const project = await prisma.videoProject.create({
      data: {
        userId: req.user!.id,
        title: body.title ?? 'Новый ролик',
        timeline: timeline as never,
      },
      select: listSelect,
    });
    res.status(201).json({ project });
  } catch (err) {
    next(err);
  }
});

videoProjectsRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const project = await ownedProject(req.user!.id, req.params.id);
    res.json({ project });
  } catch (err) {
    next(err);
  }
});

videoProjectsRouter.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await ownedProject(req.user!.id, req.params.id);
    const body = updateSchema.parse(req.body ?? {});
    const timeline = body.timeline !== undefined ? parseDraftTimeline(body.timeline) : undefined;
    const project = await prisma.videoProject.update({
      where: { id: req.params.id },
      data: {
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(timeline ? { timeline: timeline as never } : {}),
      },
      select: listSelect,
    });
    res.json({ project });
  } catch (err) {
    next(err);
  }
});

videoProjectsRouter.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await ownedProject(req.user!.id, req.params.id);
    // Мягкое удаление: файлы сцен могут быть уже использованы в готовых экспортах.
    await prisma.videoProject.update({ where: { id: req.params.id }, data: { deletedAt: new Date() } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

/**
 * Загрузка материала сцены. Длительность видео меряет браузер и присылает подсказкой —
 * ffprobe в API-контейнере нет, а рендер всё равно перемерит файл сам.
 */
videoProjectsRouter.post('/:id/media', uploadEditorMedia, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await ownedProject(req.user!.id, req.params.id);
    const file = (req as Request & { file?: Express.Multer.File }).file;
    if (!file) throw new HttpError(400, 'FILE_REQUIRED', 'Файл не получен');

    const uploaded = await fileService.uploadEditorMedia(req.user!.id, req.params.id, file);
    res.status(201).json({
      url: uploaded.url,
      mediaKind: uploaded.mediaKind,
      ...(uploaded.dimensions ? { dimensions: uploaded.dimensions } : {}),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Генерация материала прямо в сцену.
 *
 * Переиспользует тот же путь, что и Allvision AI: там уже есть проверка моделей,
 * расчёт цены, атомарное списание и возврат коинов при сбое. Отличается только
 * mode проекта и тем, что результат вернётся в сцену, а не в ленту чата.
 */
videoProjectsRouter.post('/:id/scenes/:sceneId/generate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const videoProject = await ownedProject(userId, req.params.id);
    const timeline = parseDraftTimeline(videoProject.timeline);
    const sceneIndex = timeline.scenes.findIndex((scene) => scene.id === req.params.sceneId);
    if (sceneIndex < 0) throw new HttpError(404, 'SCENE_NOT_FOUND', 'Сцена не найдена');

    const result = await createFreeChatProject(userId, req.body, {
      mode: 'editor-generation',
      titlePrefix: 'Сцена: ',
    });

    // Ссылку на генерацию пишем в сцену сразу: если пользователь закроет вкладку,
    // результат всё равно найдёт своё место — воркер допишет его по этой метке.
    const scenes = timeline.scenes.map((scene, index) =>
      index === sceneIndex ? { ...scene, generationProjectId: result.projectId, origin: 'generated' as const } : scene,
    );
    await prisma.videoProject.update({
      where: { id: videoProject.id },
      data: { timeline: { ...timeline, scenes } as never },
    });

    res.status(202).json({
      projectId: result.projectId,
      tokensCost: result.project.tokensCost,
      estimatedDurationSec: result.estimatedDurationSec,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Экспорт. Склейка идёт локальным ffmpeg и стоит копейки, поэтому она бесплатна —
 * пользователь уже заплатил за генерации, отдавать ему испорченный результат незачем.
 */
videoProjectsRouter.post('/:id/export', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const videoProject = await ownedProject(userId, req.params.id);
    const timeline = parseRenderableTimeline(videoProject.timeline);

    const durationSec = timelineDurationSec(timeline);
    if (durationSec <= 0) {
      throw new HttpError(400, 'EMPTY_TIMELINE', 'В ролике нет ни одной сцены');
    }
    if (timeline.scenes.length > TIMELINE_LIMITS.maxScenes) {
      throw new HttpError(400, 'TOO_MANY_SCENES', `Сцен больше ${TIMELINE_LIMITS.maxScenes}`);
    }

    // Уже идущий экспорт не запускаем второй раз: это просто лишняя работа для ВМ.
    if (videoProject.lastExportId) {
      const running = await prisma.project.findFirst({
        where: { id: videoProject.lastExportId, userId, status: { in: ['PENDING', 'PROCESSING'] } },
        select: { id: true },
      });
      if (running) {
        res.status(202).json({ projectId: running.id, alreadyRunning: true });
        return;
      }
    }

    const projectId = crypto.randomUUID();
    const pipelineSnapshot = [
      {
        id: 'step_1',
        blockSlug: 'timeline-render',
        params: { timeline, quality: 'balanced', photo_motion: true },
      },
    ];

    const project = await prisma.project.create({
      data: {
        id: projectId,
        userId,
        mode: 'video-export',
        title: videoProject.title,
        status: 'PENDING',
        progress: 0,
        inputImages: [],
        tokensCost: 0,
        pipelineSnapshot: pipelineSnapshot as never,
        userInputs: {} as never,
        stepProgress: [
          { stepId: 'step_1', blockSlug: 'timeline-render', status: 'pending', progress: 0 },
        ] as never,
        expiresAt: generationExpiresAt(),
      },
      select: { id: true, status: true, progress: true, createdAt: true },
    });

    await prisma.videoProject.update({ where: { id: videoProject.id }, data: { lastExportId: project.id } });

    try {
      await queues.addVideoRenderJob({ projectId: project.id, userId, videoProjectId: videoProject.id });
    } catch (queueError) {
      logger.error(`[video-projects] failed to enqueue export ${project.id}`, queueError);
      await prisma.project.update({
        where: { id: project.id },
        data: {
          status: 'FAILED',
          errorCode: 'QUEUE_UNAVAILABLE',
          errorMessage: 'Не удалось поставить экспорт в очередь',
        },
      });
      throw new HttpError(503, 'QUEUE_UNAVAILABLE', 'Сервис рендера временно недоступен');
    }

    res.status(202).json({ projectId: project.id, durationSec });
  } catch (err) {
    next(err);
  }
});
