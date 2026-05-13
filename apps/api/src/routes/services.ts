import crypto from 'node:crypto';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { Prisma, prisma, type ServiceCategory } from '@allvision/database';
import { userInputFormSchema, type UserInputFieldInput } from '@allvision/shared';
import { requireAuth } from '../middleware/auth';
import { uploadServiceLaunchInputs } from '../middleware/upload';
import { HttpError } from '../utils/http-error';
import { logger } from '../utils/logger';
import * as fileService from '../services/file-service';
import * as queues from '../queues';

export const servicesRouter = Router();

const giftCategories: ServiceCategory[] = [
  'NOSTALGIA',
  'TRENDS_MEMES',
  'KIDS_HEROES',
  'SPECIAL_OCCASIONS',
];

const publicServiceSelect = {
  id: true,
  slug: true,
  title: true,
  description: true,
  shortDesc: true,
  category: true,
  priceTokens: true,
  priceCoinsStandard: true,
  priceCoinsPro: true,
  coverImage: true,
  galleryImages: true,
  previewImage: true,
  previewVideo: true,
  isFeatured: true,
  processingType: true,
  sortOrder: true,
} as const;

const publicServiceDetailSelect = {
  ...publicServiceSelect,
  userInputForm: true,
} as const;

const serviceForLaunchSelect = {
  id: true,
  slug: true,
  title: true,
  isActive: true,
  category: true,
  priceTokens: true,
  priceCoinsStandard: true,
  priceCoinsPro: true,
  pipelineConfig: true,
  userInputForm: true,
} as const;

function parseBoolean(value: unknown): boolean | undefined {
  if (value === 'true' || value === true) return true;
  if (value === 'false' || value === false) return false;
  return undefined;
}

function parseDataField(value: unknown): Record<string, unknown> {
  if (value === undefined) return {};
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value !== 'string') {
    throw new HttpError(400, 'INVALID_DATA', 'Invalid data field');
  }
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('data must be an object');
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new HttpError(400, 'INVALID_DATA', 'Invalid JSON in data field');
  }
}

function collectAssetReferenceIds(value: unknown, ids = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    value.forEach((item) => collectAssetReferenceIds(item, ids));
    return ids;
  }

  if (value && typeof value === 'object') {
    Object.values(value).forEach((item) => collectAssetReferenceIds(item, ids));
    return ids;
  }

  if (typeof value === 'string') {
    const match = value.match(/^asset:([a-zA-Z0-9_-]+)$/);
    if (match) ids.add(match[1]);
  }
  return ids;
}

function replaceAssetReferences(value: unknown, urls: Map<string, string>): unknown {
  if (Array.isArray(value)) return value.map((item) => replaceAssetReferences(item, urls));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, replaceAssetReferences(item, urls)]),
    );
  }
  if (typeof value !== 'string') return value;
  const match = value.match(/^asset:([a-zA-Z0-9_-]+)$/);
  if (!match) return value;
  return urls.get(match[1]) ?? value;
}

async function resolveAssetReferencesForSnapshot(value: unknown): Promise<unknown> {
  const ids = Array.from(collectAssetReferenceIds(value));
  if (ids.length === 0) return value;
  const assets = await prisma.mediaAsset.findMany({
    where: { id: { in: ids }, isActive: true },
    select: { id: true, publicUrl: true },
  });
  if (assets.length === 0) return value;
  return replaceAssetReferences(value, new Map(assets.map((asset) => [asset.id, asset.publicUrl])));
}

function requestFiles(req: Request): Express.Multer.File[] {
  return Array.isArray(req.files) ? req.files : [];
}

function filesByField(req: Request, allowedFields: Set<string>) {
  const map = new Map<string, Express.Multer.File>();
  for (const file of requestFiles(req)) {
    if (!allowedFields.has(file.fieldname)) {
      throw new HttpError(400, 'UNKNOWN_FILE_FIELD', `Unknown file field: ${file.fieldname}`);
    }
    if (map.has(file.fieldname)) {
      throw new HttpError(400, 'TOO_MANY_FILES', `Only one file is allowed for ${file.fieldname}`);
    }
    map.set(file.fieldname, file);
  }
  return map;
}

function requiredMissing(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
}

function formFields(value: unknown): UserInputFieldInput[] {
  try {
    return userInputFormSchema.parse(value);
  } catch {
    throw new HttpError(400, 'SERVICE_FORM_INVALID', 'Service userInputForm is invalid');
  }
}

function pipelineSteps(value: unknown): Array<{ id: string; blockSlug: string }> {
  if (!Array.isArray(value)) {
    throw new HttpError(400, 'PIPELINE_CONFIG_MISSING', 'Service pipelineConfig is empty');
  }
  return value.map((step, index) => {
    if (!step || typeof step !== 'object' || Array.isArray(step)) {
      throw new HttpError(400, 'PIPELINE_CONFIG_INVALID', `Pipeline step ${index + 1} is invalid`);
    }
    const raw = step as Record<string, unknown>;
    if (typeof raw.id !== 'string' || typeof raw.blockSlug !== 'string') {
      throw new HttpError(400, 'PIPELINE_CONFIG_INVALID', `Pipeline step ${index + 1} is invalid`);
    }
    return { id: raw.id, blockSlug: raw.blockSlug };
  });
}

function validateTextField(field: UserInputFieldInput, value: unknown) {
  if (typeof value !== 'string') {
    throw new HttpError(400, 'INVALID_FIELD_VALUE', `${field.id} must be a string`);
  }
  if (field.maxLength && value.length > field.maxLength) {
    throw new HttpError(400, 'FIELD_TOO_LONG', `${field.id} is too long`);
  }
}

function validateSelectField(field: UserInputFieldInput, value: unknown) {
  if (typeof value !== 'string') {
    throw new HttpError(400, 'INVALID_FIELD_VALUE', `${field.id} must be a string`);
  }
  const allowed = new Set((field.options ?? []).map((option) => option.value));
  if (!allowed.has(value)) {
    throw new HttpError(400, 'INVALID_SELECT_VALUE', `${field.id} has invalid value`);
  }
}

async function validateMediaSelectField(field: UserInputFieldInput, value: unknown) {
  if (typeof value !== 'string') {
    throw new HttpError(400, 'INVALID_FIELD_VALUE', `${field.id} must be a media asset id`);
  }
  const asset = await prisma.mediaAsset.findFirst({
    where: {
      id: value,
      kind: field.mediaKind,
      isActive: true,
    },
    select: { id: true },
  });
  if (!asset) {
    throw new HttpError(400, 'INVALID_MEDIA_ASSET', `${field.id} has invalid media asset`);
  }
}

function isPrismaNotFound(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025';
}

async function deleteUploadedInputs(inputs: Array<{ key: string }>) {
  await Promise.all(
    inputs.map((input) =>
      fileService.deleteFile(input.key).catch((err) => {
        logger.warn(`Failed to delete service launch input ${input.key}`, err);
      }),
    ),
  );
}

servicesRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const category = typeof req.query.category === 'string' ? req.query.category : undefined;
    const featured = parseBoolean(req.query.featured);
    const services = await prisma.service.findMany({
      where: {
        isActive: true,
        category: { in: giftCategories },
        pipelineConfig: { not: Prisma.JsonNull },
        ...(category && giftCategories.includes(category as ServiceCategory)
          ? { category: category as ServiceCategory }
          : {}),
        ...(featured === true ? { isFeatured: true } : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: publicServiceSelect,
    });
    res.json({ services });
  } catch (err) {
    next(err);
  }
});

servicesRouter.get('/:slug', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const service = await prisma.service.findFirst({
      where: {
        slug: req.params.slug,
        isActive: true,
        category: { in: giftCategories },
        pipelineConfig: { not: Prisma.JsonNull },
      },
      select: publicServiceDetailSelect,
    });
    if (!service) throw new HttpError(404, 'SERVICE_NOT_FOUND', 'Service not found');
    res.json({ service });
  } catch (err) {
    next(err);
  }
});

servicesRouter.post(
  '/:slug/launch',
  requireAuth,
  uploadServiceLaunchInputs,
  async (req: Request, res: Response, next: NextFunction) => {
    const uploadedInputs: Array<{ key: string; url: string }> = [];
    try {
      const service = await prisma.service.findFirst({
        where: {
          slug: req.params.slug,
          isActive: true,
          category: { in: giftCategories },
          pipelineConfig: { not: Prisma.JsonNull },
        },
        select: serviceForLaunchSelect,
      });
      if (!service) throw new HttpError(404, 'SERVICE_NOT_FOUND', 'Service not found');

      const fields = formFields(service.userInputForm);
      const steps = pipelineSteps(service.pipelineConfig);
      const data = parseDataField(req.body.data ?? req.body);
      const photoFields = fields.filter((field) => field.type === 'photo');
      const fileMap = filesByField(req, new Set(photoFields.map((field) => field.id)));
      const tierField = fields.find((field) => field.type === 'tier');
      if (!tierField) throw new HttpError(400, 'TIER_FIELD_REQUIRED', 'Tier field is required');

      const tierValue = data[tierField.id];
      if (tierValue !== 'standard' && tierValue !== 'pro') {
        throw new HttpError(400, 'INVALID_TIER', 'Tier must be standard or pro');
      }

      for (const field of fields) {
        if (field.type === 'photo') {
          if (field.required && !fileMap.has(field.id)) {
            throw new HttpError(400, 'REQUIRED_FIELD_MISSING', `${field.id} is required`);
          }
          continue;
        }

        const value = data[field.id];
        if (field.required && requiredMissing(value)) {
          throw new HttpError(400, 'REQUIRED_FIELD_MISSING', `${field.id} is required`);
        }
        if (requiredMissing(value)) continue;
        if (field.type === 'text' || field.type === 'textarea' || field.type === 'avatar') {
          validateTextField(field, value);
        }
        if (field.type === 'select') {
          validateSelectField(field, value);
        }
        if (field.type === 'media-select') {
          await validateMediaSelectField(field, value);
        }
      }

      const userId = req.user!.id;
      const projectId = crypto.randomUUID();
      const userInputs: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(data)) {
        userInputs[key] = value;
      }

      for (const field of photoFields) {
        const file = fileMap.get(field.id);
        if (!file) continue;
        if (field.maxSizeMb && file.size > field.maxSizeMb * 1024 * 1024) {
          throw new HttpError(413, 'FILE_TOO_LARGE', `${field.id} is too large`);
        }
        if (field.allowedFormats?.length) {
          const ext = file.originalname.split('.').pop()?.toLowerCase();
          if (!ext || !field.allowedFormats.map((item) => item.toLowerCase()).includes(ext)) {
            throw new HttpError(400, 'UNSUPPORTED_FORMAT', `${field.id} has unsupported format`);
          }
        }
        const uploaded = await fileService.uploadUserInput(
          userId,
          projectId,
          field.id,
          file.buffer,
          file.mimetype,
        );
        uploadedInputs.push({ key: uploaded.key, url: uploaded.url });
        userInputs[field.id] = uploaded.url;
      }

      const tokensCost =
        tierValue === 'pro'
          ? service.priceCoinsPro ?? service.priceTokens
          : service.priceCoinsStandard ?? service.priceTokens;
      const inputImages = photoFields
        .map((field) => userInputs[field.id])
        .filter((value): value is string => typeof value === 'string');
      const stepProgress = steps.map((step) => ({
        stepId: step.id,
        blockSlug: step.blockSlug,
        status: 'pending',
        progress: 0,
      }));
      const pipelineSnapshot = await resolveAssetReferencesForSnapshot(service.pipelineConfig);

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
              id: projectId,
              userId,
              serviceId: service.id,
              title: service.title,
              status: 'PENDING',
              progress: 0,
              inputImages,
              inputText: `${service.title} (${tierValue})`,
              tokensCost,
              pipelineSnapshot: pipelineSnapshot as Prisma.InputJsonValue,
              selectedTier: tierValue,
              userInputs: userInputs as Prisma.InputJsonValue,
              stepProgress: stepProgress as Prisma.InputJsonValue,
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
              reason: 'service_launch',
              amount: -tokensCost,
              balanceAfter: user.tokenBalance,
              refId: created.id,
              userId,
            },
          });

          return created;
        });
      } catch (err) {
        await deleteUploadedInputs(uploadedInputs);
        if (isPrismaNotFound(err)) {
          throw new HttpError(402, 'INSUFFICIENT_TOKENS', 'Insufficient tokens');
        }
        throw err;
      }

      try {
        await queues.addServicePipelineJob({ projectId: project.id, userId });
      } catch (err) {
        logger.error(`Failed to enqueue service pipeline project ${project.id}`, err);
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
        throw new HttpError(503, 'QUEUE_UNAVAILABLE', 'Queue unavailable');
      }

      res.status(201).json({ project });
    } catch (err) {
      if (uploadedInputs.length > 0) {
        await deleteUploadedInputs(uploadedInputs);
      }
      next(err);
    }
  },
);
