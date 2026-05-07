import type { Job } from 'bullmq';
import { EpisodeStatus, prisma } from '@allvision/database';
import type { EpisodeJobData } from '@allvision/shared';
import * as providers from '../providers';
import { logger } from '../utils/logger';
import { markEpisodeCompleted, markEpisodeFailed, updateEpisodeProgress } from './base';

type EpisodeWithRelations = NonNullable<Awaited<ReturnType<typeof loadEpisode>>>;

const MAX_ITERATIONS = 60;
const POLL_INTERVAL_MS = 1500;

export async function processEpisode(job: Job<EpisodeJobData>) {
  const { episodeId, userId } = job.data;
  const aiProvider = providers.getLegacyAIProvider();
  let movedToProcessing = false;

  try {
    const episode = await loadEpisode(episodeId);
    if (!episode) {
      logger.error(`[episode] Episode ${episodeId} not found`);
      return;
    }
    if (episode.userId !== userId) {
      logger.error(`[episode] Episode ${episodeId} belongs to another user`);
      return;
    }
    if (episode.status !== EpisodeStatus.PENDING) {
      logger.warn(`[episode] Episode ${episodeId} already in status ${episode.status}, skipping`);
      return;
    }
    if (!episode.template) {
      await markEpisodeFailed(episodeId, 'Scenario template not found', { refundTokens: true });
      return;
    }
    if (episode.characters.length === 0) {
      await markEpisodeFailed(episodeId, 'No characters selected', { refundTokens: true });
      return;
    }

    await updateEpisodeProgress(episodeId, 5, EpisodeStatus.PROCESSING_IMAGE);
    movedToProcessing = true;

    const prompt = buildPrompt(episode);
    const characterReferences = episode.characters
      .map(({ character }) => character.referenceImages[character.primaryImageId] ?? character.referenceImages[0])
      .filter(Boolean);
    const sceneReference = episode.scene?.description ?? episode.scene?.referenceImages[0];

    const imageHandle = await aiProvider.generateEpisodeImage({
      prompt,
      characterReferences,
      sceneReference,
      style: episode.style ?? episode.template.defaultStyle,
      aspectRatio: episode.aspectRatio,
    });
    await prisma.episode.update({
      where: { id: episodeId },
      data: {
        aiProviderJobId: imageHandle.providerJobId,
        aiProviderLogs: { prompt, stage: 'image' },
      },
    });

    const imageUrl = await waitForResult({
      episodeId,
      handle: imageHandle,
      expectedType: 'image',
      minProgress: 5,
      maxProgress: 50,
    });
    if (!imageUrl) return;

    await prisma.episode.update({
      where: { id: episodeId },
      data: {
        status: EpisodeStatus.PROCESSING_VIDEO,
        progress: 50,
        aiProviderLogs: { prompt, stage: 'video', intermediateImageUrl: imageUrl },
      },
    });

    const videoHandle = await aiProvider.animateEpisodeVideo({
      imageUrl,
      durationSeconds: episode.durationSeconds,
      style: episode.style ?? episode.template.defaultStyle,
    });
    await prisma.episode.update({
      where: { id: episodeId },
      data: { aiProviderJobId: videoHandle.providerJobId },
    });

    const videoUrl = await waitForResult({
      episodeId,
      handle: videoHandle,
      expectedType: 'video',
      minProgress: 50,
      maxProgress: 99,
    });
    if (!videoUrl) return;

    await markEpisodeCompleted(episodeId, {
      resultImage: imageUrl,
      resultVideo: videoUrl,
      resultThumbnail: imageUrl,
    });

    await Promise.all(
      episode.characters.map(({ characterId }) =>
        prisma.character.update({
          where: { id: characterId },
          data: { episodesCount: { increment: 1 }, lastUsedAt: new Date() },
        }).catch((err) => logger.warn(`[episode] Failed to increment character ${characterId}`, err)),
      ),
    );
  } catch (err) {
    logger.error(`[episode] Unexpected error in episode ${episodeId}`, err);
    if (movedToProcessing) {
      try {
        await markEpisodeFailed(
          episodeId,
          err instanceof Error ? err.message : 'Unknown episode worker error',
          { refundTokens: true },
        );
      } catch (failErr) {
        logger.error('[episode] Failed to mark episode failed', failErr);
      }
      return;
    }
    throw err;
  }
}

async function loadEpisode(episodeId: string) {
  return prisma.episode.findUnique({
    where: { id: episodeId },
    include: {
      template: true,
      scene: true,
      characters: {
        include: { character: true },
        orderBy: { role: 'asc' },
      },
    },
  });
}

function buildPrompt(episode: EpisodeWithRelations): string {
  const base = episode.customScenario || episode.template?.promptTemplate || '';
  const mainIndex = episode.characters.findIndex((item) => item.role === 'main');
  const main = episode.characters[mainIndex >= 0 ? mainIndex : 0]?.character;
  const secondary =
    episode.characters.find((item) => item.role === 'secondary')?.character ??
    episode.characters.find((_, index) => index !== (mainIndex >= 0 ? mainIndex : 0))?.character;

  const characterMain = describeCharacter(main);
  const characterSecondary = describeCharacter(secondary);
  const scene = episode.scene
    ? `${episode.scene.name}: ${episode.scene.description}`
    : 'без отдельной сцены';

  return base
    .split('{{character_main}}').join(characterMain)
    .split('{{character_secondary}}').join(characterSecondary)
    .split('{{scene}}').join(scene);
}

function describeCharacter(character: EpisodeWithRelations['characters'][number]['character'] | undefined) {
  if (!character) return '';
  const details = [character.name, character.description, character.ageGroup].filter(Boolean);
  return details.join(', ');
}

async function waitForResult(params: {
  episodeId: string;
  handle: { providerJobId: string };
  expectedType: 'image' | 'video';
  minProgress: number;
  maxProgress: number;
}) {
  const aiProvider = providers.getLegacyAIProvider();

  for (let index = 0; index < MAX_ITERATIONS; index += 1) {
    const status = await aiProvider.getJobStatus(params.handle);

    if (status.status === 'processing') {
      const mapped = params.minProgress + Math.round((status.progress / 100) * (params.maxProgress - params.minProgress));
      await updateEpisodeProgress(params.episodeId, Math.min(params.maxProgress, mapped));
      await sleep(POLL_INTERVAL_MS);
      continue;
    }

    if (status.status === 'failed') {
      await markEpisodeFailed(
        params.episodeId,
        status.errorMessage ?? 'AI provider returned failed',
        { refundTokens: true },
      );
      return null;
    }

    if (status.status === 'completed') {
      if (!status.resultUrl) {
        await markEpisodeFailed(params.episodeId, 'AI provider completed without result URL', { refundTokens: true });
        return null;
      }
      if (status.resultType !== params.expectedType) {
        await markEpisodeFailed(
          params.episodeId,
          `AI provider returned ${status.resultType ?? 'unknown'} result instead of ${params.expectedType}`,
          { refundTokens: true },
        );
        return null;
      }
      return status.resultUrl;
    }
  }

  await markEpisodeFailed(params.episodeId, 'AI processing timeout', { refundTokens: true });
  return null;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
