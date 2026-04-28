import { Router, type NextFunction, type Request, type Response } from 'express';
import { Prisma, prisma, type EpisodeStatus } from '@allvision/database';
import {
  adminScenarioTemplateListQuerySchema,
  characterRoleSchema,
  createAdminScenarioTemplateSchema,
  reorderAdminScenarioTemplateSchema,
  updateAdminScenarioTemplateSchema,
} from '@allvision/shared';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';
import { requireAdmin } from '../../middleware/require-admin';
import { uploadTemplateAssets } from '../../middleware/upload';
import * as fileService from '../../services/file-service';
import { HttpError } from '../../utils/http-error';
import { logger } from '../../utils/logger';

export const adminScenarioTemplatesRouter = Router();

const activeEpisodeStatuses: EpisodeStatus[] = ['PENDING', 'PROCESSING_IMAGE', 'PROCESSING_VIDEO'];
const characterRolesSchema = z.array(characterRoleSchema).min(1);

type TemplateAssets = {
  previewVideo?: Express.Multer.File[];
  previewImage?: Express.Multer.File[];
};

function filesOf(req: Request): TemplateAssets {
  if (!req.files || Array.isArray(req.files)) return {};
  return req.files as TemplateAssets;
}

function firstFile(req: Request, field: keyof TemplateAssets): Express.Multer.File | undefined {
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
    throw new HttpError(400, 'INVALID_AI_CONFIG', 'aiConfig must be a JSON object');
  }
}

function parseCharacterRoles(value: string | undefined): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  try {
    const parsed = JSON.parse(value) as unknown;
    return characterRolesSchema.parse(parsed) as Prisma.InputJsonValue;
  } catch {
    throw new HttpError(400, 'INVALID_CHARACTER_ROLES', 'characterRoles must be a valid JSON array');
  }
}

function parseTags(value: string | undefined): string[] | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (!Array.isArray(parsed) || !parsed.every((tag) => typeof tag === 'string')) {
        throw new Error('tags must be an array of strings');
      }
      return parsed.map((tag) => tag.trim()).filter(Boolean);
    } catch {
      throw new HttpError(400, 'INVALID_TAGS', 'tags must be JSON array or comma-separated list');
    }
  }

  return trimmed
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function storageKeyFromUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.startsWith('template-assets/')) return value;
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
    logger.warn(`Failed to delete scenario template asset ${key}`, err);
  }
}

async function cleanupUploaded(files: Array<{ key: string }>) {
  await Promise.all(files.map((file) => deleteStorageKey(file.key)));
}

function isUniqueConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

adminScenarioTemplatesRouter.use(requireAuth, requireAdmin);

adminScenarioTemplatesRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = adminScenarioTemplateListQuerySchema.parse(req.query);
    const where: Prisma.ScenarioTemplateWhereInput = {
      ...(query.category ? { category: query.category } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.isFeatured !== undefined ? { isFeatured: query.isFeatured } : {}),
      ...(query.search ? { title: { contains: query.search, mode: 'insensitive' } } : {}),
    };

    const [items, total] = await prisma.$transaction([
      prisma.scenarioTemplate.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      prisma.scenarioTemplate.count({ where }),
    ]);

    res.json({ items, total, page: query.page, limit: query.limit });
  } catch (err) {
    next(err);
  }
});

adminScenarioTemplatesRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const template = await prisma.scenarioTemplate.findUnique({ where: { id: req.params.id } });
    if (!template) throw new HttpError(404, 'TEMPLATE_NOT_FOUND', 'Scenario template not found');
    res.json({ template });
  } catch (err) {
    next(err);
  }
});

adminScenarioTemplatesRouter.post('/', uploadTemplateAssets, async (req: Request, res: Response, next: NextFunction) => {
  const uploaded: Array<{ key: string }> = [];
  try {
    const body = createAdminScenarioTemplateSchema.parse(req.body);
    const previewVideo = firstFile(req, 'previewVideo');
    const previewImage = firstFile(req, 'previewImage');
    if (!previewVideo || !previewImage) {
      throw new HttpError(400, 'FILE_REQUIRED', 'previewVideo and previewImage are required');
    }

    const aiConfig = parseAiConfig(body.aiConfig) ?? {};
    const characterRoles = parseCharacterRoles(body.characterRoles)!;
    const tags = parseTags(body.tags) ?? [];

    const preview = await fileService.uploadTemplatePreview(previewVideo.buffer, previewVideo.mimetype);
    uploaded.push(preview);
    const image = await fileService.uploadTemplateImage(previewImage.buffer, previewImage.mimetype);
    uploaded.push(image);

    const aggregate = await prisma.scenarioTemplate.aggregate({ _max: { sortOrder: true } });
    const sortOrder = (aggregate._max.sortOrder ?? 0) + 1;

    try {
      const template = await prisma.scenarioTemplate.create({
        data: {
          slug: body.slug,
          title: body.title,
          shortDesc: body.shortDesc,
          description: body.description,
          category: body.category,
          previewVideo: preview.url,
          previewImage: image.url,
          promptTemplate: body.promptTemplate,
          characterRoles,
          needsScene: body.needsScene,
          recommendedDuration: body.recommendedDuration,
          defaultStyle: body.defaultStyle,
          aiProvider: body.aiProvider,
          aiModel: body.aiModel,
          aiConfig,
          priceTokens: body.priceTokens,
          tags,
          popularityScore: 0,
          isActive: body.isActive,
          isFeatured: body.isFeatured,
          sortOrder,
        },
      });

      res.status(201).json({ template });
    } catch (err) {
      await cleanupUploaded(uploaded);
      if (isUniqueConflict(err)) {
        throw new HttpError(409, 'SLUG_ALREADY_EXISTS', 'Scenario template slug already exists');
      }
      throw err;
    }
  } catch (err) {
    if (uploaded.length > 0) {
      await cleanupUploaded(uploaded);
    }
    next(err);
  }
});

adminScenarioTemplatesRouter.patch('/:id', uploadTemplateAssets, async (req: Request, res: Response, next: NextFunction) => {
  const uploaded: Array<{ key: string }> = [];
  try {
    const template = await prisma.scenarioTemplate.findUnique({ where: { id: req.params.id } });
    if (!template) throw new HttpError(404, 'TEMPLATE_NOT_FOUND', 'Scenario template not found');

    const body = updateAdminScenarioTemplateSchema.parse(req.body);
    const previewVideo = firstFile(req, 'previewVideo');
    const previewImage = firstFile(req, 'previewImage');
    const aiConfig = parseAiConfig(body.aiConfig);
    const characterRoles = parseCharacterRoles(body.characterRoles);
    const tags = parseTags(body.tags);
    const data: Prisma.ScenarioTemplateUpdateInput = {};
    const oldKeys: string[] = [];

    if (body.slug !== undefined) data.slug = body.slug;
    if (body.title !== undefined) data.title = body.title;
    if (body.shortDesc !== undefined) data.shortDesc = body.shortDesc;
    if (body.description !== undefined) data.description = body.description;
    if (body.category !== undefined) data.category = body.category;
    if (body.promptTemplate !== undefined) data.promptTemplate = body.promptTemplate;
    if (characterRoles !== undefined) data.characterRoles = characterRoles;
    if (body.needsScene !== undefined) data.needsScene = body.needsScene;
    if (body.recommendedDuration !== undefined) data.recommendedDuration = body.recommendedDuration;
    if (body.defaultStyle !== undefined) data.defaultStyle = body.defaultStyle;
    if (body.aiProvider !== undefined) data.aiProvider = body.aiProvider;
    if (body.aiModel !== undefined) data.aiModel = body.aiModel;
    if (aiConfig !== undefined) data.aiConfig = aiConfig;
    if (body.priceTokens !== undefined) data.priceTokens = body.priceTokens;
    if (tags !== undefined) data.tags = tags;
    if (body.isActive !== undefined) data.isActive = body.isActive;
    if (body.isFeatured !== undefined) data.isFeatured = body.isFeatured;

    if (previewVideo) {
      const preview = await fileService.uploadTemplatePreview(previewVideo.buffer, previewVideo.mimetype);
      uploaded.push(preview);
      data.previewVideo = preview.url;
      const oldKey = storageKeyFromUrl(template.previewVideo);
      if (oldKey) oldKeys.push(oldKey);
    }

    if (previewImage) {
      const image = await fileService.uploadTemplateImage(previewImage.buffer, previewImage.mimetype);
      uploaded.push(image);
      data.previewImage = image.url;
      const oldKey = storageKeyFromUrl(template.previewImage);
      if (oldKey) oldKeys.push(oldKey);
    }

    try {
      const updated = await prisma.scenarioTemplate.update({
        where: { id: template.id },
        data,
      });
      await Promise.all(oldKeys.map((key) => deleteStorageKey(key)));
      res.json({ template: updated });
    } catch (err) {
      await cleanupUploaded(uploaded);
      if (isUniqueConflict(err)) {
        throw new HttpError(409, 'SLUG_ALREADY_EXISTS', 'Scenario template slug already exists');
      }
      throw err;
    }
  } catch (err) {
    if (uploaded.length > 0) {
      await cleanupUploaded(uploaded);
    }
    next(err);
  }
});

adminScenarioTemplatesRouter.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const template = await prisma.scenarioTemplate.findUnique({ where: { id: req.params.id } });
    if (!template) throw new HttpError(404, 'TEMPLATE_NOT_FOUND', 'Scenario template not found');

    const activeEpisodes = await prisma.episode.count({
      where: {
        templateId: template.id,
        status: { in: activeEpisodeStatuses },
      },
    });
    if (activeEpisodes > 0) {
      throw new HttpError(409, 'TEMPLATE_IN_USE', 'Scenario template is used by an active episode');
    }

    await prisma.scenarioTemplate.delete({ where: { id: template.id } });
    await Promise.all([
      deleteStorageKey(storageKeyFromUrl(template.previewVideo)),
      deleteStorageKey(storageKeyFromUrl(template.previewImage)),
    ]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

adminScenarioTemplatesRouter.post('/:id/reorder', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { direction } = reorderAdminScenarioTemplateSchema.parse(req.body);
    const current = await prisma.scenarioTemplate.findUnique({ where: { id: req.params.id } });
    if (!current) throw new HttpError(404, 'TEMPLATE_NOT_FOUND', 'Scenario template not found');

    const neighbor = await prisma.scenarioTemplate.findFirst({
      where: {
        sortOrder: direction === 'up' ? { lt: current.sortOrder } : { gt: current.sortOrder },
      },
      orderBy: { sortOrder: direction === 'up' ? 'desc' : 'asc' },
    });

    if (!neighbor) {
      res.json({ ok: true, moved: false });
      return;
    }

    await prisma.$transaction([
      prisma.scenarioTemplate.update({ where: { id: current.id }, data: { sortOrder: neighbor.sortOrder } }),
      prisma.scenarioTemplate.update({ where: { id: neighbor.id }, data: { sortOrder: current.sortOrder } }),
    ]);

    res.json({ ok: true, moved: true });
  } catch (err) {
    next(err);
  }
});
