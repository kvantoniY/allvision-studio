import crypto from 'node:crypto';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { prisma } from '@allvision/database';
import {
  TIMELINE_LIMITS,
  VOICEOVER_MAX_LENGTH,
  applyModelPriceOverride,
  generationExpiresAt,
  markLayerGeneration,
  timelineDurationSec,
  timelineSchema,
  validateTimeline,
  VOICEOVER_MODELS,
  voiceoverPriceCoins,
} from '@allvision/shared';
import { requireAuth } from '../../middleware/auth';
import { uploadEditorMedia } from '../../middleware/upload';
import { HttpError } from '../../utils/http-error';
import { logger } from '../../utils/logger';
import { createFreeChatProject } from '../../services/free-chat-generation';
import { createEditorServiceGeneration } from '../../services/editor-service-generation';
import { readModelPriceOverrides } from '../../services/model-pricing';
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

/**
 * Цена сборки ролика.
 *
 * Склейка идёт локальным ffmpeg и внешним провайдерам ничего не стоит, но занимает CPU
 * машины, поэтому за прогон берётся символическая плата — она же отбивает привычку
 * пересобирать ролик по десять раз подряд вместо правки таймлайна.
 */
const VIDEO_EXPORT_PRICE_COINS = 2;

/** Слой, который ждёт результат генерации. Остальные поля тела разбирает чатовый путь. */
const serviceGenerateSchema = z.object({
  serviceSlug: z.string().trim().min(1).max(120),
  layerId: z.string().trim().max(80).optional(),
  /** Кадр из сцены: им закрываются фото-поля услуги. */
  frameUrl: z.string().trim().max(2000).optional(),
  values: z.record(z.union([z.string().max(2000), z.boolean()])).optional(),
});

const generateTargetSchema = z.object({ layerId: z.string().trim().min(1).max(80).optional() });

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

const fromProjectSchema = z.object({
  projectId: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(120).optional(),
});

/**
 * Достаёт раскладку из завершённого рендера.
 *
 * Шаблон поздравления собирается блоком timeline-render, и он кладёт в результат саму
 * раскладку: по одним ссылкам на файлы сцен титры и музыку не восстановить, а шаблон без
 * своего поздравления открывать в редакторе незачем.
 */
function renderedTimeline(stepProgress: unknown): unknown | null {
  if (!Array.isArray(stepProgress)) return null;
  for (let index = stepProgress.length - 1; index >= 0; index -= 1) {
    const step = stepProgress[index] as Record<string, unknown> | null;
    if (!step || typeof step !== 'object') continue;
    const output = step.output as Record<string, unknown> | undefined;
    const metadata = output?.metadata as Record<string, unknown> | undefined;
    if (metadata?.resolvedTimeline) return metadata.resolvedTimeline;
  }
  return null;
}

/** Ролик из одного кадра: так открывается любой другой результат — из чата, услуги, Студии. */
function singleSceneTimeline(project: { resultVideo: string | null; resultImage: string | null }) {
  const url = project.resultVideo ?? project.resultImage;
  if (!url) return null;
  return timelineSchema.parse({
    scenes: [
      {
        id: `scene_${crypto.randomUUID().slice(0, 8)}`,
        source: { kind: project.resultVideo ? 'video' : 'image', url },
        durationSec: project.resultVideo ? undefined : 4,
        transition: 'dissolve',
        transitionDurationSec: 0.6,
      },
    ],
  });
}

/**
 * Ролик из готового результата: «доработать в редакторе».
 *
 * Генерации уже оплачены, поэтому здесь никаких списаний — мы только переносим готовое
 * в редактируемый вид. Шаблон открывается целиком со сценами, титрами и музыкой, любой
 * другой результат — одной сценой, из которой можно собрать что-то своё.
 */
videoProjectsRouter.post('/from-project', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const body = fromProjectSchema.parse(req.body ?? {});
    const source = await prisma.project.findFirst({
      where: { id: body.projectId, userId, status: 'COMPLETED' },
      select: { id: true, title: true, stepProgress: true, resultVideo: true, resultImage: true },
    });
    // 404 и на чужой, и на незавершённый: существование чужого проекта — тоже информация.
    if (!source) throw new HttpError(404, 'PROJECT_NOT_FOUND', 'Готовый результат не найден');

    const rendered = renderedTimeline(source.stepProgress);
    const parsed = rendered ? timelineSchema.safeParse(rendered) : null;
    const timeline = parsed?.success ? parsed.data : singleSceneTimeline(source);
    if (!timeline) throw new HttpError(400, 'NOTHING_TO_EDIT', 'У этого результата нет материала для редактора');

    const project = await prisma.videoProject.create({
      data: {
        userId,
        // Название проекта бывает длинным (в него попадает промпт), а в шапке редактора
        // это поле ввода: режем по той же границе, что и при обычном создании ролика.
        title: (body.title ?? source.title ?? 'Ролик').slice(0, 120),
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
    const { layerId } = generateTargetSchema.parse(req.body ?? {});

    const result = await createFreeChatProject(userId, req.body, {
      mode: 'editor-generation',
      titlePrefix: 'Сцена: ',
    });

    // Метку пишем сразу и именно в тот слой, который ждёт результат: между запуском и
    // автосохранением редактора есть окно, и если пользователь закроет вкладку внутри
    // него, оплаченная генерация всё равно доедет — воркер найдёт её по этой метке.
    const marked = layerId
      ? markLayerGeneration(timeline, req.params.sceneId, layerId, result.projectId)
      : { changed: false, timeline };
    const scenes = marked.changed
      ? marked.timeline.scenes
      // Слой не назвали — помечаем сцену: так работают ролики прежней формы, где
      // кадр у сцены ровно один.
      : timeline.scenes.map((scene, index) =>
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
 * Запуск услуги прямо из редактора: результат возвращается в кадр сцены.
 */
videoProjectsRouter.post('/:id/scenes/:sceneId/generate-service', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const videoProject = await ownedProject(userId, req.params.id);
    const timeline = parseDraftTimeline(videoProject.timeline);
    const sceneIndex = timeline.scenes.findIndex((scene) => scene.id === req.params.sceneId);
    if (sceneIndex < 0) throw new HttpError(404, 'SCENE_NOT_FOUND', 'Сцена не найдена');

    const body = serviceGenerateSchema.parse(req.body ?? {});
    const result = await createEditorServiceGeneration({
      userId,
      serviceSlug: body.serviceSlug,
      frameUrl: body.frameUrl,
      values: body.values ?? {},
    });

    // Метку ставит сервер — по ней воркер вернёт результат в нужный слой, даже если
    // вкладку закроют до автосохранения редактора.
    const marked = body.layerId
      ? markLayerGeneration(timeline, req.params.sceneId, body.layerId, result.projectId)
      : { changed: false, timeline };
    if (marked.changed) {
      await prisma.videoProject.update({
        where: { id: videoProject.id },
        data: { timeline: marked.timeline as never },
      });
    }

    res.status(202).json(result);
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

    let project;
    try {
      project = await prisma.$transaction(async (tx) => {
        const user = await tx.user.update({
          where: { id: userId, tokenBalance: { gte: VIDEO_EXPORT_PRICE_COINS } },
          data: { tokenBalance: { decrement: VIDEO_EXPORT_PRICE_COINS } },
          select: { tokenBalance: true },
        });
        const created = await tx.project.create({
          data: {
            id: projectId,
            userId,
            mode: 'video-export',
            title: videoProject.title,
            status: 'PENDING',
            progress: 0,
            inputImages: [],
            tokensCost: VIDEO_EXPORT_PRICE_COINS,
            pipelineSnapshot: pipelineSnapshot as never,
            // Ролик называем в проекте: по нему собирается список прошлых сборок,
            // иначе связь живёт только в задаче очереди и после неё теряется.
            userInputs: { videoExport: { videoProjectId: videoProject.id } } as never,
            stepProgress: [
              { stepId: 'step_1', blockSlug: 'timeline-render', status: 'pending', progress: 0 },
            ] as never,
            expiresAt: generationExpiresAt(),
          },
          select: { id: true, status: true, progress: true, createdAt: true },
        });
        await tx.tokenTransaction.create({
          data: {
            reason: 'video_export',
            amount: -VIDEO_EXPORT_PRICE_COINS,
            balanceAfter: user.tokenBalance,
            refId: created.id,
            userId,
          },
        });
        return created;
      });
    } catch (err) {
      if ((err as { code?: string }).code === 'P2025') {
        throw new HttpError(402, 'INSUFFICIENT_TOKENS', 'Недостаточно коинов для сборки');
      }
      throw err;
    }

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
      // Сборка не встала в очередь — коины возвращаем: платили за файл, а не за попытку.
      await prisma.$transaction(async (tx) => {
        const user = await tx.user.update({
          where: { id: userId },
          data: { tokenBalance: { increment: VIDEO_EXPORT_PRICE_COINS } },
          select: { tokenBalance: true },
        });
        await tx.tokenTransaction.create({
          data: {
            reason: 'refund',
            amount: VIDEO_EXPORT_PRICE_COINS,
            balanceAfter: user.tokenBalance,
            refId: project.id,
            userId,
          },
        });
      });
      throw new HttpError(503, 'QUEUE_UNAVAILABLE', 'Сервис рендера временно недоступен');
    }

    res.status(202).json({ projectId: project.id, durationSec, tokensCost: VIDEO_EXPORT_PRICE_COINS });
  } catch (err) {
    next(err);
  }
});

const voiceoverSchema = z.object({
  text: z.string().trim().min(1).max(VOICEOVER_MAX_LENGTH),
  model: z.string().trim().min(1).max(80).default('minimax-speech')
    .refine((slug) => VOICEOVER_MODELS.some((item) => item.slug === slug), { message: 'Неизвестная модель озвучки' }),
  voice: z.string().trim().min(1).max(60).optional(),
  emotion: z.enum(['neutral', 'happy', 'sad', 'surprised']).optional(),
  speed: z.number().min(0.5).max(2).optional(),
  /** Характер речи у голосов из каталога: ниже — живее, выше — ровнее. */
  stability: z.number().min(0).max(1).optional(),
  /** Насколько близко держаться оригинального тембра голоса. */
  similarity: z.number().min(0).max(1).optional(),
  /** Выразительность: выше — больше игры интонацией. */
  style: z.number().min(0).max(1).optional(),
});

/**
 * Озвучка ролика голосом.
 *
 * Готовую дорожку пользователь может просто загрузить файлом — для этого хватает общей
 * загрузки материала и правки таймлайна. Здесь платный путь: текст произносит модель,
 * поэтому нужны списание, очередь и возврат коинов при сбое — тот же порядок, что и у
 * генерации образа в Студии.
 */
/**
 * Прошлые сборки ролика.
 *
 * Каждая сборка — обычный проект, и её файл живёт столько же, сколько любая генерация.
 * Список нужен, чтобы промежуточные версии не терялись: правку можно сравнить с тем,
 * что было, и скачать любую.
 */
videoProjectsRouter.get('/:id/exports', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const videoProject = await ownedProject(userId, req.params.id);
    const rows = await prisma.project.findMany({
      where: {
        userId,
        mode: 'video-export',
        userInputs: { path: ['videoExport', 'videoProjectId'], equals: videoProject.id },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        status: true,
        progress: true,
        resultVideo: true,
        resultThumbnail: true,
        errorCode: true,
        createdAt: true,
        completedAt: true,
      },
    });
    res.json({ items: rows });
  } catch (err) {
    next(err);
  }
});

/**
 * Записи голоса, сделанные для этого ролика.
 *
 * Дорожку можно снять с таймлайна, но сама запись при этом никуда не девается: за синтез
 * уже заплачено, и человек должен видеть, что у него есть, и вернуть запись обратно.
 */
videoProjectsRouter.get('/:id/voiceovers', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const videoProject = await ownedProject(userId, req.params.id);
    const rows = await prisma.project.findMany({
      where: {
        userId,
        mode: 'editor-voiceover',
        userInputs: { path: ['editorVoiceover', 'videoProjectId'], equals: videoProject.id },
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: {
        id: true,
        status: true,
        progress: true,
        resultVideo: true,
        resultImage: true,
        inputText: true,
        errorCode: true,
        createdAt: true,
      },
    });

    res.json({
      items: rows.map((row) => ({
        id: row.id,
        status: row.status,
        progress: row.progress,
        // Синтез отдаёт аудио выходом типа video — исторический компромисс блока речи.
        url: row.resultVideo ?? row.resultImage ?? null,
        text: row.inputText ?? null,
        errorCode: row.errorCode,
        createdAt: row.createdAt,
      })),
    });
  } catch (err) {
    next(err);
  }
});

videoProjectsRouter.post('/:id/voiceover/generate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const videoProject = await ownedProject(userId, req.params.id);
    const body = voiceoverSchema.parse(req.body ?? {});
    const tokensCost = applyModelPriceOverride(
      body.model,
      voiceoverPriceCoins(body.model),
      await readModelPriceOverrides(),
    );

    const pipelineSnapshot = [
      {
        id: 'step_1',
        blockSlug: 'text-to-speech',
        params: {
          model: body.model,
          text: body.text,
          ...(body.voice ? { voice: body.voice } : {}),
          ...(body.emotion ? { emotion: body.emotion } : {}),
          ...(body.speed ? { speed: body.speed } : {}),
          ...(body.stability !== undefined ? { stability: body.stability } : {}),
          ...(body.similarity !== undefined ? { similarity_boost: body.similarity } : {}),
          ...(body.style !== undefined ? { style: body.style } : {}),
          // У голосов из каталога язык определяется самим голосом и текстом, поэтому
          // навязывать его не нужно — а вот двум старым моделям он задан жёстко.
          ...(body.model.startsWith('lumean')
            ? {}
            : { language: body.model === 'minimax-speech' ? 'Russian' : 'English' }),
        },
      },
    ];

    let project;
    try {
      project = await prisma.$transaction(async (tx) => {
        const user = await tx.user.update({
          where: { id: userId, tokenBalance: { gte: tokensCost } },
          data: { tokenBalance: { decrement: tokensCost } },
          select: { tokenBalance: true },
        });
        const created = await tx.project.create({
          data: {
            userId,
            mode: 'editor-voiceover',
            title: `Озвучка: ${videoProject.title}`,
            status: 'PENDING',
            progress: 0,
            inputImages: [],
            inputText: body.text,
            tokensCost,
            pipelineSnapshot: pipelineSnapshot as never,
            selectedTier: 'standard',
            // Ролик называем здесь: дорожку в него впишет воркер, даже если вкладку закроют.
            userInputs: { editorVoiceover: { videoProjectId: videoProject.id } } as never,
            stepProgress: [] as never,
            expiresAt: generationExpiresAt(),
          },
          select: { id: true, tokensCost: true },
        });
        await tx.tokenTransaction.create({
          data: {
            reason: 'editor_voiceover',
            amount: -tokensCost,
            balanceAfter: user.tokenBalance,
            refId: created.id,
            userId,
          },
        });
        return created;
      });
    } catch (err) {
      if ((err as { code?: string }).code === 'P2025') {
        throw new HttpError(402, 'INSUFFICIENT_TOKENS', 'Недостаточно коинов');
      }
      throw err;
    }

    try {
      await queues.addServicePipelineJob({ projectId: project.id, userId, mode: 'production' });
    } catch (queueError) {
      logger.error(`[video-projects] failed to enqueue voiceover ${project.id}`, queueError);
      await prisma.$transaction(async (tx) => {
        await tx.project.update({
          where: { id: project.id },
          data: { status: 'FAILED', errorCode: 'QUEUE_UNAVAILABLE', errorMessage: 'Не удалось поставить озвучку в очередь' },
        });
        const user = await tx.user.update({
          where: { id: userId },
          data: { tokenBalance: { increment: tokensCost } },
          select: { tokenBalance: true },
        });
        await tx.tokenTransaction.create({
          data: {
            reason: 'refund',
            amount: tokensCost,
            balanceAfter: user.tokenBalance,
            refId: project.id,
            userId,
          },
        });
      });
      throw new HttpError(503, 'QUEUE_UNAVAILABLE', 'Сервис озвучки временно недоступен');
    }

    res.status(202).json({ projectId: project.id, tokensCost: project.tokensCost });
  } catch (err) {
    next(err);
  }
});
