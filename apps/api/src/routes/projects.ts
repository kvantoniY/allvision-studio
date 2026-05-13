import { Router, type NextFunction, type Request, type Response } from 'express';
import { Prisma, prisma } from '@allvision/database';
import { createProjectSchema, listProjectsQuerySchema, QUEUE_NAMES } from '@allvision/shared';
import { requireAuth } from '../middleware/auth';
import { projectCreateLimiter } from '../middleware/rate-limit';
import { uploadSinglePhoto } from '../middleware/upload';
import { deleteFile, uploadUserImage, validateAndProcessImage } from '../services/file-service';
import { HttpError } from '../utils/http-error';
import { logger } from '../utils/logger';
import * as queues from '../queues';

export const projectsRouter = Router();

type AutoServiceSlug = 'photo-restore' | 'photo-animate' | 'trends';

const supportedAutoServices = new Set<string>(['photo-restore', 'photo-animate', 'trends']);
const serviceQueueName: Record<AutoServiceSlug, typeof QUEUE_NAMES.PHOTO_RESTORE | typeof QUEUE_NAMES.PHOTO_ANIMATE | typeof QUEUE_NAMES.TREND> = {
  'photo-restore': QUEUE_NAMES.PHOTO_RESTORE,
  'photo-animate': QUEUE_NAMES.PHOTO_ANIMATE,
  trends: QUEUE_NAMES.TREND,
};

const projectCreateSelect = {
  id: true,
  status: true,
  progress: true,
  tokensCost: true,
  createdAt: true,
  serviceId: true,
  title: true,
} as const;

const projectListSelect = {
  id: true,
  userId: true,
  serviceId: true,
  trendId: true,
  mode: true,
  title: true,
  status: true,
  progress: true,
  inputImages: true,
  inputText: true,
  resultImage: true,
  resultVideo: true,
  resultThumbnail: true,
  tokensCost: true,
  errorMessage: true,
  errorCode: true,
  pipelineSnapshot: true,
  selectedTier: true,
  userInputs: true,
  stepProgress: true,
  createdAt: true,
  completedAt: true,
} as const;

function formatProjectDate(): string {
  const when = new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .format(new Date())
    .replace(',', '');
  return when;
}

function projectTitle(serviceSlug: AutoServiceSlug, trendTitle?: string): string {
  const when = formatProjectDate();
  if (serviceSlug === 'photo-animate') return `Анимация фото — ${when}`;
  if (serviceSlug === 'trends') return `Тренд: ${trendTitle ?? 'Видео'} — ${when}`;
  return `Улучшение фото — ${when}`;
}

function parseCreateProjectBody(body: unknown) {
  const parsed = createProjectSchema.safeParse(body);
  if (!parsed.success) {
    const isTrendRequired = parsed.error.errors.some((issue) => issue.message === 'TREND_REQUIRED');
    if (isTrendRequired) {
      throw new HttpError(400, 'TREND_REQUIRED', 'Trend is required');
    }
    throw parsed.error;
  }
  return parsed.data;
}

function isPrismaNotFound(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025';
}

async function deleteUploadedFile(key: string) {
  try {
    await deleteFile(key);
  } catch (err) {
    logger.error(`Failed to delete uploaded file ${key}`, err);
  }
}

projectsRouter.post(
  '/',
  requireAuth,
  projectCreateLimiter,
  uploadSinglePhoto,
  async (req: Request, res: Response, next: NextFunction) => {
    let uploadedKey: string | undefined;

    try {
      if (!req.file) {
        throw new HttpError(400, 'FILE_REQUIRED', 'Image file is required');
      }

      const { serviceSlug, trendId } = parseCreateProjectBody(req.body);
      if (!supportedAutoServices.has(serviceSlug)) {
        throw new HttpError(404, 'SERVICE_NOT_FOUND', 'Service not found');
      }
      const autoServiceSlug = serviceSlug as AutoServiceSlug;

      const service = await prisma.service.findUnique({ where: { slug: serviceSlug } });
      if (!service || !service.isActive) {
        throw new HttpError(404, 'SERVICE_NOT_FOUND', 'Service not found');
      }

      const trend = autoServiceSlug === 'trends'
        ? await prisma.trend.findUnique({ where: { id: trendId! } })
        : null;
      if (autoServiceSlug === 'trends') {
        if (!trend || !trend.isActive) {
          throw new HttpError(404, 'TREND_NOT_FOUND', 'Trend not found');
        }
        if (trend.serviceId !== service.id) {
          throw new HttpError(400, 'TREND_SERVICE_MISMATCH', 'Trend belongs to another service');
        }
      }

      const { buffer, contentType } = await validateAndProcessImage(req.file.buffer);
      const userId = req.user!.id;
      const tokensCost = trend?.priceTokens ?? service.priceTokens;
      const uploaded = await uploadUserImage(userId, buffer, contentType);
      uploadedKey = uploaded.key;

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
              status: 'PENDING',
              progress: 0,
              inputImages: [uploaded.url],
              tokensCost,
              serviceId: service.id,
              userId,
              trendId: trend?.id,
              title: projectTitle(autoServiceSlug, trend?.title),
            },
            select: projectCreateSelect,
          });

          await tx.tokenTransaction.create({
            data: {
              reason: 'spending',
              amount: -tokensCost,
              balanceAfter: user.tokenBalance,
              refId: created.id,
              userId,
            },
          });

          return created;
        });
      } catch (err) {
        await deleteUploadedFile(uploaded.key);
        uploadedKey = undefined;
        if (isPrismaNotFound(err)) {
          throw new HttpError(402, 'INSUFFICIENT_TOKENS', 'Insufficient tokens');
        }
        throw err;
      }

      try {
        await queues.addProjectJob(serviceQueueName[autoServiceSlug], {
          projectId: project.id,
          userId,
          serviceId: service.id,
          trendId: trend?.id,
          inputImages: [uploaded.url],
          aiConfig: {},
        });
      } catch (err) {
        logger.error(`Failed to enqueue ${autoServiceSlug} project ${project.id}`, err);

        try {
          await prisma.project.update({
            where: { id: project.id },
            data: { status: 'FAILED', errorMessage: 'Queue unavailable', errorCode: 'QUEUE_UNAVAILABLE' },
          });
          await prisma.$transaction(async (tx) => {
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
        } catch (refundErr) {
          logger.error(`Failed to refund project ${project.id} after queue error`, refundErr);
        } finally {
          await deleteUploadedFile(uploaded.key);
          uploadedKey = undefined;
        }

        throw new HttpError(503, 'QUEUE_UNAVAILABLE', 'Queue unavailable');
      }

      uploadedKey = undefined;
      res.status(201).json({ project });
    } catch (err) {
      if (uploadedKey) {
        await deleteUploadedFile(uploadedKey);
      }
      next(err);
    }
  },
);

projectsRouter.get('/', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = listProjectsQuerySchema.parse(req.query);
    const where: Prisma.ProjectWhereInput = {
      userId: req.user!.id,
      ...(query.status ? { status: query.status } : {}),
      ...(query.serviceSlug ? { service: { slug: query.serviceSlug } } : {}),
    };

    const [items, total] = await prisma.$transaction([
      prisma.project.findMany({
        where,
        select: projectListSelect,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      prisma.project.count({ where }),
    ]);

    res.json({ items, total, page: query.page, limit: query.limit });
  } catch (err) {
    next(err);
  }
});

projectsRouter.get('/:id/status', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const project = await prisma.project.findFirst({
      where: { id: req.params.id, userId: req.user!.id },
      select: {
        id: true,
        status: true,
        progress: true,
        resultImage: true,
        resultVideo: true,
        resultThumbnail: true,
        errorMessage: true,
        errorCode: true,
        completedAt: true,
        stepProgress: true,
      },
    });

    if (!project) {
      throw new HttpError(404, 'PROJECT_NOT_FOUND', 'Project not found');
    }

    res.json(project);
  } catch (err) {
    next(err);
  }
});

projectsRouter.get('/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const project = await prisma.project.findFirst({
      where: { id: req.params.id, userId: req.user!.id },
      select: {
        ...projectListSelect,
        service: {
          select: {
            slug: true,
            title: true,
            category: true,
          },
        },
      },
    });

    if (!project) {
      throw new HttpError(404, 'PROJECT_NOT_FOUND', 'Project not found');
    }

    res.json(project);
  } catch (err) {
    next(err);
  }
});
