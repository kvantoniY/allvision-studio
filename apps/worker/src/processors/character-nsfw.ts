import type { Job } from 'bullmq';
import { prisma } from '@allvision/database';
import type { CharacterNsfwJobData } from '@allvision/shared';
import { getAIProvider } from '../providers';
import { logger } from '../utils/logger';
import { markCharacterReady, markCharacterRejected } from './base';

export async function processCharacterNsfw(job: Job<CharacterNsfwJobData>) {
  const { characterId, userId } = job.data;
  const aiProvider = getAIProvider();

  try {
    const character = await prisma.character.findUnique({ where: { id: characterId } });
    if (!character) {
      logger.error(`[character-nsfw] Character ${characterId} not found`);
      return;
    }
    if (character.userId !== userId) {
      logger.error(`[character-nsfw] Character ${characterId} belongs to another user`);
      return;
    }
    if (character.status !== 'PROCESSING') {
      logger.warn(`[character-nsfw] Character ${characterId} already in status ${character.status}, skipping`);
      return;
    }
    if (character.referenceImages.length === 0) {
      await markCharacterRejected(characterId, 'No reference images', { refundIfPaid: true });
      return;
    }

    const checks = await Promise.all(
      character.referenceImages.map((imageUrl) => aiProvider.checkNSFW(imageUrl)),
    );
    const unsafe = checks.find((check) => !check.safe);

    if (unsafe) {
      await markCharacterRejected(
        characterId,
        unsafe.reason ?? 'NSFW check rejected image',
        { refundIfPaid: true },
      );
      return;
    }

    await markCharacterReady(characterId);
  } catch (err) {
    logger.error(`[character-nsfw] Unexpected error in character ${characterId}`, err);
    try {
      await markCharacterRejected(
        characterId,
        err instanceof Error ? err.message : 'Unknown NSFW worker error',
        { refundIfPaid: true },
      );
    } catch (rejectErr) {
      logger.error(`[character-nsfw] Failed to mark character ${characterId} rejected`, rejectErr);
      throw err;
    }
  }
}
