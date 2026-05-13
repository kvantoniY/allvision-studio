import { Router, type NextFunction, type Request, type Response } from 'express';
import { Prisma, prisma } from '@allvision/database';
import { getBlockCatalogItem } from '@allvision/shared';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { uploadMediaAsset } from '../middleware/upload';
import { HttpError } from '../utils/http-error';
import { logger } from '../utils/logger';
import * as queues from '../queues';
import * as fileService from '../services/file-service';
import { processAndUploadMediaAsset } from '../services/media-asset-service';

export const userMediaAssetsRouter = Router();

userMediaAssetsRouter.use(requireAuth);

const USER_MEDIA_KINDS = ['user-avatar', 'user-location'] as const;
type UserMediaKind = (typeof USER_MEDIA_KINDS)[number];

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  kind: z.enum(USER_MEDIA_KINDS).optional(),
  tag: z.string().trim().min(1).optional(),
  search: z.string().trim().min(1).optional(),
});

const createSchema = z.object({
  kind: z.enum(USER_MEDIA_KINDS),
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(1000).optional(),
  tags: z.union([z.array(z.string()), z.string()]).optional(),
});

const updateSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  tags: z.union([z.array(z.string()), z.string()]).optional(),
});

const generateSchema = z.object({
  kind: z.enum(USER_MEDIA_KINDS),
  prompt: z.string().trim().min(8).max(2000),
  model: z.literal('nano-banana').default('nano-banana'),
  title: z.string().trim().min(1).max(160),
  aspectRatio: z.enum(['1:1', '9:16', '16:9', 'auto']).optional(),
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
  if (Array.isArray(value)) return value.map(String).map((tag) => tag.trim()).filter(Boolean);
  if (typeof value === 'string') return value.split(',').map((tag) => tag.trim()).filter(Boolean);
  return [];
}

function staticUrlForKey(key: string | null | undefined) {
  if (!key) return null;
  const baseUrl = process.env.PUBLIC_API_URL ?? 'http://localhost:4000';
  return `${baseUrl.replace(/\/+$/, '')}/static/${key.replace(/^\/+/, '')}`;
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
    durationSec: true,
    width: true,
    height: true,
    frameCount: true,
    fileSize: true,
    mimeType: true,
    isActive: true,
    sortOrder: true,
  } as const;
}

function toAssetResponse<T extends { thumbnailKey: string | null }>(asset: T) {
  return { ...asset, thumbnailUrl: staticUrlForKey(asset.thumbnailKey) };
}

function nanoBananaCostCoins() {
  const model = getBlockCatalogItem('image-edit')?.supportedModels.find((item) => item.slug === 'nano-banana');
  return model?.estimatedCostCoins ?? 10;
}

function isPrismaNotFound(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025';
}

async function deleteProcessedMedia(processed: { storageKey?: string | null; thumbnailKey?: string | null } | undefined) {
  if (processed?.storageKey) await fileService.deleteFile(processed.storageKey).catch(() => undefined);
  if (processed?.thumbnailKey) await fileService.deleteFile(processed.thumbnailKey).catch(() => undefined);
}

userMediaAssetsRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = listQuerySchema.parse(req.query);
    const where: Prisma.MediaAssetWhereInput = {
      ownerUserId: req.user!.id,
      ...(query.kind ? { kind: query.kind } : { kind: { in: [...USER_MEDIA_KINDS] } }),
      ...(query.tag ? { tags: { has: query.tag } } : {}),
      ...(query.search
        ? {
            OR: [
              { title: { contains: query.search, mode: 'insensitive' } },
              { description: { contains: query.search, mode: 'insensitive' } },
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
    res.json({ items: items.map(toAssetResponse), total, page: query.page, limit: query.limit });
  } catch (err) {
    next(err);
  }
});

userMediaAssetsRouter.post('/generate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = generateSchema.parse(req.body);
    const userId = req.user!.id;
    const tokensCost = nanoBananaCostCoins();
    const aspectRatio = body.aspectRatio ?? (body.kind === 'user-avatar' ? '1:1' : '16:9');
    const pipelineSnapshot = [
      {
        id: 'step_1',
        blockSlug: 'image-edit',
        input: null,
        params: {
          model: body.model,
          prompt: body.prompt,
          aspect_ratio: aspectRatio,
          output_format: 'jpg',
          resolution: '1K',
        },
      },
    ];

    let project;
    try {
      project = await prisma.$transaction(async (tx) => {
        const user = await tx.user.update({
          where: { id: userId, tokenBalance: { gte: tokensCost } },
          data: { tokenBalance: { decrement: tokensCost } },
          select: { tokenBalance: true },
        });
        const created = await tx.project.create({
          data: {
            userId,
            mode: 'library-generation',
            title: `Создание образа: ${body.title}`,
            status: 'PENDING',
            progress: 0,
            inputImages: [],
            inputText: body.prompt,
            tokensCost,
            pipelineSnapshot,
            selectedTier: 'standard',
            userInputs: {
              libraryGeneration: {
                kind: body.kind,
                title: body.title,
                prompt: body.prompt,
                model: body.model,
                aspectRatio,
              },
            },
            stepProgress: [],
          },
          select: {
            id: true,
            status: true,
            progress: true,
            tokensCost: true,
            createdAt: true,
            serviceId: true,
            title: true,
          },
        });
        await tx.tokenTransaction.create({
          data: {
            reason: 'library_generation',
            amount: -tokensCost,
            balanceAfter: user.tokenBalance,
            refId: created.id,
            userId,
          },
        });
        return created;
      });
    } catch (err) {
      if (isPrismaNotFound(err)) {
        throw new HttpError(402, 'INSUFFICIENT_TOKENS', 'Недостаточно коинов');
      }
      throw err;
    }

    try {
      await queues.addServicePipelineJob({ projectId: project.id, userId, mode: 'production' });
    } catch (err) {
      logger.error(`Failed to enqueue library-generation project ${project.id}`, err);
      await prisma.$transaction(async (tx) => {
        await tx.project.update({
          where: { id: project.id },
          data: { status: 'FAILED', errorMessage: 'Queue unavailable', errorCode: 'QUEUE_UNAVAILABLE' },
        });
        const user = await tx.user.update({
          where: { id: userId },
          data: { tokenBalance: { increment: tokensCost } },
          select: { tokenBalance: true },
        });
        await tx.tokenTransaction.create({
          data: {
            reason: 'refund',
            amount: tokensCost,
            balanceAfter: user.tokenBalance,
            refId: project.id,
            userId,
          },
        });
      });
      throw new HttpError(503, 'QUEUE_UNAVAILABLE', 'Очередь задач недоступна');
    }

    res.status(202).json({ project });
  } catch (err) {
    next(err);
  }
});

userMediaAssetsRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const asset = await prisma.mediaAsset.findFirst({
      where: { id: req.params.id, ownerUserId: req.user!.id },
      select: selectAsset(),
    });
    if (!asset) throw new HttpError(404, 'MEDIA_ASSET_NOT_FOUND', 'Медиа-файл не найден');
    res.json({ asset: toAssetResponse(asset) });
  } catch (err) {
    next(err);
  }
});

userMediaAssetsRouter.post('/', uploadMediaAsset, async (req: Request, res: Response, next: NextFunction) => {
  let processed: Awaited<ReturnType<typeof processAndUploadMediaAsset>> | undefined;
  try {
    if (!req.file) throw new HttpError(400, 'FILE_REQUIRED', 'Загрузите изображение');
    if (!req.file.mimetype.startsWith('image/')) {
      throw new HttpError(400, 'UNSUPPORTED_FORMAT', 'Для аватаров и локаций можно загружать только изображения');
    }
    const body = createSchema.parse(parseJsonOrBody(req));
    processed = await processAndUploadMediaAsset({ kind: body.kind, file: req.file });
    const aggregate = await prisma.mediaAsset.aggregate({
      where: { ownerUserId: req.user!.id, kind: body.kind },
      _max: { sortOrder: true },
    });
    const asset = await prisma.mediaAsset.create({
      data: {
        ownerUserId: req.user!.id,
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
        isActive: true,
        sortOrder: (aggregate._max.sortOrder ?? 0) + 10,
      },
      select: selectAsset(),
    });
    res.status(201).json({ asset: toAssetResponse(asset) });
  } catch (err) {
    await deleteProcessedMedia(processed);
    next(err);
  }
});

userMediaAssetsRouter.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = updateSchema.parse(parseJsonOrBody(req));
    const current = await prisma.mediaAsset.findFirst({ where: { id: req.params.id, ownerUserId: req.user!.id } });
    if (!current) throw new HttpError(404, 'MEDIA_ASSET_NOT_FOUND', 'Медиа-файл не найден');
    const asset = await prisma.mediaAsset.update({
      where: { id: current.id },
      data: {
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.tags !== undefined ? { tags: normaliseTags(body.tags) } : {}),
      },
      select: selectAsset(),
    });
    res.json({ asset: toAssetResponse(asset) });
  } catch (err) {
    next(err);
  }
});

userMediaAssetsRouter.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const current = await prisma.mediaAsset.findFirst({ where: { id: req.params.id, ownerUserId: req.user!.id } });
    if (!current) throw new HttpError(404, 'MEDIA_ASSET_NOT_FOUND', 'Медиа-файл не найден');
    await prisma.mediaAsset.delete({ where: { id: current.id } });
    await deleteProcessedMedia(current);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
