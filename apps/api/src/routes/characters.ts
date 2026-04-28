import { Router, type NextFunction, type Request, type Response } from 'express';
import { Prisma, prisma, type EpisodeStatus } from '@allvision/database';
import {
  CHARACTER_SLOT_PRICE_TOKENS,
  createCharacterSchema,
  listCharactersQuerySchema,
  replaceCharacterReferenceImagesSchema,
  updateCharacterSchema,
} from '@allvision/shared';
import { requireAuth } from '../middleware/auth';
import { uploadCharacterReferences } from '../middleware/upload';
import * as fileService from '../services/file-service';
import { HttpError } from '../utils/http-error';
import { logger } from '../utils/logger';
import * as queues from '../queues';

export const charactersRouter = Router();

const activeEpisodeStatuses: EpisodeStatus[] = ['PENDING', 'PROCESSING_IMAGE', 'PROCESSING_VIDEO'];

function uploadedFiles(req: Request): Express.Multer.File[] {
  return Array.isArray(req.files) ? req.files : [];
}

function storageKeyFromUrl(value: string): string | null {
  if (value.startsWith('character-references/')) return value;
  const marker = '/static/';
  const index = value.indexOf(marker);
  if (index === -1) return null;
  return decodeURIComponent(value.slice(index + marker.length));
}

async function deleteStorageKey(key: string | null) {
  if (!key) return;
  try {
    await fileService.deleteFile(key);
  } catch (err) {
    logger.warn(`Failed to delete character asset ${key}`, err);
  }
}

async function cleanupUploaded(files: Array<{ key: string }>) {
  await Promise.all(files.map((file) => deleteStorageKey(file.key)));
}

function isPrismaNotFound(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025';
}

async function markCharacterQueueUnavailable(
  characterId: string,
  options: { refundIfPaid: boolean; resetFreeSlot: boolean },
) {
  await prisma.$transaction(async (tx) => {
    const character = await tx.character.findUnique({
      where: { id: characterId },
      select: { id: true, userId: true, isPaid: true },
    });
    if (!character) return;

    await tx.character.update({
      where: { id: characterId },
      data: {
        status: 'REJECTED',
        nsfwChecked: false,
      },
    });

    if (!character.isPaid) {
      if (options.resetFreeSlot) {
        await tx.user.update({
          where: { id: character.userId },
          data: { freeCharacterUsed: false },
        });
      }
      return;
    }

    if (!options.refundIfPaid) return;

    const existingRefund = await tx.tokenTransaction.findFirst({
      where: {
        userId: character.userId,
        refId: characterId,
        reason: 'refund',
        amount: CHARACTER_SLOT_PRICE_TOKENS,
      },
      select: { id: true },
    });
    if (existingRefund) return;

    const user = await tx.user.update({
      where: { id: character.userId },
      data: { tokenBalance: { increment: CHARACTER_SLOT_PRICE_TOKENS } },
      select: { tokenBalance: true },
    });

    await tx.tokenTransaction.create({
      data: {
        userId: character.userId,
        amount: CHARACTER_SLOT_PRICE_TOKENS,
        reason: 'refund',
        refId: characterId,
        balanceAfter: user.tokenBalance,
      },
    });
  });
}

async function enqueueCharacterNsfw(character: { id: string; userId: string }) {
  await queues.addCharacterJob({
    characterId: character.id,
    userId: character.userId,
  });
}

charactersRouter.use(requireAuth);

charactersRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = listCharactersQuerySchema.parse(req.query);
    const where: Prisma.CharacterWhereInput = {
      userId: req.user!.id,
      ...(query.status ? { status: query.status } : {}),
      ...(query.type ? { type: query.type } : {}),
    };

    const items = await prisma.character.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    res.json({ items });
  } catch (err) {
    next(err);
  }
});

charactersRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const character = await prisma.character.findFirst({
      where: { id: req.params.id, userId: req.user!.id },
    });
    if (!character) throw new HttpError(404, 'CHARACTER_NOT_FOUND', 'Character not found');
    res.json({ character });
  } catch (err) {
    next(err);
  }
});

charactersRouter.post('/', uploadCharacterReferences, async (req: Request, res: Response, next: NextFunction) => {
  const uploaded: Array<{ url: string; key: string }> = [];
  let keepUploaded = false;

  try {
    const files = uploadedFiles(req);
    if (files.length === 0) {
      throw new HttpError(400, 'FILE_REQUIRED', 'At least one reference image is required');
    }

    const body = createCharacterSchema.parse(req.body);
    if (!body.consentGiven) {
      throw new HttpError(400, 'CONSENT_REQUIRED', 'Consent is required');
    }

    for (const file of files) {
      const result = await fileService.uploadCharacterReference(req.user!.id, file.buffer, file.mimetype);
      uploaded.push(result);
    }

    const userId = req.user!.id;
    const referenceImages = uploaded.map((file) => file.url);
    const character = await prisma.$transaction(async (tx) => {
      const freeSlot = await tx.user.updateMany({
        where: { id: userId, freeCharacterUsed: false },
        data: { freeCharacterUsed: true },
      });

      if (freeSlot.count === 1) {
        return tx.character.create({
          data: {
            userId,
            name: body.name,
            type: body.type,
            gender: body.gender,
            ageGroup: body.ageGroup,
            description: body.description,
            referenceImages,
            primaryImageId: 0,
            consentGiven: true,
            consentAt: new Date(),
            nsfwChecked: false,
            status: 'PROCESSING',
            isPaid: false,
          },
        });
      }

      const user = await tx.user.update({
        where: { id: userId, tokenBalance: { gte: CHARACTER_SLOT_PRICE_TOKENS } },
        data: { tokenBalance: { decrement: CHARACTER_SLOT_PRICE_TOKENS } },
        select: { tokenBalance: true },
      });

      const created = await tx.character.create({
        data: {
          userId,
          name: body.name,
          type: body.type,
          gender: body.gender,
          ageGroup: body.ageGroup,
          description: body.description,
          referenceImages,
          primaryImageId: 0,
          consentGiven: true,
          consentAt: new Date(),
          nsfwChecked: false,
          status: 'PROCESSING',
          isPaid: true,
        },
      });

      await tx.tokenTransaction.create({
        data: {
          reason: 'character_slot',
          amount: -CHARACTER_SLOT_PRICE_TOKENS,
          balanceAfter: user.tokenBalance,
          refId: created.id,
          userId,
        },
      });

      return created;
    });
    keepUploaded = true;

    try {
      await enqueueCharacterNsfw(character);
    } catch (err) {
      logger.error(`Failed to enqueue NSFW check for character ${character.id}`, err);
      await markCharacterQueueUnavailable(character.id, {
        refundIfPaid: true,
        resetFreeSlot: true,
      }).catch((refundErr) => {
        logger.error(`Failed to rollback character ${character.id} after queue error`, refundErr);
      });
      throw new HttpError(503, 'QUEUE_UNAVAILABLE', 'Queue unavailable');
    }

    res.status(201).json({ character });
  } catch (err) {
    if (isPrismaNotFound(err)) {
      if (!keepUploaded) await cleanupUploaded(uploaded);
      next(new HttpError(402, 'INSUFFICIENT_TOKENS', 'Insufficient tokens'));
      return;
    }
    if (!keepUploaded && uploaded.length > 0) {
      await cleanupUploaded(uploaded);
    }
    next(err);
  }
});

charactersRouter.patch('/:id/reference-images', uploadCharacterReferences, async (req: Request, res: Response, next: NextFunction) => {
  const uploaded: Array<{ url: string; key: string }> = [];
  let keepUploaded = false;
  let oldReferenceImages: string[] = [];

  try {
    const files = uploadedFiles(req);
    if (files.length === 0) {
      throw new HttpError(400, 'FILE_REQUIRED', 'At least one reference image is required');
    }

    const body = replaceCharacterReferenceImagesSchema.parse(req.body);
    const primaryImageId = body.primaryImageId ?? 0;
    if (primaryImageId >= files.length) {
      throw new HttpError(400, 'INVALID_PRIMARY_IMAGE_ID', 'primaryImageId is out of range');
    }

    const existing = await prisma.character.findFirst({
      where: { id: req.params.id, userId: req.user!.id },
      select: { id: true, status: true },
    });
    if (!existing) throw new HttpError(404, 'CHARACTER_NOT_FOUND', 'Character not found');
    if (existing.status === 'PROCESSING') {
      throw new HttpError(409, 'CHARACTER_BUSY', 'Character NSFW check is already running');
    }

    for (const file of files) {
      const result = await fileService.uploadCharacterReference(req.user!.id, file.buffer, file.mimetype);
      uploaded.push(result);
    }

    const referenceImages = uploaded.map((file) => file.url);
    const updated = await prisma.$transaction(async (tx) => {
      const current = await tx.character.findFirst({
        where: { id: req.params.id, userId: req.user!.id },
        select: { id: true, status: true, referenceImages: true },
      });
      if (!current) throw new HttpError(404, 'CHARACTER_NOT_FOUND', 'Character not found');
      if (current.status === 'PROCESSING') {
        throw new HttpError(409, 'CHARACTER_BUSY', 'Character NSFW check is already running');
      }

      oldReferenceImages = current.referenceImages;
      return tx.character.update({
        where: { id: current.id },
        data: {
          referenceImages,
          primaryImageId,
          nsfwChecked: false,
          status: 'PROCESSING',
        },
      });
    });
    keepUploaded = true;

    await Promise.all(oldReferenceImages.map((url) => deleteStorageKey(storageKeyFromUrl(url))));

    try {
      await enqueueCharacterNsfw(updated);
    } catch (err) {
      logger.error(`Failed to enqueue replacement NSFW check for character ${updated.id}`, err);
      await markCharacterQueueUnavailable(updated.id, {
        refundIfPaid: false,
        resetFreeSlot: false,
      }).catch((queueErr) => {
        logger.error(`Failed to mark character ${updated.id} rejected after replacement queue error`, queueErr);
      });
      throw new HttpError(503, 'QUEUE_UNAVAILABLE', 'Queue unavailable');
    }

    res.json({ character: updated });
  } catch (err) {
    if (!keepUploaded && uploaded.length > 0) {
      await cleanupUploaded(uploaded);
    }
    next(err);
  }
});

charactersRouter.post('/:id/nsfw-check', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const character = await prisma.character.findFirst({
      where: { id: req.params.id, userId: req.user!.id },
    });
    if (!character) throw new HttpError(404, 'CHARACTER_NOT_FOUND', 'Character not found');
    if (character.status === 'PROCESSING') {
      throw new HttpError(409, 'CHARACTER_BUSY', 'Character NSFW check is already running');
    }
    if (character.referenceImages.length === 0) {
      throw new HttpError(400, 'FILE_REQUIRED', 'At least one reference image is required');
    }

    const updated = await prisma.character.update({
      where: { id: character.id },
      data: {
        status: 'PROCESSING',
        nsfwChecked: false,
      },
    });

    try {
      await enqueueCharacterNsfw(updated);
    } catch (err) {
      logger.error(`Failed to enqueue manual NSFW check for character ${updated.id}`, err);
      await markCharacterQueueUnavailable(updated.id, {
        refundIfPaid: false,
        resetFreeSlot: false,
      }).catch((queueErr) => {
        logger.error(`Failed to mark character ${updated.id} rejected after manual queue error`, queueErr);
      });
      throw new HttpError(503, 'QUEUE_UNAVAILABLE', 'Queue unavailable');
    }

    res.json({ character: updated });
  } catch (err) {
    next(err);
  }
});

charactersRouter.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const character = await prisma.character.findFirst({
      where: { id: req.params.id, userId: req.user!.id },
    });
    if (!character) throw new HttpError(404, 'CHARACTER_NOT_FOUND', 'Character not found');

    const body = updateCharacterSchema.parse(req.body);
    if (
      body.primaryImageId !== undefined &&
      (body.primaryImageId < 0 || body.primaryImageId >= character.referenceImages.length)
    ) {
      throw new HttpError(400, 'INVALID_PRIMARY_IMAGE_ID', 'primaryImageId is out of range');
    }

    const data: Prisma.CharacterUpdateInput = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.description !== undefined) data.description = body.description;
    if (body.gender !== undefined) data.gender = body.gender;
    if (body.ageGroup !== undefined) data.ageGroup = body.ageGroup;
    if (body.primaryImageId !== undefined) data.primaryImageId = body.primaryImageId;
    if (body.isActive !== undefined) data.isActive = body.isActive;

    const updated = await prisma.character.update({
      where: { id: character.id },
      data,
    });

    res.json({ character: updated });
  } catch (err) {
    next(err);
  }
});

charactersRouter.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const character = await prisma.character.findFirst({
      where: { id: req.params.id, userId: req.user!.id },
    });
    if (!character) throw new HttpError(404, 'CHARACTER_NOT_FOUND', 'Character not found');

    const activeEpisodeLinks = await prisma.episodeCharacter.count({
      where: {
        characterId: character.id,
        episode: { status: { in: activeEpisodeStatuses } },
      },
    });
    if (activeEpisodeLinks > 0) {
      throw new HttpError(409, 'CHARACTER_IN_USE', 'Character is used by an active episode');
    }

    await prisma.$transaction([
      prisma.episodeCharacter.deleteMany({ where: { characterId: character.id } }),
      prisma.character.delete({ where: { id: character.id } }),
    ]);

    await Promise.all(character.referenceImages.map((url) => deleteStorageKey(storageKeyFromUrl(url))));
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
