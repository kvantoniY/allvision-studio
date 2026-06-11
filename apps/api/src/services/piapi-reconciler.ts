import { ProjectStatus, prisma } from '@allvision/database';
import { logger } from '../utils/logger';
import { failPiAPIProjectIfSyncLost, tryRecoverPiAPIProject } from './piapi-recovery-service';

// Background server-side reconciler: drives in-flight PiAPI projects to a terminal state
// (COMPLETED or FAILED+refund) by polling PiAPI directly, independent of whether the user's
// browser is open. This closes the "PiAPI Success but the site is stuck at 95%" gap that
// happened when the worker lost the provider connection (PIAPI_SYNC_PENDING) and nothing else
// re-checked the result. It reuses the same recovery logic the status endpoint already calls.
//
// Concurrency safety with the worker's live poll is guaranteed by the recovery/markFailed
// guards (skip when COMPLETED, dedupe refunds), so reconciling a project the worker is still
// polling is at worst a no-op getTask call.

let timer: NodeJS.Timeout | undefined;
let firstRunTimer: NodeJS.Timeout | undefined;
let running = false;

const DEFAULT_INTERVAL_MS = 45_000;
const DEFAULT_LOOKBACK_MS = 6 * 60 * 60 * 1000;
const DEFAULT_BATCH = 25;
// Сколько ждать появления потерянной sync-задачи (gpt-image) в PiAPI history,
// прежде чем зафейлить проект с refund. Сама генерация занимает 1-2 минуты.
const DEFAULT_SYNC_PENDING_FAIL_AFTER_MS = 10 * 60 * 1000;

function positiveIntEnv(name: string, fallback: number) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function isEnabled() {
  if (process.env.NODE_ENV === 'test') return false;
  const explicit = process.env.PIAPI_RECONCILER_ENABLED?.trim().toLowerCase();
  if (explicit && ['0', 'false', 'no', 'off'].includes(explicit)) return false;
  return Boolean(process.env.PIAPI_API_KEY);
}

export async function reconcileInFlightPiAPIProjects(now = new Date()): Promise<{ scanned: number; resolved: number }> {
  const lookbackMs = positiveIntEnv('PIAPI_RECONCILE_LOOKBACK_MS', DEFAULT_LOOKBACK_MS);
  const since = new Date(now.getTime() - lookbackMs);

  // Candidates we can actually resolve from PiAPI:
  //  - errorCode = PIAPI_SYNC_PENDING: worker explicitly gave up after a connection loss
  //    (gpt-image sync drop). Recovery uses taskId or gpt-image history matching.
  //  - aiProviderJobId set: a unified task exists, so getTask can deliver/fail it.
  const projects = await prisma.project.findMany({
    where: {
      status: { in: [ProjectStatus.PENDING, ProjectStatus.PROCESSING] },
      mode: { not: 'library-generation' },
      createdAt: { gte: since },
      OR: [
        { errorCode: 'PIAPI_SYNC_PENDING' },
        { aiProviderJobId: { not: null } },
      ],
    },
    select: { id: true, userId: true },
    orderBy: { createdAt: 'asc' },
    take: positiveIntEnv('PIAPI_RECONCILE_BATCH', DEFAULT_BATCH),
  });

  const syncFailAfterMs = positiveIntEnv('PIAPI_SYNC_PENDING_FAIL_AFTER_MS', DEFAULT_SYNC_PENDING_FAIL_AFTER_MS);
  let resolved = 0;
  for (const project of projects) {
    const ok = await tryRecoverPiAPIProject(project.id, project.userId);
    if (ok) {
      resolved += 1;
      continue;
    }
    // Recovery не нашёл задачу: для потерянных синхронных gpt-image вызовов
    // по истечении дедлайна фейлим проект с refund, а не ждём watchdog.
    const failed = await failPiAPIProjectIfSyncLost(project.id, syncFailAfterMs).catch((error) => {
      logger.warn(`[piapi-reconciler] sync-lost check failed for project=${project.id}: ${(error as Error).message}`);
      return false;
    });
    if (failed) {
      resolved += 1;
      logger.warn(`[piapi-reconciler] project=${project.id} failed after sync-pending deadline (refund issued)`);
    }
  }
  return { scanned: projects.length, resolved };
}

export function stopPiAPIReconciler() {
  if (firstRunTimer) {
    clearTimeout(firstRunTimer);
    firstRunTimer = undefined;
  }
  if (!timer) return;
  clearInterval(timer);
  timer = undefined;
}

export function startPiAPIReconciler() {
  if (timer || !isEnabled()) return;

  const intervalMs = positiveIntEnv('PIAPI_RECONCILE_INTERVAL_MS', DEFAULT_INTERVAL_MS);

  const run = async () => {
    if (running) return;
    running = true;
    try {
      const result = await reconcileInFlightPiAPIProjects();
      if (result.scanned > 0) {
        logger.info(`[piapi-reconciler] scanned=${result.scanned} resolved=${result.resolved}`);
      }
    } catch (error) {
      logger.warn(`[piapi-reconciler] reconcile failed: ${(error as Error).message}`);
    } finally {
      running = false;
    }
  };

  firstRunTimer = setTimeout(run, 5000);
  firstRunTimer.unref();
  timer = setInterval(run, intervalMs);
  timer.unref();
  logger.info(`[piapi-reconciler] enabled intervalMs=${intervalMs}`);
}
