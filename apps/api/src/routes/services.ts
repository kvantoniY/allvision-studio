import crypto from 'node:crypto';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { Prisma, prisma } from '@allvision/database';
import { generationExpiresAt, userInputFormSchema, type UserInputFieldInput } from '@allvision/shared';
import { requireAuth } from '../middleware/auth';
import { uploadServiceLaunchInputs } from '../middleware/upload';
import { HttpError } from '../utils/http-error';
import { logger } from '../utils/logger';
import * as fileService from '../services/file-service';
import * as queues from '../queues';

export const servicesRouter = Router();

async function listActiveCategoryCodes(): Promise<string[]> {
  const items = await prisma.serviceCategoryDef.findMany({
    where: { isActive: true },
    select: { code: true },
  });
  return items.map((item) => item.code);
}

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
  previewMode: true,
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

function fieldVisibleForData(field: UserInputFieldInput, data: Record<string, unknown>): boolean {
  if (!field.visibleWhen) return true;
  return data[field.visibleWhen.field] === field.visibleWhen.value;
}

function selectedDurationPrice(fields: UserInputFieldInput[], data: Record<string, unknown>): number | null {
  const field = fields.find(
    (item) => fieldVisibleForData(item, data)
      && item.type === 'duration'
      && (item.durationPrices ?? []).some((price) => Number.isFinite(price.priceCoins) && price.priceCoins > 0),
  );
  if (!field) return null;

  const options = field.durationOptions && field.durationOptions.length > 0 ? field.durationOptions : [5, 8, 10];
  const duration = Number(data[field.id] ?? field.defaultDuration ?? options[0]);
  if (!Number.isFinite(duration)) return null;

  const match = (field.durationPrices ?? []).find((item) => item.duration === duration);
  return match && Number.isFinite(match.priceCoins) && match.priceCoins > 0 ? match.priceCoins : null;
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
    where: { id: { in: ids }, isActive: true, ownerUserId: null },
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

// A field is required if it is statically required OR its requiredWhen condition matches another field's value.
function fieldRequired(field: UserInputFieldInput, data: Record<string, unknown>): boolean {
  if (field.requiredWhen) {
    const current = data[field.requiredWhen.field];
    if (current === field.requiredWhen.value) return true;
  }
  return field.required === true;
}

function assetReferenceId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^asset:([a-zA-Z0-9_-]+)$/);
  return match?.[1] ?? null;
}

type UserInputAsset = {
  ref: string;
  publicUrl: string;
  title: string;
};

async function resolvePhotoInputAsset(field: UserInputFieldInput, value: unknown, userId: string): Promise<UserInputAsset | null> {
  if (requiredMissing(value)) return null;
  const id = assetReferenceId(value);
  if (!id) {
    throw new HttpError(400, 'INVALID_MEDIA_ASSET', `${field.id} must be selected from Studio or uploaded as a file`);
  }

  const asset = await prisma.mediaAsset.findFirst({
    where: { id, isActive: true },
    select: { id: true, kind: true, title: true, publicUrl: true, ownerUserId: true, mimeType: true },
  });
  if (!asset || (asset.ownerUserId && asset.ownerUserId !== userId)) {
    throw new HttpError(404, 'MEDIA_ASSET_NOT_FOUND', 'Media asset not found');
  }
  if (!asset.mimeType.startsWith('image/')) {
    throw new HttpError(400, 'INVALID_MEDIA_ASSET', `${field.id} must be an image`);
  }

  const studioAllowed =
    asset.ownerUserId === userId &&
    asset.kind === 'user-avatar' &&
    (field.type === 'avatar' || field.allowStudioAvatars !== false);
  const systemAllowed =
    !asset.ownerUserId &&
    asset.kind === 'preview-image' &&
    field.type === 'photo' &&
    field.allowSystemLibrary === true;

  if (!studioAllowed && !systemAllowed) {
    throw new HttpError(400, 'MEDIA_ASSET_NOT_ALLOWED', `${field.id} cannot use this media asset`);
  }

  return { ref: `asset:${asset.id}`, publicUrl: asset.publicUrl, title: asset.title };
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
    const activeCategories = await listActiveCategoryCodes();
    const categoryFilter = category && activeCategories.includes(category)
      ? { category }
      : { category: { in: activeCategories } };
    const services = await prisma.service.findMany({
      where: {
        isActive: true,
        pipelineConfig: { not: Prisma.JsonNull },
        ...categoryFilter,
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
    const activeCategories = await listActiveCategoryCodes();
    const service = await prisma.service.findFirst({
      where: {
        slug: req.params.slug,
        isActive: true,
        category: { in: activeCategories },
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
      const activeCategories = await listActiveCategoryCodes();
      const service = await prisma.service.findFirst({
        where: {
          slug: req.params.slug,
          isActive: true,
          category: { in: activeCategories },
          pipelineConfig: { not: Prisma.JsonNull },
        },
        select: serviceForLaunchSelect,
      });
      if (!service) throw new HttpError(404, 'SERVICE_NOT_FOUND', 'Service not found');

      const fields = formFields(service.userInputForm);
      const steps = pipelineSteps(service.pipelineConfig);
      const data = parseDataField(req.body.data ?? req.body);
      const photoFields = fields.filter((field) => field.type === 'photo');
      const audioFields = fields.filter((field) => field.type === 'audio');
      const videoFields = fields.filter((field) => field.type === 'video');
      const fileMap = filesByField(
        req,
        new Set([
          ...photoFields.map((field) => field.id),
          ...audioFields.map((field) => field.id),
          ...videoFields.map((field) => field.id),
        ]),
      );
      const tierField = fields.find((field) => field.type === 'tier');
      const userId = req.user!.id;

      // Tier selection: when the form has a tier field, honor the customer's Standard/Pro choice.
      // Without a tier field, services keep the P9 Pro-default behaviour.
      let tierValue: 'standard' | 'pro' = 'pro';
      if (tierField) {
        const raw = data[tierField.id];
        tierValue = raw === 'standard' ? 'standard' : 'pro';
        data[tierField.id] = tierValue;
      }

      const assetInputs = new Map<string, UserInputAsset>();
      for (const field of fields) {
        if (field.type === 'photo') {
          const hasFile = fileMap.has(field.id);
          const value = data[field.id];
          if (fieldRequired(field, data) && !hasFile && requiredMissing(value)) {
            throw new HttpError(400, 'REQUIRED_FIELD_MISSING', `${field.id} is required`);
          }
          if (!hasFile && !requiredMissing(value)) {
            const asset = await resolvePhotoInputAsset(field, value, userId);
            if (asset) assetInputs.set(field.id, asset);
          }
          continue;
        }

        if (field.type === 'video') {
          if (fieldRequired(field, data) && !fileMap.has(field.id)) {
            throw new HttpError(400, 'REQUIRED_FIELD_MISSING', `${field.id} is required`);
          }
          continue;
        }

        const value = data[field.id];
        if (fieldRequired(field, data) && requiredMissing(value)) {
          throw new HttpError(400, 'REQUIRED_FIELD_MISSING', `${field.id} is required`);
        }
        if (requiredMissing(value)) continue;
        if (field.type === 'avatar') {
          const asset = await resolvePhotoInputAsset(field, value, userId);
          if (asset) assetInputs.set(field.id, asset);
        }
        if (field.type === 'text' || field.type === 'textarea') {
          validateTextField(field, value);
        }
        if (field.type === 'select') {
          validateSelectField(field, value);
        }
        if (field.type === 'media-select' || field.type === 'music-select') {
          await validateMediaSelectField(field, value);
        }
        if (field.type === 'duration') {
          if (typeof value !== 'string' && typeof value !== 'number') {
            throw new HttpError(400, 'INVALID_FIELD_VALUE', `${field.id} must be a number`);
          }
          const num = Number(value);
          if (!Number.isFinite(num) || num <= 0 || num > 60) {
            throw new HttpError(400, 'INVALID_DURATION', `${field.id} duration is invalid`);
          }
          data[field.id] = num;
        }
        if (field.type === 'aspect_ratio') {
          const allowed = new Set(field.aspectOptions ?? ['auto', '9:16', '16:9', '1:1']);
          if (typeof value !== 'string' || !allowed.has(value as never)) {
            throw new HttpError(400, 'INVALID_FIELD_VALUE', `${field.id} aspect ratio is invalid`);
          }
        }
        if (field.type === 'slides') {
          if (!Array.isArray(value)) {
            throw new HttpError(400, 'INVALID_FIELD_VALUE', `${field.id} must be an array of slides`);
          }
          const max = field.maxSlides ?? 10;
          if (value.length < 1 || value.length > max) {
            throw new HttpError(400, 'INVALID_SLIDES', `${field.id} must have between 1 and ${max} slides`);
          }
          // A slide is { text, withPhoto }. Legacy string slides are treated as "with photo".
          const maxLen = field.maxLength ?? 600;
          const slides = value.map((item) => {
            if (typeof item === 'string') return { text: item.slice(0, maxLen), withPhoto: true };
            if (item && typeof item === 'object' && !Array.isArray(item)) {
              const record = item as Record<string, unknown>;
              const text = typeof record.text === 'string' ? record.text.slice(0, maxLen) : '';
              const withPhoto = record.withPhoto === undefined ? true : record.withPhoto === true;
              return { text, withPhoto };
            }
            return { text: '', withPhoto: true };
          });
          data[field.id] = slides;
        }
        if (field.type === 'checkbox') {
          data[field.id] = value === true || value === 'true';
        }
        if (field.type === 'multiselect') {
          if (!Array.isArray(value)) {
            throw new HttpError(400, 'INVALID_FIELD_VALUE', `${field.id} must be an array`);
          }
          const allowed = new Set((field.options ?? []).filter((option) => !option.disabled).map((option) => option.value));
          const picked = value.filter((item): item is string => typeof item === 'string' && allowed.has(item));
          if (field.required && picked.length < 1) {
            throw new HttpError(400, 'REQUIRED_FIELD_MISSING', `${field.id} is required`);
          }
          data[field.id] = picked;
        }
      }

      const projectId = crypto.randomUUID();
      const userInputs: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(data)) {
        userInputs[key] = value;
      }
      for (const [fieldId, asset] of assetInputs) {
        userInputs[fieldId] = asset.ref;
      }

      for (const field of [...photoFields, ...audioFields, ...videoFields]) {
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

      // music-select: convert asset:<id> placeholder to public URL of background-music MediaAsset
      for (const field of fields) {
        if (field.type !== 'music-select') continue;
        const value = userInputs[field.id];
        if (typeof value !== 'string' || value.trim().length === 0) continue;
        const asset = await prisma.mediaAsset.findFirst({
          where: { id: value, kind: field.mediaKind ?? 'background-music', isActive: true, ownerUserId: null },
          select: { publicUrl: true },
        });
        if (asset) {
          userInputs[field.id] = asset.publicUrl;
        }
      }

      // Price follows the selected tier: Standard -> priceCoinsStandard, Pro -> priceCoinsPro.
      let tokensCost = tierValue === 'standard'
        ? (service.priceCoinsStandard ?? service.priceCoinsPro ?? service.priceTokens)
        : (service.priceCoinsPro ?? service.priceCoinsStandard ?? service.priceTokens);

      const durationPrice = selectedDurationPrice(fields, data);
      if (durationPrice !== null) {
        tokensCost = durationPrice;
      }

      // Checkbox-controlled price. Two dimensions:
      //   checked   = the checkbox value (e.g. "animate photo")
      //   secondary = whether the referenced photo field (e.g. person2) is filled (=> 2 people)
      // 4 combos: 1 person / 2 people  ×  no animation / with animation.
      const pricedCheckbox = fields.find(
        (field) => field.type === 'checkbox'
          && (field.priceCoinsChecked !== undefined || field.priceCoinsUnchecked !== undefined),
      );
      if (pricedCheckbox) {
        const checked = data[pricedCheckbox.id] === true;
        const secId = pricedCheckbox.secondaryField;
        const secondaryPresent = !!secId
          && typeof userInputs[secId] === 'string'
          && (userInputs[secId] as string).trim() !== '';
        let next: number | undefined;
        if (secondaryPresent) {
          next = checked ? pricedCheckbox.priceCoinsCheckedSecondary : pricedCheckbox.priceCoinsUncheckedSecondary;
          // Fall back to the primary prices if the secondary ones are not configured.
          if (typeof next !== 'number') next = checked ? pricedCheckbox.priceCoinsChecked : pricedCheckbox.priceCoinsUnchecked;
        } else {
          next = checked ? pricedCheckbox.priceCoinsChecked : pricedCheckbox.priceCoinsUnchecked;
        }
        if (typeof next === 'number' && next > 0) tokensCost = next;
      }

      // Slides services are priced per slide: the tier price is the price of ONE slide.
      const slidesField = fields.find((field) => field.type === 'slides');
      if (slidesField) {
        const slidesValue = data[slidesField.id];
        const slideCount = Array.isArray(slidesValue) ? Math.max(1, slidesValue.length) : 1;
        tokensCost *= slideCount;
      }

      // Priced multiselect (e.g. product-card outputs): total = sum of selected options' priceCoins.
      const pricedMultiselect = fields.find(
        (field) => field.type === 'multiselect',
      );
      if (pricedMultiselect) {
        const pickedValue = data[pricedMultiselect.id];
        const pickedSet = new Set(Array.isArray(pickedValue) ? pickedValue.filter((item): item is string => typeof item === 'string') : []);
        let sum = 0;
        for (const option of pricedMultiselect.options ?? []) {
          if (!option.disabled && pickedSet.has(option.value)) {
            sum += option.priceCoins ?? 0;
          }
        }
        if (sum > 0) tokensCost = sum;
      }
      const inputImages = photoFields
        .map((field) => assetInputs.get(field.id)?.publicUrl ?? userInputs[field.id])
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
              expiresAt: generationExpiresAt(),
            },
            select: {
              id: true,
              status: true,
              progress: true,
              tokensCost: true,
              createdAt: true,
              expiresAt: true,
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
