import { Router, type Request, type Response } from 'express';
import IORedis from 'ioredis';
import { prisma } from '@allvision/database';
import { resolveRuntimeProviderMode } from '@allvision/shared';

export const healthRouter = Router();

healthRouter.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    version: process.env.GIT_SHA ?? process.env.npm_package_version ?? '0.1.0',
    uptime: process.uptime(),
    providerMode: resolveRuntimeProviderMode(process.env.PROVIDER_MODE, process.env.NODE_ENV),
  });
});

export async function readinessHandler(_req: Request, res: Response) {
  const checks: Record<string, 'ok' | 'error'> = {
    database: 'ok',
    redis: 'ok',
  };

  await prisma.$queryRaw`SELECT 1`.catch(() => {
    checks.database = 'error';
  });

  const redis = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    connectTimeout: 500,
    commandTimeout: 500,
  });
  await redis
    .ping()
    .catch(() => {
      checks.redis = 'error';
    })
    .finally(() => {
      redis.disconnect();
    });

  const ready = Object.values(checks).every((status) => status === 'ok');
  res.status(ready ? 200 : 503).json({
    status: ready ? 'ok' : 'unavailable',
    checks,
  });
}

healthRouter.get('/ready', readinessHandler);
