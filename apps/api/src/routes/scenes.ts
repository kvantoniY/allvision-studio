import { Router, type NextFunction, type Request, type Response } from 'express';
import { Prisma, prisma, type EpisodeStatus } from '@allvision/database';
import { createSceneSchema, updateSceneSchema } from '@allvision/shared';
import { requireAuth } from '../middleware/auth';
import { uploadSceneReferences } from '../middleware/upload';
import * as fileService from '../services/file-service';
import { HttpError } from '../utils/http-error';
import { logger } from '../utils/logger';

export const scenesRouter = Router();

const activeEpisodeStatuses: EpisodeStatus[] = ['PENDING', 'PROCESSING_IMAGE', 'PROCESSING_VIDEO'];

function uploadedFiles(req: Request): Express.Multer.File[] {
  return Array.isArray(req.files) ? req.files : [];
}

function storageKeyFromUrl(value: string): string | null {
  if (value.startsWith('scene-references/')) return value;
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
    logger.warn(`Failed to delete scene asset ${key}`, err);
  }
}

async function cleanupUploaded(files: Array<{ key: string }>) {
  await Promise.all(files.map((file) => deleteStorageKey(file.key)));
}

scenesRouter.use(requireAuth);

scenesRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const items = await prisma.scene.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ items });
  } catch (err) {
    next(err);
  }
});

scenesRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const scene = await prisma.scene.findFirst({
      where: { id: req.params.id, userId: req.user!.id },
    });
    if (!scene) throw new HttpError(404, 'SCENE_NOT_FOUND', 'Scene not found');
    res.json({ scene });
  } catch (err) {
    next(err);
  }
});

scenesRouter.post('/', uploadSceneReferences, async (req: Request, res: Response, next: NextFunction) => {
  const uploaded: Array<{ url: string; key: string }> = [];
  try {
    const files = uploadedFiles(req);
    if (files.length === 0) {
      throw new HttpError(400, 'FILE_REQUIRED', 'At least one reference image is required');
    }

    const body = createSceneSchema.parse(req.body);
    for (const file of files) {
      const result = await fileService.uploadSceneReference(req.user!.id, file.buffer, file.mimetype);
      uploaded.push(result);
    }

    try {
      const scene = await prisma.scene.create({
        data: {
          userId: req.user!.id,
          name: body.name,
          description: body.description,
          category: body.category,
          referenceImages: uploaded.map((file) => file.url),
          isPaid: false,
        },
      });

      res.status(201).json({ scene });
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

scenesRouter.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const scene = await prisma.scene.findFirst({
      where: { id: req.params.id, userId: req.user!.id },
    });
    if (!scene) throw new HttpError(404, 'SCENE_NOT_FOUND', 'Scene not found');

    const body = updateSceneSchema.parse(req.body);
    const data: Prisma.SceneUpdateInput = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.description !== undefined) data.description = body.description;
    if (body.category !== undefined) data.category = body.category;
    if (body.isActive !== undefined) data.isActive = body.isActive;

    const updated = await prisma.scene.update({
      where: { id: scene.id },
      data,
    });

    res.json({ scene: updated });
  } catch (err) {
    next(err);
  }
});

scenesRouter.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const scene = await prisma.scene.findFirst({
      where: { id: req.params.id, userId: req.user!.id },
    });
    if (!scene) throw new HttpError(404, 'SCENE_NOT_FOUND', 'Scene not found');

    const activeEpisodes = await prisma.episode.count({
      where: {
        sceneId: scene.id,
        status: { in: activeEpisodeStatuses },
      },
    });
    if (activeEpisodes > 0) {
      throw new HttpError(409, 'SCENE_IN_USE', 'Scene is used by an active episode');
    }

    await prisma.scene.delete({ where: { id: scene.id } });
    await Promise.all(scene.referenceImages.map((url) => deleteStorageKey(storageKeyFromUrl(url))));
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
