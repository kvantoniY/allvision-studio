import { Router, type NextFunction, type Request, type Response } from 'express';
import { Prisma, prisma } from '@allvision/database';
import {
  adminServiceListQuerySchema,
  parseAdminServiceData,
  reorderAdminServiceSchema,
  validatePipelineConfig,
  validateUserInputForm,
  formatAdminServiceValidationError,
  type CreateAdminServiceInput,
  type UpdateAdminServiceInput,
} from '@allvision/shared';
import { requireAuth } from '../../middleware/auth';
import { requireAdmin } from '../../middleware/require-admin';
import { uploadServiceAssets } from '../../middleware/upload';
import { HttpError } from '../../utils/http-error';
import * as queues from '../../queues';
import { logger } from '../../utils/logger';
import * as fileService from '../../services/file-service';

export const adminServicesRouter = Router();

adminServicesRouter.use(requireAuth, requireAdmin);

type ServiceAssets = {
  previewImage?: Express.Multer.File[];
  previewVideo?: Express.Multer.File[];
};

function filesOf(req: Request): ServiceAssets {
  if (!req.files || Array.isArray(req.files)) return {};
  return req.files as ServiceAssets;
}

function firstFile(req: Request, field: keyof ServiceAssets): Express.Multer.File | undefined {
  return filesOf(req)[field]?.[0];
}

function storageKeyFromUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.startsWith('service-assets/')) return value;
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
    logger.warn(`Failed to delete service asset ${key}`, err);
  }
}

function mapValidationError(err: unknown): HttpError {
  const message = (err as Error).message;
  if (message === 'INVALID_JSON_DATA') {
    return new HttpError(400, 'INVALID_JSON_DATA', 'Некорректный JSON в поле data');
  }
  if (message.startsWith('UNKNOWN_BLOCK:')) {
    return new HttpError(400, 'UNKNOWN_BLOCK', formatAdminServiceValidationError(message));
  }
  if (message.startsWith('DUPLICATE_STEP_ID:')) {
    return new HttpError(400, 'DUPLICATE_STEP_ID', formatAdminServiceValidationError(message));
  }
  if (message.startsWith('INVALID_STEP_REFERENCE:')) {
    return new HttpError(400, 'INVALID_STEP_REFERENCE', formatAdminServiceValidationError(message));
  }
  if (message.startsWith('UNKNOWN_USER_FIELD:')) {
    return new HttpError(400, 'UNKNOWN_USER_FIELD', formatAdminServiceValidationError(message));
  }
  if (
    message.startsWith('INVALID_PARAMS:') ||
    message.startsWith('MISSING_PARAM:') ||
    message.startsWith('PARAM_TOO_LARGE:') ||
    message.startsWith('PARAM_TOO_SMALL:') ||
    message.startsWith('PIPELINE_EMPTY') ||
    message.startsWith('STEP_BLOCK_MISSING:') ||
    message.startsWith('STEP_INVALID:')
  ) {
    return new HttpError(400, 'INVALID_BLOCK_PARAMS', formatAdminServiceValidationError(message));
  }
  if (message === 'TIER_FIELD_REQUIRED') {
    return new HttpError(400, 'TIER_FIELD_REQUIRED', formatAdminServiceValidationError(message));
  }
  if (message.startsWith('DUPLICATE_FIELD_ID:')) {
    return new HttpError(400, 'DUPLICATE_FIELD_ID', formatAdminServiceValidationError(message));
  }
  if (message.startsWith('SELECT_OPTIONS_REQUIRED:')) {
    return new HttpError(400, 'SELECT_OPTIONS_REQUIRED', formatAdminServiceValidationError(message));
  }
  if (message.startsWith('MEDIA_KIND_REQUIRED:')) {
    return new HttpError(400, 'MEDIA_KIND_REQUIRED', formatAdminServiceValidationError(message));
  }
  if (message.startsWith('USER_INPUT_FORM_EMPTY') || message.startsWith('USER_INPUT_FIELD_INVALID:')) {
    return new HttpError(400, 'INVALID_USER_INPUT_FORM', formatAdminServiceValidationError(message));
  }
  return new HttpError(400, 'INVALID_SERVICE_DATA', formatAdminServiceValidationError(message));
}

function validateServiceShape(input: { pipelineConfig?: unknown; userInputForm?: unknown }) {
  try {
    if (input.userInputForm !== undefined && input.userInputForm !== null) {
      validateUserInputForm(input.userInputForm);
    }
    if (
      input.pipelineConfig !== undefined &&
      input.pipelineConfig !== null &&
      input.userInputForm !== undefined &&
      input.userInputForm !== null
    ) {
      validatePipelineConfig(input.pipelineConfig, input.userInputForm);
    }
  } catch (err) {
    throw mapValidationError(err);
  }
}

const activeProjectStatuses = ['PENDING', 'PROCESSING'] as const;

adminServicesRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = adminServiceListQuerySchema.parse(req.query);
    const where: Prisma.ServiceWhereInput = {
      ...(query.category ? { category: query.category } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.isFeatured !== undefined ? { isFeatured: query.isFeatured } : {}),
      ...(query.search ? { title: { contains: query.search, mode: 'insensitive' } } : {}),
    };

    const [items, total] = await prisma.$transaction([
      prisma.service.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      prisma.service.count({ where }),
    ]);

    res.json({ items, total, page: query.page, limit: query.limit });
  } catch (err) {
    next(err);
  }
});

adminServicesRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const service = await prisma.service.findUnique({ where: { id: req.params.id } });
    if (!service) throw new HttpError(404, 'SERVICE_NOT_FOUND', 'Услуга не найдена');
    res.json({ service });
  } catch (err) {
    next(err);
  }
});

adminServicesRouter.post('/', uploadServiceAssets, async (req: Request, res: Response, next: NextFunction) => {
  const uploaded: Array<{ key: string }> = [];
  try {
    const body = parseAdminServiceData(req.body.data ?? req.body, 'create') as CreateAdminServiceInput;
    validateServiceShape(body);

    const existing = await prisma.service.findUnique({ where: { slug: body.slug }, select: { id: true } });
    if (existing) throw new HttpError(404, 'SERVICE_SLUG_TAKEN', 'Слаг услуги уже занят');

    const previewImage = firstFile(req, 'previewImage');
    const previewVideo = firstFile(req, 'previewVideo');
    const image = previewImage
      ? await fileService.uploadServicePreview(previewImage.buffer, previewImage.mimetype, 'image')
      : undefined;
    if (image) uploaded.push(image);
    const video = previewVideo
      ? await fileService.uploadServicePreview(previewVideo.buffer, previewVideo.mimetype, 'video')
      : undefined;
    if (video) uploaded.push(video);

    const aggregate = await prisma.service.aggregate({ _max: { sortOrder: true } });
    const sortOrder = body.sortOrder ?? (aggregate._max.sortOrder ?? 0) + 1;

    try {
      const service = await prisma.service.create({
        data: {
          slug: body.slug,
          title: body.title,
          shortDesc: body.shortDesc,
          description: body.description,
          category: body.category,
          priceTokens: body.priceCoinsStandard,
          costUsd: 0,
          coverImage: image?.url ?? null,
          galleryImages: [],
          isActive: body.isActive,
          isFeatured: body.isFeatured,
          sortOrder,
          aiProvider: 'mock',
          aiModel: 'mock-data-driven-pipeline',
          aiConfig: {},
          processingType: 'AUTO',
          pipelineConfig: body.pipelineConfig as Prisma.InputJsonValue,
          userInputForm: body.userInputForm as Prisma.InputJsonValue,
          priceCoinsStandard: body.priceCoinsStandard,
          priceCoinsPro: body.priceCoinsPro,
          previewImage: image?.url ?? null,
          previewVideo: video?.url ?? null,
        },
      });
      res.status(201).json({ service });
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

adminServicesRouter.patch('/:id', uploadServiceAssets, async (req: Request, res: Response, next: NextFunction) => {
  const uploaded: Array<{ key: string }> = [];
  try {
    const current = await prisma.service.findUnique({ where: { id: req.params.id } });
    if (!current) throw new HttpError(404, 'SERVICE_NOT_FOUND', 'Услуга не найдена');

    const body = parseAdminServiceData(req.body.data ?? req.body, 'update') as UpdateAdminServiceInput;
    const nextPipeline = body.pipelineConfig ?? current.pipelineConfig;
    const nextUserInputForm = body.userInputForm ?? current.userInputForm;
    validateServiceShape({ pipelineConfig: nextPipeline, userInputForm: nextUserInputForm });

    const previewImage = firstFile(req, 'previewImage');
    const previewVideo = firstFile(req, 'previewVideo');
    const oldKeys: string[] = [];
    const data: Prisma.ServiceUpdateInput = {};

    if (body.title !== undefined) data.title = body.title;
    if (body.shortDesc !== undefined) data.shortDesc = body.shortDesc;
    if (body.description !== undefined) data.description = body.description;
    if (body.category !== undefined) data.category = body.category;
    if (body.priceCoinsStandard !== undefined) {
      data.priceCoinsStandard = body.priceCoinsStandard;
      data.priceTokens = body.priceCoinsStandard;
    }
    if (body.priceCoinsPro !== undefined) data.priceCoinsPro = body.priceCoinsPro;
    if (body.pipelineConfig !== undefined) data.pipelineConfig = body.pipelineConfig as Prisma.InputJsonValue;
    if (body.userInputForm !== undefined) data.userInputForm = body.userInputForm as Prisma.InputJsonValue;
    if (body.isActive !== undefined) data.isActive = body.isActive;
    if (body.isFeatured !== undefined) data.isFeatured = body.isFeatured;

    if (previewImage) {
      const image = await fileService.uploadServicePreview(previewImage.buffer, previewImage.mimetype, 'image');
      uploaded.push(image);
      data.previewImage = image.url;
      data.coverImage = image.url;
      const oldKey = storageKeyFromUrl(current.previewImage ?? current.coverImage);
      if (oldKey) oldKeys.push(oldKey);
    }

    if (previewVideo) {
      const video = await fileService.uploadServicePreview(previewVideo.buffer, previewVideo.mimetype, 'video');
      uploaded.push(video);
      data.previewVideo = video.url;
      const oldKey = storageKeyFromUrl(current.previewVideo);
      if (oldKey) oldKeys.push(oldKey);
    }

    try {
      const service = await prisma.service.update({
        where: { id: current.id },
        data,
      });
      await Promise.all(oldKeys.map((key) => deleteStorageKey(key)));
      res.json({ service });
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

adminServicesRouter.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const service = await prisma.service.findUnique({ where: { id: req.params.id } });
    if (!service) throw new HttpError(404, 'SERVICE_NOT_FOUND', 'Услуга не найдена');

    const [activeProjects, trendCount] = await prisma.$transaction([
      prisma.project.count({
        where: {
          serviceId: service.id,
          status: { in: [...activeProjectStatuses] },
        },
      }),
      prisma.trend.count({ where: { serviceId: service.id } }),
    ]);
    if (activeProjects > 0 || trendCount > 0) {
      throw new HttpError(409, 'SERVICE_IN_USE', 'Нельзя удалить услугу: по ней есть активные проекты');
    }

    await prisma.service.delete({ where: { id: service.id } });
    await Promise.all([
      deleteStorageKey(storageKeyFromUrl(service.previewImage ?? service.coverImage)),
      deleteStorageKey(storageKeyFromUrl(service.previewVideo)),
    ]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

adminServicesRouter.post('/:id/reorder', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { direction } = reorderAdminServiceSchema.parse(req.body);
    const current = await prisma.service.findUnique({ where: { id: req.params.id } });
    if (!current) throw new HttpError(404, 'SERVICE_NOT_FOUND', 'Услуга не найдена');

    const neighbor = await prisma.service.findFirst({
      where: {
        category: current.category,
        sortOrder: direction === 'up' ? { lt: current.sortOrder } : { gt: current.sortOrder },
      },
      orderBy: { sortOrder: direction === 'up' ? 'desc' : 'asc' },
    });

    if (!neighbor) {
      res.json({ ok: true, moved: false });
      return;
    }

    await prisma.$transaction([
      prisma.service.update({ where: { id: current.id }, data: { sortOrder: neighbor.sortOrder } }),
      prisma.service.update({ where: { id: neighbor.id }, data: { sortOrder: current.sortOrder } }),
    ]);

    res.json({ ok: true, moved: true });
  } catch (err) {
    next(err);
  }
});

adminServicesRouter.post('/:id/duplicate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const current = await prisma.service.findUnique({ where: { id: req.params.id } });
    if (!current) throw new HttpError(404, 'SERVICE_NOT_FOUND', 'Услуга не найдена');

    const baseSlug = `${current.slug}-copy`;
    let slug = baseSlug;
    let suffix = 2;
    while (await prisma.service.findUnique({ where: { slug }, select: { id: true } })) {
      slug = `${baseSlug}-${suffix}`;
      suffix += 1;
    }

    const aggregate = await prisma.service.aggregate({
      where: { category: current.category },
      _max: { sortOrder: true },
    });

    const service = await prisma.service.create({
      data: {
        slug,
        title: `${current.title} copy`,
        shortDesc: current.shortDesc,
        description: current.description,
        category: current.category,
        priceTokens: current.priceTokens,
        costUsd: current.costUsd,
        coverImage: current.coverImage,
        galleryImages: current.galleryImages,
        isActive: false,
        isFeatured: false,
        sortOrder: (aggregate._max.sortOrder ?? 0) + 1,
        aiProvider: current.aiProvider,
        aiModel: current.aiModel,
        aiConfig: current.aiConfig ?? {},
        processingType: current.processingType,
        pipelineConfig: current.pipelineConfig ?? Prisma.JsonNull,
        userInputForm: current.userInputForm ?? Prisma.JsonNull,
        priceCoinsStandard: current.priceCoinsStandard,
        priceCoinsPro: current.priceCoinsPro,
        previewImage: current.previewImage,
        previewVideo: current.previewVideo,
      },
    });

    res.json({ service });
  } catch (err) {
    next(err);
  }
});

adminServicesRouter.post('/:id/test-run', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new HttpError(401, 'UNAUTHORIZED', 'Нужна авторизация');

    const selectedTier = req.body?.selectedTier === 'pro' ? 'pro' : 'standard';
    const userInputs =
      req.body?.userInputs && typeof req.body.userInputs === 'object' && !Array.isArray(req.body.userInputs)
        ? (req.body.userInputs as Record<string, unknown>)
        : {
            photo: 'mock://admin-test/photo.jpg',
            name: 'Test User',
            prompt: 'Mock pipeline test run',
          };

    const service = await prisma.service.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        title: true,
        pipelineConfig: true,
      },
    });
    if (!service) throw new HttpError(404, 'SERVICE_NOT_FOUND', 'Услуга не найдена');
    if (!Array.isArray(service.pipelineConfig)) {
      throw new HttpError(400, 'PIPELINE_CONFIG_MISSING', 'Пайплайн услуги пустой');
    }

    const project = await prisma.project.create({
      data: {
        userId: req.user.id,
        serviceId: service.id,
        mode: 'test-run',
        title: `Test run: ${service.title}`,
        status: 'PENDING',
        progress: 0,
        inputImages: typeof userInputs.photo === 'string' ? [userInputs.photo] : [],
        inputText: 'Admin pipeline test run',
        tokensCost: 0,
        pipelineSnapshot: service.pipelineConfig as Prisma.InputJsonValue,
        selectedTier,
        userInputs: userInputs as Prisma.InputJsonValue,
        stepProgress: [],
      },
      select: { id: true },
    });

    try {
      await queues.addServicePipelineJob({ projectId: project.id, userId: req.user.id, mode: 'test-run' });
    } catch (err) {
      logger.error(`Failed to enqueue service pipeline test-run ${project.id}`, err);
      await prisma.project.update({
        where: { id: project.id },
        data: { status: 'FAILED', errorMessage: 'Queue unavailable', errorCode: 'QUEUE_UNAVAILABLE' },
      });
      throw new HttpError(503, 'QUEUE_UNAVAILABLE', 'Очередь задач недоступна');
    }

    res.status(202).json({ generationId: project.id, status: 'started' });
  } catch (err) {
    next(err);
  }
});
