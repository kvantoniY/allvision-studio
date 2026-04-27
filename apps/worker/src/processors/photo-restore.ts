import type { Job } from 'bullmq';
import { prisma } from '@allvision/database';
import type { ProjectJobData } from '@allvision/shared';
import { getAIProvider } from '../providers';
import { logger } from '../utils/logger';
import { markProjectCompleted, markProjectFailed, updateProjectProgress } from './base';

export async function processPhotoRestore(job: Job<ProjectJobData>) {
  const { projectId, userId } = job.data;
  const imageUrl = job.data.inputImages?.[0];
  const aiProvider = getAIProvider();

  let movedToProcessing = false;

  try {
    if (!imageUrl) {
      await markProjectFailed(projectId, 'No input image provided', { refundTokens: true });
      return;
    }

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      logger.error(`[photo-restore] Project ${projectId} not found`);
      return;
    }
    if (project.userId !== userId) {
      logger.error(`[photo-restore] Project ${projectId} belongs to another user`);
      return;
    }
    if (project.status !== 'PENDING') {
      logger.warn(`[photo-restore] Project ${projectId} already in status ${project.status}, skipping`);
      return;
    }

    await prisma.project.update({
      where: { id: projectId },
      data: { status: 'PROCESSING', progress: 0 },
    });
    movedToProcessing = true;

    const handle = await aiProvider.restorePhoto({ imageUrl, config: {} });
    await prisma.project.update({
      where: { id: projectId },
      data: { aiProviderJobId: handle.providerJobId },
    });

    const MAX_ITERATIONS = 60;
    const POLL_INTERVAL_MS = 1500;

    for (let i = 0; i < MAX_ITERATIONS; i += 1) {
      const status = await aiProvider.getJobStatus(handle);

      if (status.status === 'processing') {
        await updateProjectProgress(projectId, status.progress);
        await sleep(POLL_INTERVAL_MS);
        continue;
      }

      if (status.status === 'failed') {
        await markProjectFailed(
          projectId,
          status.errorMessage ?? 'AI provider returned failed',
          { refundTokens: true },
        );
        return;
      }

      if (status.status === 'completed') {
        const isImage = status.resultType === 'image';
        const isVideo = status.resultType === 'video';
        if (!status.resultUrl) {
          await markProjectFailed(projectId, 'AI provider completed without result URL', { refundTokens: true });
          return;
        }
        if (!isImage && !isVideo) {
          await markProjectFailed(projectId, 'AI provider returned unknown result type', { refundTokens: true });
          return;
        }
        if (isVideo) {
          logger.warn(`[photo-restore] Project ${projectId}: expected image, got video — accepting anyway`);
        }
        await markProjectCompleted(projectId, {
          resultImage: isImage ? status.resultUrl : undefined,
          resultVideo: isVideo ? status.resultUrl : undefined,
          resultThumbnail: undefined,
        });
        return;
      }
    }

    await markProjectFailed(projectId, 'AI processing timeout', { refundTokens: true });
  } catch (err) {
    logger.error(`[photo-restore] Unexpected error in project ${projectId}`, err);
    if (movedToProcessing) {
      try {
        await markProjectFailed(
          projectId,
          err instanceof Error ? err.message : 'Unknown error',
          { refundTokens: true },
        );
      } catch (failErr) {
        logger.error('[photo-restore] Failed to mark project failed', failErr);
      }
      return;
    }
    throw err;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
