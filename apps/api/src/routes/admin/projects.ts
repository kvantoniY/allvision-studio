import { Router, type NextFunction, type Request, type Response } from 'express';
import { Prisma, prisma } from '@allvision/database';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';
import { requireAdmin } from '../../middleware/require-admin';
import { HttpError } from '../../utils/http-error';

export const adminProjectsRouter = Router();

adminProjectsRouter.use(requireAuth, requireAdmin);

const projectsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  status: z.enum(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED']).optional(),
  serviceId: z.string().trim().min(1).optional(),
  serviceSlug: z.string().trim().min(1).optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  user: z.string().trim().min(1).optional(),
});

adminProjectsRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = projectsQuerySchema.parse(req.query);
    const where = projectWhere(query);
    const [projects, total, services] = await prisma.$transaction([
      prisma.project.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: projectListSelect,
      }),
      prisma.project.count({ where }),
      prisma.service.findMany({ orderBy: { title: 'asc' }, select: { id: true, slug: true, title: true } }),
    ]);

    res.json({
      items: projects.map(serializeProjectListItem),
      total,
      page: query.page,
      limit: query.limit,
      services,
    });
  } catch (err) {
    next(err);
  }
});

adminProjectsRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const project = await prisma.project.findUnique({
      where: { id: req.params.id },
      select: {
        ...projectListSelect,
        inputImages: true,
        inputText: true,
        resultImage: true,
        resultVideo: true,
        resultThumbnail: true,
        aiProviderJobId: true,
        aiProviderLogs: true,
        pipelineSnapshot: true,
        userInputs: true,
        stepProgress: true,
        trend: { select: { id: true, title: true } },
        aiUsageLogs: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            createdAt: true,
            blockSlug: true,
            provider: true,
            model: true,
            taskId: true,
            status: true,
            costUsd: true,
            durationMs: true,
            errorCode: true,
            errorMessage: true,
            recoverableOutputUrl: true,
          },
        },
      },
    });
    if (!project) throw new HttpError(404, 'PROJECT_NOT_FOUND', 'Проект не найден');
    res.json({ project: serializeProjectListItem(project) });
  } catch (err) {
    next(err);
  }
});

function projectWhere(query: z.infer<typeof projectsQuerySchema>): Prisma.ProjectWhereInput {
  return {
    ...(query.status ? { status: query.status } : {}),
    ...(query.serviceId ? { serviceId: query.serviceId } : {}),
    ...(query.serviceSlug ? { service: { slug: query.serviceSlug } } : {}),
    ...(query.dateFrom || query.dateTo ? {
      createdAt: {
        ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
        ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
      },
    } : {}),
    ...(query.user ? {
      OR: [
        { userId: query.user },
        { user: { email: { contains: query.user, mode: 'insensitive' } } },
      ],
    } : {}),
  };
}

const projectListSelect = {
  id: true,
  title: true,
  status: true,
  progress: true,
  tokensCost: true,
  errorCode: true,
  errorMessage: true,
  selectedTier: true,
  createdAt: true,
  completedAt: true,
  user: { select: { id: true, email: true } },
  service: { select: { id: true, slug: true, title: true, priceCoinsStandard: true, priceCoinsPro: true, priceTokens: true } },
  aiUsageLogs: { select: { costUsd: true } },
} satisfies Prisma.ProjectSelect;

function serializeProjectListItem<T extends { aiUsageLogs?: Array<{ costUsd: number }>; selectedTier?: string | null; tokensCost: number; service?: { priceCoinsStandard: number | null; priceCoinsPro: number | null; priceTokens: number } | null }>(project: T) {
  const costUsd = (project.aiUsageLogs ?? []).reduce((sum, log) => sum + log.costUsd, 0);
  const servicePrice = project.selectedTier === 'pro'
    ? project.service?.priceCoinsPro
    : project.service?.priceCoinsStandard;
  return {
    ...project,
    costUsd,
    userPriceCoins: servicePrice ?? project.tokensCost ?? project.service?.priceTokens ?? 0,
  };
}
