import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Router, type NextFunction, type Request, type Response } from 'express';
import sharp from 'sharp';
import { Prisma, prisma, ProjectStatus } from '@allvision/database';
import { getBlockCatalogItem } from '@allvision/shared';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { uploadMediaAsset } from '../middleware/upload';
import { HttpError } from '../utils/http-error';
import { logger } from '../utils/logger';
import { resolveWorkspacePath } from '../utils/paths';
import * as queues from '../queues';
import * as fileService from '../services/file-service';
import { processAndUploadMediaAsset } from '../services/media-asset-service';
import { getStorageProvider } from '../providers';

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
  parentAssetId: z.string().trim().min(1).optional(),
});

const saveFromProjectSchema = z.object({
  projectId: z.string().trim().min(1),
  kind: z.enum(USER_MEDIA_KINDS),
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(1000).optional(),
  tags: z.union([z.array(z.string()), z.string()]).optional(),
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
    parentAssetId: true,
    durationSec: true,
    width: true,
    height: true,
    frameCount: true,
    fileSize: true,
    mimeType: true,
    isActive: true,
    sortOrder: true,
    _count: { select: { variations: true } },
  } as const;
}

function toAssetResponse<T extends { thumbnailKey: string | null; _count?: { variations: number } }>(asset: T) {
  const { _count, ...rest } = asset;
  return { ...rest, thumbnailUrl: staticUrlForKey(asset.thumbnailKey), variationsCount: _count?.variations ?? 0 };
}

function nanoBananaCostCoins() {
  const model = getBlockCatalogItem('image-edit')?.supportedModels.find((item) => item.slug === 'nano-banana');
  return model?.estimatedCostCoins ?? 10;
}

function projectOutputUrl(project: { resultImage: string | null; resultVideo: string | null; resultThumbnail: string | null }) {
  return project.resultVideo ?? project.resultImage ?? project.resultThumbnail;
}

function staticKeyFromUrl(value: string): string | null {
  const rawPath = (() => {
    if (value.startsWith('http://') || value.startsWith('https://')) {
      try {
        return new URL(value).pathname;
      } catch {
        return null;
      }
    }
    return value;
  })();
  if (!rawPath) return null;
  const marker = '/static/';
  if (!rawPath.includes(marker)) return null;
  return decodeURIComponent(rawPath.slice(rawPath.indexOf(marker) + marker.length).replace(/^\/+/, ''));
}

function mimeTypeForUrl(value: string) {
  const ext = value.split('?')[0]?.split('.').pop()?.toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'mp4') return 'video/mp4';
  if (ext === 'webm') return 'video/webm';
  if (ext === 'mov') return 'video/quicktime';
  return 'image/jpeg';
}

function extensionFor(contentType: string, url: string) {
  if (contentType.includes('png')) return 'png';
  if (contentType.includes('webp')) return 'webp';
  if (contentType.includes('mp4')) return 'mp4';
  if (contentType.includes('webm')) return 'webm';
  if (contentType.includes('quicktime')) return 'mov';
  const ext = url.split('?')[0]?.split('.').pop()?.toLowerCase();
  if (ext && /^[a-z0-9]+$/.test(ext)) return ext === 'jpeg' ? 'jpg' : ext;
  return 'jpg';
}

async function readStaticFile(key: string) {
  const rootDir = resolveWorkspacePath(process.env.UPLOADS_DIR ?? './uploads');
  const target = path.resolve(rootDir, key.replace(/^\/+/, ''));
  if (!target.startsWith(rootDir + path.sep) && target !== rootDir) {
    throw new Error(`INVALID_STORAGE_KEY: ${key}`);
  }
  return fs.readFile(target);
}

async function readOutputBuffer(outputUrl: string) {
  const staticKey = staticKeyFromUrl(outputUrl);
  if (staticKey) {
    return {
      buffer: await readStaticFile(staticKey),
      contentType: mimeTypeForUrl(staticKey),
    };
  }

  const absoluteUrl = outputUrl.startsWith('/static/')
    ? `${(process.env.PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/+$/, '')}${outputUrl}`
    : outputUrl;
  const downloaded = await fetch(absoluteUrl);
  if (!downloaded.ok) {
    throw new HttpError(502, 'PROJECT_OUTPUT_DOWNLOAD_FAILED', 'Не удалось скачать результат проекта');
  }
  return {
    buffer: Buffer.from(await downloaded.arrayBuffer()),
    contentType: downloaded.headers.get('content-type') ?? mimeTypeForUrl(outputUrl),
  };
}

async function mediaDimensions(buffer: Buffer, contentType: string) {
  if (!contentType.startsWith('image/')) return {};
  const metadata = await sharp(buffer).metadata().catch(() => undefined);
  return {
    width: metadata?.width,
    height: metadata?.height,
  };
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
    const parentAsset = body.parentAssetId
      ? await prisma.mediaAsset.findFirst({
          where: { id: body.parentAssetId, ownerUserId: userId, kind: body.kind, isActive: true },
          select: { id: true, publicUrl: true },
        })
      : null;
    if (body.parentAssetId && !parentAsset) {
      throw new HttpError(404, 'PARENT_ASSET_NOT_FOUND', 'Исходный образ не найден');
    }
    const pipelineSnapshot = [
      {
        id: 'step_1',
        blockSlug: 'image-edit',
        input: parentAsset ? `asset:${parentAsset.id}` : null,
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
            inputImages: parentAsset ? [parentAsset.publicUrl] : [],
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
                parentAssetId: parentAsset?.id,
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
        throw new HttpError(402, 'INSUFFICIENT_TOKENS', 'Недостаточно токенов');
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

userMediaAssetsRouter.post('/save-from-project', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = saveFromProjectSchema.parse(req.body);
    const userId = req.user!.id;
    const project = await prisma.project.findFirst({
      where: { id: body.projectId, userId },
      select: {
        id: true,
        mode: true,
        status: true,
        title: true,
        resultImage: true,
        resultVideo: true,
        resultThumbnail: true,
      },
    });
    if (!project) throw new HttpError(404, 'PROJECT_NOT_FOUND', 'Проект не найден');
    if (!['free-chat', 'library-generation', 'service'].includes(project.mode)) {
      throw new HttpError(400, 'PROJECT_MODE_NOT_SUPPORTED', 'Этот проект нельзя сохранить в Студию');
    }
    if (project.status !== ProjectStatus.COMPLETED) {
      throw new HttpError(400, 'PROJECT_NOT_COMPLETED', 'Сохранить можно только завершённый проект');
    }

    const outputUrl = projectOutputUrl(project);
    if (!outputUrl) throw new HttpError(400, 'PROJECT_OUTPUT_MISSING', 'У проекта нет готового результата');

    const { buffer, contentType } = await readOutputBuffer(outputUrl);
    const ext = extensionFor(contentType, outputUrl);
    const storageKey = `user-uploads/library/${userId}/${crypto.randomUUID()}.${ext}`;
    const uploaded = await getStorageProvider().upload({ key: storageKey, body: buffer, contentType });
    const dimensions = await mediaDimensions(buffer, contentType);
    const aggregate = await prisma.mediaAsset.aggregate({
      where: { ownerUserId: userId, kind: body.kind },
      _max: { sortOrder: true },
    });
    const asset = await prisma.mediaAsset.create({
      data: {
        ownerUserId: userId,
        kind: body.kind,
        title: body.title,
        description: body.description ?? `Сохранено из проекта: ${project.title}`,
        tags: [...new Set([...normaliseTags(body.tags), 'from-project', `project:${project.id}`])],
        storageKey: uploaded.key,
        publicUrl: uploaded.url,
        thumbnailKey: null,
        durationSec: null,
        width: dimensions.width ?? null,
        height: dimensions.height ?? null,
        frameCount: null,
        fileSize: buffer.length,
        mimeType: contentType,
        isActive: true,
        sortOrder: (aggregate._max.sortOrder ?? 0) + 10,
      },
      select: selectAsset(),
    });
    res.status(201).json({ asset: toAssetResponse(asset) });
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
