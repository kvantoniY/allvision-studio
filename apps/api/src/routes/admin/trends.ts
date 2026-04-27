import { Router, type NextFunction, type Request, type Response } from 'express';
import { Prisma, prisma } from '@allvision/database';
import {
  adminTrendListQuerySchema,
  createAdminTrendSchema,
  reorderAdminTrendSchema,
  updateAdminTrendSchema,
} from '@allvision/shared';
import { requireAuth } from '../../middleware/auth';
import { requireAdmin } from '../../middleware/require-admin';
import { uploadTrendAssets } from '../../middleware/upload';
import * as fileService from '../../services/file-service';
import { HttpError } from '../../utils/http-error';
import { logger } from '../../utils/logger';

export const adminTrendsRouter = Router();

const trendInclude = {
  service: {
    select: {
      id: true,
      slug: true,
      title: true,
      priceTokens: true,
    },
  },
} satisfies Prisma.TrendInclude;

type TrendAssets = {
  previewVideo?: Express.Multer.File[];
  thumbnail?: Express.Multer.File[];
};

function filesOf(req: Request): TrendAssets {
  if (!req.files || Array.isArray(req.files)) return {};
  return req.files as TrendAssets;
}

function firstFile(req: Request, field: keyof TrendAssets): Express.Multer.File | undefined {
  return filesOf(req)[field]?.[0];
}

function parseAiConfig(value: string | undefined): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  try {
    const parsed = JSON.parse(value || '{}') as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('aiConfig must be an object');
    }
    return parsed as Prisma.InputJsonValue;
  } catch {
    throw new HttpError(400, 'INVALID_AI_CONFIG', 'aiConfig РЅРµ РІР°Р»РёРґРЅС‹Р№ JSON');
  }
}

function storageKeyFromUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.startsWith('trend-assets/')) return value;
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
    logger.warn(`Failed to delete trend asset ${key}`, err);
  }
}

async function findTrendsService() {
  const service = await prisma.service.findUnique({ where: { slug: 'trends' } });
  if (!service) throw new HttpError(404, 'SERVICE_NOT_FOUND', 'Service not found');
  return service;
}

adminTrendsRouter.use(requireAuth, requireAdmin);

adminTrendsRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = adminTrendListQuerySchema.parse(req.query);
    const where: Prisma.TrendWhereInput = {
      ...(query.serviceSlug ? { service: { slug: query.serviceSlug } } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.search ? { title: { contains: query.search, mode: 'insensitive' } } : {}),
    };

    const [items, total] = await prisma.$transaction([
      prisma.trend.findMany({
        where,
        include: trendInclude,
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      prisma.trend.count({ where }),
    ]);

    res.json({ items, total, page: query.page, limit: query.limit });
  } catch (err) {
    next(err);
  }
});

adminTrendsRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const trend = await prisma.trend.findUnique({
      where: { id: req.params.id },
      include: trendInclude,
    });
    if (!trend) throw new HttpError(404, 'TREND_NOT_FOUND', 'Trend not found');
    res.json({ trend });
  } catch (err) {
    next(err);
  }
});

adminTrendsRouter.post('/', uploadTrendAssets, async (req: Request, res: Response, next: NextFunction) => {
  const uploaded: Array<{ key: string }> = [];
  try {
    const body = createAdminTrendSchema.parse(req.body);
    const previewVideo = firstFile(req, 'previewVideo');
    const thumbnail = firstFile(req, 'thumbnail');
    if (!previewVideo || !thumbnail) {
      throw new HttpError(400, 'FILE_REQUIRED', 'previewVideo Рё thumbnail РѕР±СЏР·Р°С‚РµР»СЊРЅС‹');
    }

    const service = await findTrendsService();
    const aiConfig = parseAiConfig(body.aiConfig) ?? {};
    const preview = await fileService.uploadTrendPreview(previewVideo.buffer, previewVideo.mimetype);
    uploaded.push(preview);
    const thumb = await fileService.uploadTrendThumbnail(thumbnail.buffer, thumbnail.mimetype);
    uploaded.push(thumb);

    const aggregate = await prisma.trend.aggregate({ _max: { sortOrder: true } });
    const sortOrder = (aggregate._max.sortOrder ?? 0) + 1;

    try {
      const trend = await prisma.trend.create({
        data: {
          title: body.title,
          description: body.description,
          prompt: body.prompt,
          previewVideo: preview.url,
          referenceImg: thumb.url,
          aiProvider: service.aiProvider ?? 'mock',
          aiModel: body.aiModel,
          aiConfig,
          tags: [],
          priceTokens: body.priceTokens ?? null,
          isActive: body.isActive,
          sortOrder,
          usedCount: 0,
          serviceId: service.id,
        },
        include: trendInclude,
      });

      res.status(201).json({ trend });
    } catch (err) {
      await Promise.all(uploaded.map((file) => fileService.deleteFile(file.key).catch(() => undefined)));
      throw err;
    }
  } catch (err) {
    if (uploaded.length > 0) {
      await Promise.all(uploaded.map((file) => fileService.deleteFile(file.key).catch(() => undefined)));
    }
    next(err);
  }
});

adminTrendsRouter.patch('/:id', uploadTrendAssets, async (req: Request, res: Response, next: NextFunction) => {
  const uploaded: Array<{ key: string }> = [];
  try {
    const trend = await prisma.trend.findUnique({ where: { id: req.params.id } });
    if (!trend) throw new HttpError(404, 'TREND_NOT_FOUND', 'Trend not found');

    const body = updateAdminTrendSchema.parse(req.body);
    const aiConfig = parseAiConfig(body.aiConfig);
    const previewVideo = firstFile(req, 'previewVideo');
    const thumbnail = firstFile(req, 'thumbnail');
    const data: Prisma.TrendUpdateInput = {};
    const oldKeys: string[] = [];

    if (body.title !== undefined) data.title = body.title;
    if (body.description !== undefined) data.description = body.description;
    if (body.prompt !== undefined) data.prompt = body.prompt;
    if (body.aiModel !== undefined) data.aiModel = body.aiModel;
    if (aiConfig !== undefined) data.aiConfig = aiConfig;
    if (body.priceTokens !== undefined) data.priceTokens = body.priceTokens;
    if (body.isActive !== undefined) data.isActive = body.isActive;
    if (body.serviceSlug !== undefined) {
      const service = await findTrendsService();
      data.service = { connect: { id: service.id } };
    }

    if (previewVideo) {
      const preview = await fileService.uploadTrendPreview(previewVideo.buffer, previewVideo.mimetype);
      uploaded.push(preview);
      data.previewVideo = preview.url;
      const oldKey = storageKeyFromUrl(trend.previewVideo);
      if (oldKey) oldKeys.push(oldKey);
    }

    if (thumbnail) {
      const thumb = await fileService.uploadTrendThumbnail(thumbnail.buffer, thumbnail.mimetype);
      uploaded.push(thumb);
      data.referenceImg = thumb.url;
      const oldKey = storageKeyFromUrl(trend.referenceImg);
      if (oldKey) oldKeys.push(oldKey);
    }

    try {
      const updated = await prisma.trend.update({
        where: { id: trend.id },
        data,
        include: trendInclude,
      });
      await Promise.all(oldKeys.map((key) => deleteStorageKey(key)));
      res.json({ trend: updated });
    } catch (err) {
      await Promise.all(uploaded.map((file) => fileService.deleteFile(file.key).catch(() => undefined)));
      throw err;
    }
  } catch (err) {
    if (uploaded.length > 0) {
      await Promise.all(uploaded.map((file) => fileService.deleteFile(file.key).catch(() => undefined)));
    }
    next(err);
  }
});

adminTrendsRouter.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const trend = await prisma.trend.findUnique({ where: { id: req.params.id } });
    if (!trend) throw new HttpError(404, 'TREND_NOT_FOUND', 'Trend not found');

    const activeProjects = await prisma.project.count({
      where: {
        trendId: trend.id,
        status: { in: ['PENDING', 'PROCESSING'] },
      },
    });
    if (activeProjects > 0) {
      throw new HttpError(409, 'TREND_IN_USE', 'Невозможно удалить: есть активные проекты с этим трендом');
    }

    await prisma.trend.delete({ where: { id: trend.id } });
    await Promise.all([
      deleteStorageKey(storageKeyFromUrl(trend.previewVideo)),
      deleteStorageKey(storageKeyFromUrl(trend.referenceImg)),
    ]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

adminTrendsRouter.post('/:id/reorder', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { direction } = reorderAdminTrendSchema.parse(req.body);
    const current = await prisma.trend.findUnique({ where: { id: req.params.id } });
    if (!current) throw new HttpError(404, 'TREND_NOT_FOUND', 'Trend not found');

    const neighbor = await prisma.trend.findFirst({
      where: {
        serviceId: current.serviceId,
        sortOrder: direction === 'up' ? { lt: current.sortOrder } : { gt: current.sortOrder },
      },
      orderBy: { sortOrder: direction === 'up' ? 'desc' : 'asc' },
    });

    if (!neighbor) {
      res.json({ ok: true, moved: false });
      return;
    }

    await prisma.$transaction([
      prisma.trend.update({ where: { id: current.id }, data: { sortOrder: neighbor.sortOrder } }),
      prisma.trend.update({ where: { id: neighbor.id }, data: { sortOrder: current.sortOrder } }),
    ]);

    res.json({ ok: true, moved: true });
  } catch (err) {
    next(err);
  }
});
