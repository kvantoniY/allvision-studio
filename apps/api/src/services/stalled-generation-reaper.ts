import { prisma } from '@allvision/database';
import { QUEUE_NAMES } from '@allvision/shared';
import { getQueue } from '../queues';
import { logger } from '../utils/logger';
import { publishProjectEvent } from '../utils/project-events';

/**
 * Сборщик зависших генераций.
 *
 * Задачу может оборвать перезапуск воркера или выкат релиза. Очередь отдаёт её повторно, и
 * обычно этого хватает, но если попытки исчерпаны — а такое бывает при нескольких выкатах
 * подряд, — проект навсегда остаётся в PROCESSING: коины списаны, страница крутит прогресс,
 * файла нет и не будет.
 *
 * Поэтому раз в несколько минут ищем проекты, которые висят дольше срока и которых НЕТ ни в
 * одной очереди. Отсутствие задачи — единственный надёжный признак: пока задача жива, её
 * трогать нельзя, даже если генерация идёт долго (Kling на пятнадцати секундах может считать
 * минуты).
 */

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;
/** Сколько проект может висеть, прежде чем считать его брошенным. */
const DEFAULT_STALE_AFTER_MS = 30 * 60 * 1000;

/** Режимы, которые обслуживает наш пайплайн: именно их задачи живут в этих очередях. */
const PIPELINE_MODES = ['service', 'free-chat', 'library-generation', 'editor-generation', 'editor-voiceover', 'video-export'];

let timer: ReturnType<typeof setInterval> | undefined;
let firstRunTimer: ReturnType<typeof setTimeout> | undefined;
let running = false;

function positiveIntEnv(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

/** Идентификаторы проектов, у которых прямо сейчас есть задача в очередях. */
async function projectIdsWithLiveJobs(): Promise<Set<string>> {
  const live = new Set<string>();
  for (const name of [QUEUE_NAMES.SERVICE_PIPELINE, QUEUE_NAMES.VIDEO_RENDER]) {
    try {
      const queue = getQueue(name);
      const jobs = await queue.getJobs(['active', 'waiting', 'delayed', 'paused'], 0, 500);
      for (const job of jobs) {
        const projectId = (job.data as { projectId?: string } | undefined)?.projectId;
        if (projectId) live.add(projectId);
      }
    } catch (error) {
      // Очередь недоступна — считаем, что живых задач не знаем, и НИЧЕГО не закрываем:
      // ошибочный отказ по недоступному Redis хуже, чем лишние полчаса ожидания.
      logger.warn(`[stalled-reaper] очередь ${name} недоступна: ${(error as Error).message}`);
      throw error;
    }
  }
  return live;
}

export async function reapStalledGenerations(staleAfterMs = positiveIntEnv('STALLED_GENERATION_AFTER_MS', DEFAULT_STALE_AFTER_MS)) {
  const threshold = new Date(Date.now() - staleAfterMs);
  const candidates = await prisma.project.findMany({
    where: {
      status: { in: ['PENDING', 'PROCESSING'] },
      mode: { in: PIPELINE_MODES },
      createdAt: { lt: threshold },
    },
    select: { id: true, userId: true, tokensCost: true, title: true },
    take: 50,
  });
  if (candidates.length === 0) return { scanned: 0, reaped: 0 };

  const live = await projectIdsWithLiveJobs();
  let reaped = 0;

  for (const project of candidates) {
    if (live.has(project.id)) continue;
    try {
      // Статус проверяем внутри транзакции: за время обхода воркер мог довести проект.
      const closed = await prisma.$transaction(async (tx) => {
        const fresh = await tx.project.findUnique({ where: { id: project.id }, select: { status: true } });
        if (!fresh || (fresh.status !== 'PENDING' && fresh.status !== 'PROCESSING')) return false;

        await tx.project.update({
          where: { id: project.id },
          data: {
            status: 'FAILED',
            errorCode: 'GENERATION_ABANDONED',
            errorMessage: 'Задача пропала из очереди — скорее всего, воркер перезапускали',
            completedAt: new Date(),
          },
        });
        if (project.tokensCost > 0) {
          const user = await tx.user.update({
            where: { id: project.userId },
            data: { tokenBalance: { increment: project.tokensCost } },
            select: { tokenBalance: true },
          });
          await tx.tokenTransaction.create({
            data: {
              reason: 'refund',
              amount: project.tokensCost,
              balanceAfter: user.tokenBalance,
              refId: project.id,
              userId: project.userId,
            },
          });
        }
        return true;
      });

      if (!closed) continue;
      reaped += 1;
      logger.warn(`[stalled-reaper] проект ${project.id} закрыт как брошенный, возвращено ${project.tokensCost} коинов`);
      publishProjectEvent({ projectId: project.id, userId: project.userId, status: 'FAILED', progress: 0, kind: 'status' });
    } catch (error) {
      logger.warn(`[stalled-reaper] не удалось закрыть проект ${project.id}: ${(error as Error).message}`);
    }
  }

  return { scanned: candidates.length, reaped };
}

export function startStalledGenerationReaper() {
  if (timer) return;
  const intervalMs = positiveIntEnv('STALLED_GENERATION_INTERVAL_MS', DEFAULT_INTERVAL_MS);

  const run = async () => {
    if (running) return;
    running = true;
    try {
      const result = await reapStalledGenerations();
      if (result.reaped > 0) {
        logger.info(`[stalled-reaper] scanned=${result.scanned} reaped=${result.reaped}`);
      }
    } catch (error) {
      logger.warn(`[stalled-reaper] обход не удался: ${(error as Error).message}`);
    } finally {
      running = false;
    }
  };

  firstRunTimer = setTimeout(run, 30_000);
  firstRunTimer.unref();
  timer = setInterval(run, intervalMs);
  timer.unref();
  logger.info(`[stalled-reaper] enabled intervalMs=${intervalMs}`);
}

export function stopStalledGenerationReaper() {
  if (firstRunTimer) {
    clearTimeout(firstRunTimer);
    firstRunTimer = undefined;
  }
  if (!timer) return;
  clearInterval(timer);
  timer = undefined;
}
