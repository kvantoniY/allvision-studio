import type { Job } from 'bullmq';
import { prisma } from '@allvision/database';
import type { ServicePipelineJobData } from '@allvision/shared';
import { markProjectFailed } from './base';
import { runPipeline } from '../pipeline-runner';
import { logger } from '../utils/logger';

export async function processServicePipeline(job: Job<ServicePipelineJobData>) {
  const { projectId, userId, mode } = job.data;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      userId: true,
      status: true,
      pipelineSnapshot: true,
      userInputs: true,
      selectedTier: true,
    },
  });

  if (!project) {
    logger.error(`[service-pipeline] Project ${projectId} not found`);
    return;
  }
  if (project.userId !== userId) {
    logger.error(`[service-pipeline] Project ${projectId} belongs to another user`);
    return;
  }
  // Задача, которую очередь отдаёт повторно (worker перезапустили посреди работы —
  // например, выкатили релиз), приходит с attemptsMade > 0. Такой проект уже висит в
  // PROCESSING, и прежняя проверка отбивала повтор: генерация оставалась «в процессе»
  // навсегда, коины были списаны, а страница поллила пустоту. Повтор запускаем заново.
  const isRetryOfStalledJob = job.attemptsMade > 0 && project.status === 'PROCESSING';
  if (project.status !== 'PENDING' && !isRetryOfStalledJob) {
    logger.warn(`[service-pipeline] Project ${projectId} already in status ${project.status}, skipping`);
    return;
  }
  if (isRetryOfStalledJob) {
    logger.warn(`[service-pipeline] Project ${projectId} перезапускаем после обрыва (попытка ${job.attemptsMade + 1})`);
  }
  if (!project.pipelineSnapshot) {
    await markProjectFailed(projectId, 'Missing pipelineSnapshot', { refundTokens: true });
    return;
  }

  await runPipeline({
    generationId: project.id,
    pipelineConfig: project.pipelineSnapshot,
    userInputs:
      project.userInputs && typeof project.userInputs === 'object' && !Array.isArray(project.userInputs)
        ? (project.userInputs as Record<string, unknown>)
        : {},
    selectedTier: project.selectedTier === 'pro' ? 'pro' : 'standard',
    mode: mode === 'test-run' ? 'test-run' : 'production',
  });
}
