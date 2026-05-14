import { Router, type NextFunction, type Request, type Response } from 'express';
import { Prisma, prisma } from '@allvision/database';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';
import { requireAdmin } from '../../middleware/require-admin';
import { uploadMediaAsset } from '../../middleware/upload';
import { HttpError } from '../../utils/http-error';
import * as fileService from '../../services/file-service';
import { processAndUploadMediaAsset } from '../../services/media-asset-service';

export const adminMediaAssetsRouter = Router();

adminMediaAssetsRouter.use(requireAuth, requireAdmin);

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  kind: z.string().trim().min(1).max(80).optional(),
  isActive: z.preprocess((value) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  }, z.boolean().optional()),
  search: z.string().trim().min(1).optional(),
});

const createSchema = z.object({
  kind: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(1000).optional(),
  tags: z.union([z.array(z.string()), z.string()]).optional(),
  isActive: z.boolean().optional().default(true),
});

const updateSchema = z.object({
  kind: z.string().trim().min(1).max(80).optional(),
  title: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  tags: z.union([z.array(z.string()), z.string()]).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

const reorderSchema = z.object({
  direction: z.enum(['up', 'down']).optional(),
  sortOrder: z.number().int().min(0).optional(),
});

function parseJsonOrBody(req: Request) {
  const raw = req.body.data ?? req.body;
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError(400, 'INVALID_JSON_DATA', 'Некорректный JSON в поле data');
  }
}

function normaliseTags(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(String).map((tag) => tag.trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value.split(',').map((tag) => tag.trim()).filter(Boolean);
  }
  return [];
}

function selectAsset() {
  return {
    id: true,
    createdAt: true,
    updatedAt: true,
    kind: true,
    title: true,
    description: true,
    tags: true,
    storageKey: true,
    publicUrl: true,
    thumbnailKey: true,
    ownerUserId: true,
    parentAssetId: true,
    durationSec: true,
    width: true,
    height: true,
    frameCount: true,
    fileSize: true,
    mimeType: true,
    isActive: true,
    sortOrder: true,
    owner: {
      select: {
        id: true,
        email: true,
      },
    },
  } as const;
}

adminMediaAssetsRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = listQuerySchema.parse(req.query);
    const where: Prisma.MediaAssetWhereInput = {
      ...(query.kind ? { kind: query.kind } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.search
        ? {
            OR: [
              { title: { contains: query.search, mode: 'insensitive' } },
              { tags: { has: query.search } },
            ],
          }
        : {}),
    };
    const [items, total] = await prisma.$transaction([
      prisma.mediaAsset.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: selectAsset(),
      }),
      prisma.mediaAsset.count({ where }),
    ]);
    res.json({ items, total, page: query.page, limit: query.limit });
  } catch (err) {
    next(err);
  }
});

adminMediaAssetsRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const asset = await prisma.mediaAsset.findUnique({ where: { id: req.params.id }, select: selectAsset() });
    if (!asset) throw new HttpError(404, 'MEDIA_ASSET_NOT_FOUND', 'Медиа-файл не найден');
    res.json({ asset });
  } catch (err) {
    next(err);
  }
});

adminMediaAssetsRouter.post('/', uploadMediaAsset, async (req: Request, res: Response, next: NextFunction) => {
  let uploaded: { storageKey?: string; thumbnailKey?: string } | undefined;
  try {
    if (!req.file) throw new HttpError(400, 'FILE_REQUIRED', 'Загрузите медиа-файл');
    const body = createSchema.parse(parseJsonOrBody(req));
    const processed = await processAndUploadMediaAsset({ kind: body.kind, file: req.file });
    uploaded = processed;
    const aggregate = await prisma.mediaAsset.aggregate({
      where: { kind: body.kind },
      _max: { sortOrder: true },
    });
    const asset = await prisma.mediaAsset.create({
      data: {
        kind: body.kind,
        title: body.title,
        description: body.description ?? null,
        tags: normaliseTags(body.tags),
        storageKey: processed.storageKey,
        publicUrl: processed.publicUrl,
        thumbnailKey: processed.thumbnailKey ?? null,
        durationSec: processed.durationSec ?? null,
        width: processed.width ?? null,
        height: processed.height ?? null,
        frameCount: processed.frameCount ?? null,
        fileSize: processed.fileSize,
        mimeType: processed.mimeType,
        isActive: body.isActive,
        sortOrder: (aggregate._max.sortOrder ?? 0) + 10,
      },
      select: selectAsset(),
    });
    res.status(201).json({ asset });
  } catch (err) {
    if (uploaded?.storageKey) await fileService.deleteFile(uploaded.storageKey).catch(() => undefined);
    if (uploaded?.thumbnailKey) await fileService.deleteFile(uploaded.thumbnailKey).catch(() => undefined);
    next(err);
  }
});

adminMediaAssetsRouter.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = updateSchema.parse(parseJsonOrBody(req));
    const current = await prisma.mediaAsset.findUnique({ where: { id: req.params.id } });
    if (!current) throw new HttpError(404, 'MEDIA_ASSET_NOT_FOUND', 'Медиа-файл не найден');
    const asset = await prisma.mediaAsset.update({
      where: { id: current.id },
      data: {
        ...(body.kind !== undefined ? { kind: body.kind } : {}),
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.tags !== undefined ? { tags: normaliseTags(body.tags) } : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
        ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
      },
      select: selectAsset(),
    });
    res.json({ asset });
  } catch (err) {
    next(err);
  }
});

adminMediaAssetsRouter.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const asset = await prisma.mediaAsset.findUnique({ where: { id: req.params.id } });
    if (!asset) throw new HttpError(404, 'MEDIA_ASSET_NOT_FOUND', 'Медиа-файл не найден');
    const inUse = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM "Project"
      WHERE "status" IN ('PENDING', 'PROCESSING')
        AND "userInputs"::text LIKE ${`%${asset.id}%`}
    `;
    if (Number(inUse[0]?.count ?? 0) > 0) {
      throw new HttpError(409, 'MEDIA_ASSET_IN_USE', 'Медиа-файл используется в активных проектах');
    }
    await prisma.mediaAsset.delete({ where: { id: asset.id } });
    await Promise.all([
      fileService.deleteFile(asset.storageKey).catch(() => undefined),
      asset.thumbnailKey ? fileService.deleteFile(asset.thumbnailKey).catch(() => undefined) : Promise.resolve(),
    ]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

adminMediaAssetsRouter.post('/:id/reorder', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = reorderSchema.parse(req.body);
    const current = await prisma.mediaAsset.findUnique({ where: { id: req.params.id } });
    if (!current) throw new HttpError(404, 'MEDIA_ASSET_NOT_FOUND', 'Медиа-файл не найден');
    if (body.sortOrder !== undefined) {
      const asset = await prisma.mediaAsset.update({
        where: { id: current.id },
        data: { sortOrder: body.sortOrder },
        select: selectAsset(),
      });
      res.json({ ok: true, moved: true, asset });
      return;
    }
    const direction = body.direction ?? 'down';
    const neighbor = await prisma.mediaAsset.findFirst({
      where: {
        kind: current.kind,
        sortOrder: direction === 'up' ? { lt: current.sortOrder } : { gt: current.sortOrder },
      },
      orderBy: { sortOrder: direction === 'up' ? 'desc' : 'asc' },
    });
    if (!neighbor) {
      res.json({ ok: true, moved: false });
      return;
    }
    await prisma.$transaction([
      prisma.mediaAsset.update({ where: { id: current.id }, data: { sortOrder: neighbor.sortOrder } }),
      prisma.mediaAsset.update({ where: { id: neighbor.id }, data: { sortOrder: current.sortOrder } }),
    ]);
    res.json({ ok: true, moved: true });
  } catch (err) {
    next(err);
  }
});
