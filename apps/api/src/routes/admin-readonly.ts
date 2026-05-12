import fs from 'node:fs/promises';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { prisma } from '@allvision/database';
import { BLOCK_CATALOG, serviceMargin, summarizePipelinePricing } from '@allvision/shared';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { PiAPIAccountClient } from '../services/piapi-client';
import { HttpError } from '../utils/http-error';

export const adminReadonlyRouter = Router();

adminReadonlyRouter.use(requireAuth, requireReadonlyAdmin);

function requireReadonlyAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.user || (req.user.role !== 'READONLY_ADMIN' && req.user.role !== 'ADMIN')) {
    return next(new HttpError(403, 'FORBIDDEN_READONLY_ADMIN', 'Readonly admin role required'));
  }
  if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS') {
    return next(new HttpError(403, 'READONLY_ENDPOINT', 'admin-readonly endpoints are read-only'));
  }
  return next();
}

adminReadonlyRouter.get('/diagnostics', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const [piapiBalance, recentUsageLogs, recentProjects, usage24h, usage7d, activeServices] = await Promise.all([
      readPiapiBalance(),
      prisma.aIUsageLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true,
          createdAt: true,
          projectId: true,
          userId: true,
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
      }),
      prisma.project.findMany({
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true,
          createdAt: true,
          completedAt: true,
          status: true,
          progress: true,
          title: true,
          errorCode: true,
          errorMessage: true,
          service: { select: { slug: true, title: true } },
        },
      }),
      usageSummary(last24h),
      usageSummary(last7d),
      prisma.service.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
        select: { slug: true, isActive: true, isFeatured: true },
      }),
    ]);

    res.json({
      piapiBalance,
      providerMode: process.env.PROVIDER_MODE ?? process.env.AI_PROVIDER ?? 'mock',
      version: process.env.APP_VERSION ?? process.env.npm_package_version ?? '0.1.0',
      uptime: process.uptime(),
      recentUsageLogs,
      recentProjects,
      usageSummary: { last24h: usage24h, last7d: usage7d },
      activeServices,
    });
  } catch (err) {
    next(err);
  }
});

adminReadonlyRouter.get('/services', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const services = await prisma.service.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        slug: true,
        title: true,
        category: true,
        isActive: true,
        isFeatured: true,
        priceCoinsStandard: true,
        priceCoinsPro: true,
        priceTokens: true,
        pipelineConfig: true,
        userInputForm: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    res.json({
      services: services.map((service) => {
        const pricing = summarizePipelinePricing(service.pipelineConfig);
        return {
          id: service.id,
          slug: service.slug,
          title: service.title,
          category: service.category,
          isActive: service.isActive,
          isFeatured: service.isFeatured,
          priceCoinsStandard: service.priceCoinsStandard,
          priceCoinsPro: service.priceCoinsPro,
          priceTokens: service.priceTokens,
          pipelineSnapshot: redactDataUrls(service.pipelineConfig),
          userInputForm: service.userInputForm,
          pricing,
          margin: {
            standard: serviceMargin(service.priceCoinsStandard ?? service.priceTokens, pricing.standard.costUsd),
            pro: serviceMargin(service.priceCoinsPro ?? service.priceTokens, pricing.pro.costUsd),
          },
          createdAt: service.createdAt,
          updatedAt: service.updatedAt,
        };
      }),
    });
  } catch (err) {
    next(err);
  }
});

adminReadonlyRouter.get('/media-assets', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = z.object({
      kind: z.string().trim().min(1).max(80).optional(),
      limit: z.coerce.number().int().min(1).max(200).default(100),
    }).parse(req.query);
    const items = await prisma.mediaAsset.findMany({
      where: query.kind ? { kind: query.kind } : {},
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      take: query.limit,
      select: {
        id: true,
        kind: true,
        title: true,
        description: true,
        tags: true,
        publicUrl: true,
        thumbnailKey: true,
        durationSec: true,
        width: true,
        height: true,
        frameCount: true,
        fileSize: true,
        mimeType: true,
        isActive: true,
        sortOrder: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    res.json({ items });
  } catch (err) {
    next(err);
  }
});

adminReadonlyRouter.get('/block-catalog', async (_req: Request, res: Response) => {
  res.json({ blocks: BLOCK_CATALOG });
});

adminReadonlyRouter.get('/project/:id/full', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const project = await prisma.project.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        userId: true,
        serviceId: true,
        trendId: true,
        title: true,
        status: true,
        progress: true,
        tokensCost: true,
        errorCode: true,
        errorMessage: true,
        aiProviderJobId: true,
        aiProviderLogs: true,
        pipelineSnapshot: true,
        selectedTier: true,
        userInputs: true,
        stepProgress: true,
        createdAt: true,
        completedAt: true,
        service: { select: { slug: true, title: true, processingType: true } },
        trend: { select: { id: true, title: true } },
        aiUsageLogs: {
          orderBy: { createdAt: 'desc' },
          take: 100,
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
    if (!project) throw new HttpError(404, 'PROJECT_NOT_FOUND', 'Project not found');
    res.json({
      project: {
        ...project,
        userInputs: redactDataUrls(project.userInputs),
        pipelineSnapshot: redactDataUrls(project.pipelineSnapshot),
        aiProviderLogs: redactDataUrls(project.aiProviderLogs),
        stepProgress: redactDataUrls(project.stepProgress),
      },
    });
  } catch (err) {
    next(err);
  }
});

adminReadonlyRouter.get('/piapi/task/:taskId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const apiKey = process.env.PIAPI_API_KEY;
    if (!apiKey) throw new HttpError(503, 'PIAPI_API_KEY_MISSING', 'PIAPI_API_KEY is not configured');
    const client = new PiAPIAccountClient({
      apiKey,
      baseUrl: process.env.PIAPI_BASE_URL ?? 'https://api.piapi.ai',
    });
    res.json(await client.getTask(req.params.taskId));
  } catch (err) {
    next(err);
  }
});

adminReadonlyRouter.get('/logs/worker', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = z.object({ lines: z.coerce.number().int().min(1).max(1000).default(200) }).parse(req.query);
    const logPath = process.env.WORKER_STDOUT_LOG_PATH;
    if (!logPath) {
      throw new HttpError(501, 'WORKER_LOGS_TODO', 'TODO: configure WORKER_STDOUT_LOG_PATH or docker logs access');
    }
    const content = await fs.readFile(logPath, 'utf8');
    res.json({ lines: content.split(/\r?\n/).slice(-query.lines) });
  } catch (err) {
    next(err);
  }
});

async function readPiapiBalance() {
  const apiKey = process.env.PIAPI_API_KEY;
  if (!apiKey) {
    return { equivalentUsd: null, lastCheckedAt: null, errorCode: 'PIAPI_API_KEY_MISSING' };
  }
  const client = new PiAPIAccountClient({
    apiKey,
    baseUrl: process.env.PIAPI_BASE_URL ?? 'https://api.piapi.ai',
  });
  try {
    const account = await client.getAccountInfo();
    return { equivalentUsd: account.equivalentUsd, lastCheckedAt: new Date().toISOString() };
  } catch (err) {
    return {
      equivalentUsd: null,
      lastCheckedAt: null,
      errorCode: err instanceof HttpError ? err.code : 'PIAPI_BALANCE_UNAVAILABLE',
    };
  }
}

async function usageSummary(since: Date) {
  const aggregate = await prisma.aIUsageLog.aggregate({
    where: { createdAt: { gte: since } },
    _count: { _all: true },
    _sum: { costUsd: true, durationMs: true },
  });
  return {
    requestCount: aggregate._count._all,
    totalCostUsd: aggregate._sum.costUsd ?? 0,
    totalDurationMs: aggregate._sum.durationMs ?? 0,
  };
}

function redactDataUrls(value: unknown): unknown {
  if (typeof value === 'string') {
    if (value.startsWith('data:')) return '[redacted:data-url]';
    if (value.length > 4000) return '[redacted:long-string]';
    return value;
  }
  if (Array.isArray(value)) return value.map(redactDataUrls);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, redactDataUrls(item)]),
  );
}
