import { Router, type NextFunction, type Request, type Response } from 'express';
import IORedis from 'ioredis';
import { Prisma, prisma } from '@allvision/database';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';
import { requireAdmin } from '../../middleware/require-admin';
import { PiAPIAccountClient } from '../../services/piapi-client';
import { HttpError } from '../../utils/http-error';

export const adminUsageRouter = Router();

adminUsageRouter.use(requireAuth, requireAdmin);

const usageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  provider: z.string().trim().min(1).optional(),
  blockSlug: z.string().trim().min(1).optional(),
  model: z.string().trim().min(1).optional(),
  status: z.string().trim().min(1).optional(),
  userId: z.string().trim().min(1).optional(),
  projectId: z.string().trim().min(1).optional(),
});

type AccountCache = {
  balanceUsd: number;
  lastChecked: string;
  lowBalance: boolean;
  raw: unknown;
};

let memoryAccountCache: AccountCache | undefined;
let redisClient: IORedis | undefined;

function defaultDateFrom() {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - 7);
  return date;
}

function usageWhere(query: z.infer<typeof usageQuerySchema>): Prisma.AIUsageLogWhereInput {
  return {
    createdAt: {
      gte: query.dateFrom ? new Date(query.dateFrom) : defaultDateFrom(),
      lte: query.dateTo ? new Date(query.dateTo) : new Date(),
    },
    ...(query.provider ? { provider: query.provider } : {}),
    ...(query.blockSlug ? { blockSlug: query.blockSlug } : {}),
    ...(query.model ? { model: query.model } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.userId ? { userId: query.userId } : {}),
    ...(query.projectId ? { projectId: query.projectId } : {}),
  };
}

adminUsageRouter.get('/usage', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = usageQuerySchema.parse(req.query);
    const where = usageWhere(query);
    const [logs, total, aggregate, allRows, timeoutPending] = await prisma.$transaction([
      prisma.aIUsageLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: {
          project: {
            select: {
              id: true,
              title: true,
              status: true,
              progress: true,
              inputImages: true,
              inputText: true,
              selectedTier: true,
              userInputs: true,
              resultImage: true,
              resultVideo: true,
              resultThumbnail: true,
              resultAssets: true,
              errorCode: true,
              errorMessage: true,
              service: { select: { id: true, slug: true, title: true } },
            },
          },
        },
      }),
      prisma.aIUsageLog.count({ where }),
      prisma.aIUsageLog.aggregate({
        where,
        _sum: { costUsd: true, durationMs: true },
        _avg: { durationMs: true },
      }),
      prisma.aIUsageLog.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        take: 10000,
        select: {
          createdAt: true,
          blockSlug: true,
          model: true,
          status: true,
          costUsd: true,
          durationMs: true,
        },
      }),
      prisma.aIUsageLog.findMany({
        where: { ...where, status: 'timeout_pending' },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true,
          createdAt: true,
          projectId: true,
          blockSlug: true,
          model: true,
          taskId: true,
          errorCode: true,
          errorMessage: true,
        },
      }),
    ]);

    const successCount = allRows.filter((row) => row.status === 'success').length;
    const failedCount = allRows.filter((row) => row.status === 'failed').length;
    const timeoutCount = allRows.filter((row) => row.status === 'timeout' || row.status.startsWith('timeout_')).length;
    const statusCounts = groupByStatus(allRows);

    res.json({
      logs,
      total,
      page: query.page,
      limit: query.limit,
      summary: {
        totalRequests: total,
        successCount,
        failedCount,
        timeoutCount,
        totalCostUsd: aggregate._sum.costUsd ?? 0,
        avgDurationMs: Math.round(aggregate._avg.durationMs ?? 0),
        statusCounts,
      },
      byDay: groupByDay(allRows),
      byModel: groupByModel(allRows),
      byBlock: groupByBlock(allRows),
      timeoutPending,
    });
  } catch (err) {
    next(err);
  }
});

const overviewQuerySchema = z.object({
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
});

adminUsageRouter.get('/overview', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = overviewQuerySchema.parse(req.query);
    const to = query.dateTo ? new Date(query.dateTo) : new Date();
    const from = query.dateFrom ? new Date(query.dateFrom) : (() => {
      const date = new Date(to);
      date.setUTCDate(date.getUTCDate() - 30);
      return date;
    })();
    const range = { gte: from, lte: to };

    const [
      totalUsers,
      newUsers,
      paymentsAgg,
      providerAgg,
      revenueAgg,
      totalGenerations,
      completedGenerations,
      failedGenerations,
      projectsForServices,
    ] = await prisma.$transaction([
      prisma.user.count({ where: { role: 'USER', deletedAt: null } }),
      prisma.user.count({ where: { role: 'USER', createdAt: range } }),
      prisma.payment.aggregate({
        where: { status: 'SUCCEEDED', purpose: 'TOPUP', paidAt: range },
        _sum: { amountRub: true, tokensAdded: true },
        _count: true,
      }),
      prisma.aIUsageLog.aggregate({ where: { provider: 'piapi', createdAt: range }, _sum: { costUsd: true }, _count: true }),
      prisma.project.aggregate({ where: { status: 'COMPLETED', createdAt: range }, _sum: { tokensCost: true } }),
      prisma.project.count({ where: { createdAt: range } }),
      prisma.project.count({ where: { status: 'COMPLETED', createdAt: range } }),
      prisma.project.count({ where: { status: 'FAILED', createdAt: range } }),
      prisma.project.findMany({
        where: { createdAt: range, serviceId: { not: null } },
        select: { serviceId: true, status: true, tokensCost: true },
        take: 50000,
      }),
    ]);

    const serviceMap = new Map<string, { serviceId: string; runs: number; completed: number; revenueCoins: number }>();
    for (const project of projectsForServices) {
      if (!project.serviceId) continue;
      const current = serviceMap.get(project.serviceId) ?? { serviceId: project.serviceId, runs: 0, completed: 0, revenueCoins: 0 };
      current.runs += 1;
      if (project.status === 'COMPLETED') {
        current.completed += 1;
        current.revenueCoins += project.tokensCost;
      }
      serviceMap.set(project.serviceId, current);
    }
    const serviceIds = [...serviceMap.keys()];
    const services = serviceIds.length
      ? await prisma.service.findMany({ where: { id: { in: serviceIds } }, select: { id: true, title: true, slug: true, category: true } })
      : [];
    const serviceTitle = new Map(services.map((service) => [service.id, service]));
    const topServices = [...serviceMap.values()]
      .map((row) => ({
        serviceId: row.serviceId,
        title: serviceTitle.get(row.serviceId)?.title ?? 'Без услуги',
        slug: serviceTitle.get(row.serviceId)?.slug ?? '',
        category: serviceTitle.get(row.serviceId)?.category ?? '',
        runs: row.runs,
        completed: row.completed,
        revenueCoins: row.revenueCoins,
      }))
      .sort((a, b) => b.runs - a.runs);

    const usdToRub = Number(
      (await prisma.setting.findUnique({ where: { key: 'USD_TO_RUB' } }))?.value ?? process.env.PRICING_USD_TO_RUB ?? '80',
    ) || 80;

    const revenueCoins = revenueAgg._sum.tokensCost ?? 0;
    const providerCostUsd = providerAgg._sum.costUsd ?? 0;
    const providerCostRub = providerCostUsd * usdToRub;
    const netProfitRub = revenueCoins - providerCostRub;

    res.json({
      range: { from: from.toISOString(), to: to.toISOString() },
      usdToRub,
      users: {
        total: totalUsers,
        new: newUsers,
      },
      payments: {
        count: paymentsAgg._count,
        amountRub: (paymentsAgg._sum.amountRub ?? 0) / 100,
        coinsAdded: paymentsAgg._sum.tokensAdded ?? 0,
      },
      generations: {
        total: totalGenerations,
        completed: completedGenerations,
        failed: failedGenerations,
      },
      finance: {
        revenueCoins,
        providerCostUsd,
        providerCostRub,
        providerRequests: providerAgg._count,
        netProfitRub,
      },
      topServices,
    });
  } catch (err) {
    next(err);
  }
});

adminUsageRouter.get('/piapi/account', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const force = req.query.refresh === 'true';
    const cached = force ? undefined : await readCachedAccount();
    if (cached) {
      res.json(cached);
      return;
    }

    const apiKey = process.env.PIAPI_API_KEY;
    if (!apiKey) throw new HttpError(503, 'PIAPI_API_KEY_MISSING', 'PIAPI_API_KEY не настроен');
    const client = new PiAPIAccountClient({
      apiKey,
      baseUrl: process.env.PIAPI_BASE_URL ?? 'https://api.piapi.ai',
    });
    const account = await client.getAccountInfo();
    const balanceMin = Number(process.env.PIAPI_BALANCE_MIN_USD ?? '2');
    const payload: AccountCache = {
      balanceUsd: account.equivalentUsd,
      lastChecked: new Date().toISOString(),
      lowBalance: account.equivalentUsd < balanceMin,
      raw: account.raw,
    };
    await writeCachedAccount(payload);
    res.json(payload);
  } catch (err) {
    next(err);
  }
});

function groupByDay(rows: Array<{ createdAt: Date; costUsd: number }>) {
  const map = new Map<string, { date: string; totalCostUsd: number; requestCount: number }>();
  for (const row of rows) {
    const date = row.createdAt.toISOString().slice(0, 10);
    const current = map.get(date) ?? { date, totalCostUsd: 0, requestCount: 0 };
    current.totalCostUsd += row.costUsd;
    current.requestCount += 1;
    map.set(date, current);
  }
  return Array.from(map.values());
}

function groupByStatus(rows: Array<{ status: string }>) {
  const defaults: Record<string, number> = {
    success: 0,
    failed: 0,
    timeout: 0,
    timeout_charged: 0,
    timeout_pending: 0,
  };
  for (const row of rows) {
    defaults[row.status] = (defaults[row.status] ?? 0) + 1;
  }
  return defaults;
}

function groupByModel(rows: Array<{ model: string; costUsd: number; durationMs: number }>) {
  const map = new Map<string, { model: string; requestCount: number; totalCostUsd: number; totalDurationMs: number }>();
  for (const row of rows) {
    const current = map.get(row.model) ?? { model: row.model, requestCount: 0, totalCostUsd: 0, totalDurationMs: 0 };
    current.requestCount += 1;
    current.totalCostUsd += row.costUsd;
    current.totalDurationMs += row.durationMs;
    map.set(row.model, current);
  }
  return Array.from(map.values()).map((row) => ({
    model: row.model,
    requestCount: row.requestCount,
    totalCostUsd: row.totalCostUsd,
    avgDurationMs: Math.round(row.totalDurationMs / row.requestCount),
  }));
}

function groupByBlock(rows: Array<{ blockSlug: string; status: string; costUsd: number }>) {
  const map = new Map<string, { blockSlug: string; requestCount: number; totalCostUsd: number; successCount: number }>();
  for (const row of rows) {
    const current = map.get(row.blockSlug) ?? { blockSlug: row.blockSlug, requestCount: 0, totalCostUsd: 0, successCount: 0 };
    current.requestCount += 1;
    current.totalCostUsd += row.costUsd;
    if (row.status === 'success') current.successCount += 1;
    map.set(row.blockSlug, current);
  }
  return Array.from(map.values()).map((row) => ({
    blockSlug: row.blockSlug,
    requestCount: row.requestCount,
    totalCostUsd: row.totalCostUsd,
    successRate: row.requestCount ? row.successCount / row.requestCount : 0,
  }));
}

async function readCachedAccount(): Promise<AccountCache | undefined> {
  if (memoryAccountCache && Date.now() - Date.parse(memoryAccountCache.lastChecked) < 60_000) return memoryAccountCache;
  const redis = await getRedis().catch(() => undefined);
  if (!redis) return undefined;
  const raw = await redis.get('admin:piapi:account').catch(() => undefined);
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as AccountCache;
  } catch {
    return undefined;
  }
}

async function writeCachedAccount(payload: AccountCache) {
  memoryAccountCache = payload;
  const redis = await getRedis().catch(() => undefined);
  if (!redis) return;
  await redis.set('admin:piapi:account', JSON.stringify(payload), 'EX', 60).catch(() => undefined);
}

async function getRedis() {
  if (process.env.NODE_ENV === 'test' || process.env.DISABLE_REDIS_CACHE === 'true') {
    throw new Error('Redis account cache disabled');
  }
  if (redisClient) return redisClient;
  redisClient = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });
  await redisClient.connect();
  return redisClient;
}
