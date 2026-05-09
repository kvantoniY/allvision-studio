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
    const [logs, total, aggregate, allRows] = await prisma.$transaction([
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
    ]);

    const successCount = allRows.filter((row) => row.status === 'success').length;
    const failedCount = allRows.filter((row) => row.status === 'failed').length;
    const timeoutCount = allRows.filter((row) => row.status === 'timeout').length;

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
      },
      byDay: groupByDay(allRows),
      byModel: groupByModel(allRows),
      byBlock: groupByBlock(allRows),
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
    if (!apiKey) throw new HttpError(503, 'PIAPI_API_KEY_MISSING', 'PIAPI_API_KEY is not configured');
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
