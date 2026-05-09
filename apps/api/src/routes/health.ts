import fs from 'node:fs/promises';
import path from 'node:path';
import { Router, type Request, type Response } from 'express';
import IORedis from 'ioredis';
import { prisma } from '@allvision/database';
import { resolveRuntimeProviderMode } from '@allvision/shared';
import { resolveWorkspacePath } from '../utils/paths';

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
    uploads: 'ok',
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

  if ((process.env.STORAGE_PROVIDER ?? 'local') === 'local') {
    await checkUploadsWritable().catch(() => {
      checks.uploads = 'error';
    });
  }

  const ready = Object.values(checks).every((status) => status === 'ok');
  res.status(ready ? 200 : 503).json({
    status: ready ? 'ok' : 'unavailable',
    checks,
  });
}

healthRouter.get('/ready', readinessHandler);

async function checkUploadsWritable() {
  const rootDir = resolveWorkspacePath(process.env.UPLOADS_DIR ?? './uploads');
  const healthDir = path.join(rootDir, '.healthcheck');
  const probe = path.join(healthDir, `ready-${process.pid}-${Date.now()}`);
  await fs.mkdir(healthDir, { recursive: true });
  await fs.writeFile(probe, 'ok');
  await fs.unlink(probe);
}
