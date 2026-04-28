import { Router, type NextFunction, type Request, type Response } from 'express';
import { Prisma, prisma, type EpisodeStatus } from '@allvision/database';
import {
  createCharacterSchema,
  listCharactersQuerySchema,
  updateCharacterSchema,
} from '@allvision/shared';
import { requireAuth } from '../middleware/auth';
import { uploadCharacterReferences } from '../middleware/upload';
import * as fileService from '../services/file-service';
import { HttpError } from '../utils/http-error';
import { logger } from '../utils/logger';

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

    try {
      const character = await prisma.character.create({
        data: {
          userId: req.user!.id,
          name: body.name,
          type: body.type,
          gender: body.gender,
          ageGroup: body.ageGroup,
          description: body.description,
          referenceImages: uploaded.map((file) => file.url),
          primaryImageId: 0,
          consentGiven: true,
          consentAt: new Date(),
          nsfwChecked: false,
          status: 'READY',
          isPaid: false,
        },
      });

      res.status(201).json({ character });
    } catch (err) {
      await cleanupUploaded(uploaded);
      throw err;
    }
  } catch (err) {
    if (uploaded.length > 0) {
      await cleanupUploaded(uploaded);
    }
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
