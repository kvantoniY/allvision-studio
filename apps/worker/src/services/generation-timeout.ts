import { ProjectStatus, prisma } from '@allvision/database';
import { getUserFriendlyError } from '@allvision/shared';
import { markProjectFailed } from '../processors/base';
import { logger } from '../utils/logger';

const DEFAULT_GENERATION_TIMEOUT_MS = 30 * 60 * 1000;
const DEFAULT_WATCHDOG_INTERVAL_MS = 60 * 1000;
const DEFAULT_BATCH_SIZE = 50;

export async function failTimedOutGenerations(now = new Date()): Promise<number> {
  const timeoutMs = numberFromEnv('GENERATION_PROCESSING_TIMEOUT_MS', DEFAULT_GENERATION_TIMEOUT_MS);
  const cutoff = new Date(now.getTime() - timeoutMs);
  const projects = await prisma.project.findMany({
    where: {
      status: { in: [ProjectStatus.PENDING, ProjectStatus.PROCESSING] },
      createdAt: { lte: cutoff },
    },
    select: {
      id: true,
      status: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
    take: numberFromEnv('GENERATION_TIMEOUT_BATCH_SIZE', DEFAULT_BATCH_SIZE),
  });

  for (const project of projects) {
    await markProjectFailed(
      project.id,
      getUserFriendlyError('GENERATION_TIMEOUT'),
      { refundTokens: true, errorCode: 'GENERATION_TIMEOUT' },
    ).catch((error) => {
      logger.warn(`[generation-timeout] failed to mark project=${project.id} as timed out`, error);
    });
  }

  if (projects.length > 0) {
    logger.warn('[generation-timeout] timed out stale generations', {
      count: projects.length,
      cutoff: cutoff.toISOString(),
    });
  }

  return projects.length;
}

export function startGenerationTimeoutWatchdog(): () => void {
  if (process.env.GENERATION_TIMEOUT_WATCHDOG_ENABLED === 'false') return () => undefined;

  const intervalMs = numberFromEnv('GENERATION_TIMEOUT_WATCHDOG_INTERVAL_MS', DEFAULT_WATCHDOG_INTERVAL_MS);
  const run = () => {
    failTimedOutGenerations().catch((error) => {
      logger.error(`Generation timeout watchdog failed: ${(error as Error).message}`, error);
    });
  };

  run();
  const timer = setInterval(run, intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}

function numberFromEnv(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
