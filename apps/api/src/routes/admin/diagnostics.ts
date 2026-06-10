import fs from 'node:fs/promises';
import path from 'node:path';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { prisma } from '@allvision/database';
import { QUEUE_NAMES } from '@allvision/shared';
import { requireAuth } from '../../middleware/auth';
import { requireAdmin } from '../../middleware/require-admin';
import { getQueue } from '../../queues';
import { getPaymentProvider } from '../../services/payment-provider';
import { PiAPIAccountClient } from '../../services/piapi-client';
import { HttpError } from '../../utils/http-error';
import { resolveWorkspacePath } from '../../utils/paths';

export const adminDiagnosticsRouter = Router();

adminDiagnosticsRouter.use(requireAuth, requireAdmin);

adminDiagnosticsRouter.get('/state', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const [queues, recentProjects, recentErrors, mediaAssets, piapiBalance, disk] = await Promise.all([
      readQueueState(),
      prisma.project.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          title: true,
          status: true,
          progress: true,
          selectedTier: true,
          createdAt: true,
          completedAt: true,
          errorCode: true,
          errorMessage: true,
          service: { select: { id: true, slug: true, title: true } },
        },
      }),
      readRecentErrors(),
      readMediaAssetsWithFileState(),
      readPiapiBalance().catch((err) => ({
        balanceUsd: null,
        lastChecked: null,
        lowBalance: false,
        errorCode: err instanceof HttpError ? err.code : 'PIAPI_BALANCE_UNAVAILABLE',
      })),
      readDiskState(),
    ]);

    res.json({
      build: {
        version: process.env.APP_VERSION ?? process.env.npm_package_version ?? '0.1.0',
        gitSha: process.env.GIT_SHA ?? process.env.COMMIT_SHA ?? null,
        nodeEnv: process.env.NODE_ENV ?? null,
      },
      uptime: {
        apiSeconds: Math.round(process.uptime()),
        workerSeconds: null,
      },
      queues,
      recentProjects,
      recentErrors,
      mediaAssets,
      disk,
      env: maskedEnv(),
      piapiBalance,
    });
  } catch (err) {
    next(err);
  }
});

adminDiagnosticsRouter.post('/refresh-balance', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await readPiapiBalance());
  } catch (err) {
    next(err);
  }
});

adminDiagnosticsRouter.post('/reload-services-catalog', async (_req: Request, res: Response) => {
  res.json({
    ok: true,
    reloadedAt: new Date().toISOString(),
    note: 'BLOCK_CATALOG is static in this process; no mutable cache was found.',
  });
});

adminDiagnosticsRouter.get('/payments-health', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const provider = process.env.PAYMENT_PROVIDER ?? 'mock';
    const merchantLogin = process.env.ROBOKASSA_MERCHANT_LOGIN ?? null;
    const hashAlgorithm = (process.env.ROBOKASSA_HASH_ALGORITHM ?? 'md5').toLowerCase();
    const pollerEnabledExplicit = process.env.PAYMENT_PENDING_POLL_ENABLED?.trim().toLowerCase();
    const pollerEnabled = !(pollerEnabledExplicit && ['0', 'false', 'no', 'off'].includes(pollerEnabledExplicit))
      && provider === 'robokassa';

    const ageCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [pendingTotal, pendingRecent, lastSuccess, oldestPending] = await Promise.all([
      prisma.payment.count({ where: { status: 'PENDING' } }),
      prisma.payment.findMany({
        where: { status: 'PENDING', createdAt: { gte: ageCutoff } },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          createdAt: true,
          amountRub: true,
          provider: true,
          providerPaymentId: true,
          purpose: true,
          user: { select: { id: true, email: true } },
        },
      }),
      prisma.payment.findFirst({
        where: { status: 'SUCCEEDED' },
        orderBy: { paidAt: 'desc' },
        select: { id: true, paidAt: true, providerPaymentId: true },
      }),
      prisma.payment.findFirst({
        where: { status: 'PENDING' },
        orderBy: { createdAt: 'asc' },
        select: { id: true, createdAt: true, providerPaymentId: true },
      }),
    ]);

    res.json({
      provider,
      providerConfigured: provider === 'robokassa' ? Boolean(merchantLogin && process.env.ROBOKASSA_PASSWORD1 && process.env.ROBOKASSA_PASSWORD2) : true,
      merchantLogin,
      hashAlgorithm,
      isTestMode: ['1', 'true', 'yes', 'on'].includes((process.env.ROBOKASSA_TEST_MODE ?? '').toLowerCase()),
      poller: {
        enabled: pollerEnabled,
        intervalMs: Number(process.env.PAYMENT_PENDING_POLL_INTERVAL_MS ?? 10000),
        reviveMaxAgeMs: Number(process.env.PAYMENT_REVIVE_MAX_AGE_MS ?? 60 * 60 * 1000),
      },
      apiUptimeSeconds: Math.round(process.uptime()),
      apiVersion: process.env.GIT_SHA ?? process.env.APP_VERSION ?? null,
      pending: {
        total: pendingTotal,
        recent: pendingRecent,
        oldest: oldestPending,
      },
      lastSuccess,
      publicApiUrl: process.env.PUBLIC_API_URL ?? null,
      expectedResultUrl: `${(process.env.PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/+$/, '')}/api/payments/robokassa/result`,
      expectedSuccessUrl: `${(process.env.PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/+$/, '')}/api/payments/robokassa/success`,
    });
  } catch (err) {
    next(err);
  }
});

adminDiagnosticsRouter.get('/robokassa-probe/:invId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const invId = req.params.invId;
    if (!invId) throw new HttpError(400, 'INVALID_INV_ID', 'invId required');
    const provider = getPaymentProvider();
    const startedAt = Date.now();
    try {
      const status = await provider.getPaymentProviderStatus(invId);
      res.json({
        ok: true,
        invId,
        providerStatus: status,
        elapsedMs: Date.now() - startedAt,
      });
    } catch (error) {
      res.json({
        ok: false,
        invId,
        elapsedMs: Date.now() - startedAt,
        error: (error as Error).message,
        errorCode: error instanceof HttpError ? error.code : 'UNKNOWN',
      });
    }
  } catch (err) {
    next(err);
  }
});

async function readPiapiBalance() {
  const apiKey = process.env.PIAPI_API_KEY;
  if (!apiKey) throw new HttpError(503, 'PIAPI_API_KEY_MISSING', 'PIAPI_API_KEY не настроен');
  const client = new PiAPIAccountClient({
    apiKey,
    baseUrl: process.env.PIAPI_BASE_URL ?? 'https://api.piapi.ai',
  });
  const account = await client.getAccountInfo();
  const balanceMin = Number(process.env.PIAPI_BALANCE_MIN_USD ?? '2');
  return {
    balanceUsd: account.equivalentUsd,
    lastChecked: new Date().toISOString(),
    lowBalance: account.equivalentUsd < balanceMin,
    raw: account.raw,
  };
}

async function readQueueState() {
  const names = Object.values(QUEUE_NAMES);
  return Promise.all(names.map(async (name) => {
    try {
      const queue = getQueue(name);
      const counts = await queue.getJobCounts('waiting', 'active', 'delayed', 'failed', 'completed');
      const failedLastHour = await queue.getJobs(['failed'], 0, 200).then((jobs) => {
        const since = Date.now() - 60 * 60 * 1000;
        return jobs.filter((job) => (job.finishedOn ?? job.timestamp ?? 0) >= since).length;
      });
      return {
        name,
        waiting: counts.waiting ?? 0,
        active: counts.active ?? 0,
        delayed: counts.delayed ?? 0,
        failed: counts.failed ?? 0,
        completed: counts.completed ?? 0,
        failedLastHour,
        available: true,
      };
    } catch (err) {
      return {
        name,
        waiting: 0,
        active: 0,
        delayed: 0,
        failed: 0,
        completed: 0,
        failedLastHour: 0,
        available: false,
        error: (err as Error).message,
      };
    }
  }));
}

async function readRecentErrors() {
  const [projects, usageLogs] = await Promise.all([
    prisma.project.findMany({
      where: { status: 'FAILED' },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        title: true,
        createdAt: true,
        errorCode: true,
        errorMessage: true,
        service: { select: { slug: true, title: true } },
      },
    }),
    prisma.aIUsageLog.findMany({
      where: { status: { not: 'success' } },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        createdAt: true,
        projectId: true,
        blockSlug: true,
        model: true,
        taskId: true,
        status: true,
        errorCode: true,
        errorMessage: true,
        requestPayload: true,
        responsePayload: true,
      },
    }),
  ]);

  return [
    ...projects.map((project) => ({ source: 'project' as const, ...project })),
    ...usageLogs.map((log) => ({ source: 'aiUsageLog' as const, ...log })),
  ]
    .sort((a, b) => Date.parse(String(b.createdAt)) - Date.parse(String(a.createdAt)))
    .slice(0, 10);
}

async function readMediaAssetsWithFileState() {
  const assets = await prisma.mediaAsset.findMany({
    orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'desc' }],
    take: 100,
    select: {
      id: true,
      kind: true,
      title: true,
      storageKey: true,
      publicUrl: true,
      thumbnailKey: true,
      mimeType: true,
      fileSize: true,
      durationSec: true,
      width: true,
      height: true,
      isActive: true,
      sortOrder: true,
      createdAt: true,
    },
  });

  return Promise.all(assets.map(async (asset) => {
    const file = await fileState(asset.storageKey);
    const thumbnail = asset.thumbnailKey ? await fileState(asset.thumbnailKey) : null;
    return { ...asset, file, thumbnail };
  }));
}

async function fileState(storageKey: string) {
  const root = resolveWorkspacePath(process.env.UPLOADS_DIR ?? './uploads');
  const target = path.resolve(root, storageKey.replace(/^\/+/, ''));
  if (!target.startsWith(root + path.sep) && target !== root) {
    return { exists: false, path: target, error: 'INVALID_STORAGE_KEY' };
  }
  try {
    const stat = await fs.stat(target);
    return { exists: stat.isFile(), path: target, size: stat.size };
  } catch (err) {
    return { exists: false, path: target, error: (err as NodeJS.ErrnoException).code ?? 'FS_ERROR' };
  }
}

async function readDiskState() {
  const root = resolveWorkspacePath(process.env.UPLOADS_DIR ?? './uploads');
  try {
    await fs.mkdir(root, { recursive: true });
    const stat = await fs.statfs(root);
    const blockSize = Number(stat.bsize);
    const totalBytes = Number(stat.blocks) * blockSize;
    const freeBytes = Number(stat.bfree) * blockSize;
    const availableBytes = Number(stat.bavail) * blockSize;
    const usedBytes = Math.max(0, totalBytes - availableBytes);
    return {
      path: root,
      totalBytes,
      freeBytes,
      availableBytes,
      usedBytes,
      usedPercent: totalBytes > 0 ? ((totalBytes - availableBytes) / totalBytes) * 100 : null,
      checkedAt: new Date().toISOString(),
    };
  } catch (err) {
    return {
      path: root,
      totalBytes: null,
      freeBytes: null,
      availableBytes: null,
      usedBytes: null,
      usedPercent: null,
      checkedAt: new Date().toISOString(),
      error: (err as Error).message,
    };
  }
}

function maskedEnv() {
  return Object.fromEntries(
    Object.keys(process.env)
      .sort()
      .map((key) => [key, maskEnvValue(key, process.env[key])]),
  );
}

function maskEnvValue(key: string, value: string | undefined) {
  if (value === undefined) return null;
  if (/(SECRET|PASSWORD|TOKEN|PRIVATE|COOKIE|JWT)/i.test(key)) return '***hidden***';
  if (/(API_KEY|ACCESS_KEY|KEY)$/i.test(key)) return value.length <= 6 ? '***hidden***' : `***${value.slice(-6)}`;
  return value;
}
