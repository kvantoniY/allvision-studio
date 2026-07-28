import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { Prisma, prisma } from '@allvision/database';
import {
  ACADEMY_ASSET_KIND_LABELS,
  ACADEMY_GENERATION_MODELS,
  ACADEMY_LIBRARY_SCOPES,
  ACADEMY_MEDIA_ASSET_KINDS,
  academyGenerationSchema,
  canMutateAcademyLibraryAsset,
  canPromoteAcademyAsset,
  canReadAcademyLibraryAsset,
  estimateAcademyGenerationCostUsd,
  estimateAcademyCostUsd,
  generationKindToAsset,
  hasAllPhotoConsents,
  promoteAcademyAssetSchema,
  updateAcademyAssetSchema,
  type AcademyAssetDto,
  type AcademyGenerationChildDto,
  type AcademyGenerationInput,
  type AcademyGenerationStatusDto,
  type AcademyLibraryActorRole,
  type AcademyLibraryScope,
} from '@allvision/shared';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/require-role';
import { uploadAcademyImage } from '../middleware/upload';
import { addAcademyGenerationJob } from '../queues';
import { getStorageProvider } from '../providers';
import { deleteChildAssetFile, readChildAsset } from '../services/child-photo-storage';
import * as fileService from '../services/file-service';
import { HttpError } from '../utils/http-error';
import { logger } from '../utils/logger';
import { resolveWorkspacePath } from '../utils/paths';

export const academyMaterialsRouter = Router();

academyMaterialsRouter.use(requireAuth, requireRole('TEACHER', 'METHODIST'));

const listSchema = z.object({
  kind: z.string().trim().min(1).optional(),
  childId: z.string().trim().min(1).optional(),
  ownerUserId: z.string().trim().min(1).optional(),
  search: z.string().trim().min(1).max(160).optional(),
  tag: z.string().trim().min(1).max(60).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

function actorRole(req: Request): AcademyLibraryActorRole {
  return req.user!.role;
}

function staticUrlForKey(key: string | null | undefined) {
  if (!key) return null;
  const base = (process.env.PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/+$/, '');
  return `${base}/static/${key.replace(/^\/+/, '')}`;
}

function privateFileUrl(id: string) {
  return `/api/academy/materials/library/child/${id}/file`;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function safeJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function parseResultAssetIds(value: Prisma.JsonValue | null): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const id = (item as Record<string, Prisma.JsonValue>).assetId;
    return typeof id === 'string' ? [id] : [];
  });
}

async function isTeacherAssigned(userId: string, childId: string): Promise<boolean> {
  const lesson = await prisma.lesson.findFirst({
    where: { childId, teacher: { userId } },
    select: { id: true },
  });
  return Boolean(lesson);
}

async function loadChildForActor(req: Request, childId: string) {
  const child = await prisma.childProfile.findFirst({
    where: { id: childId, deletedAt: null },
    include: {
      consents: true,
      characterProfile: { select: { status: true, references: { select: { id: true } } } },
    },
  });
  if (!child) throw new HttpError(404, 'CHILD_NOT_FOUND', 'Ребёнок не найден');
  const assigned = req.user!.role === 'TEACHER'
    ? await isTeacherAssigned(req.user!.id, child.id)
    : false;
  const canRead = canReadAcademyLibraryAsset({
    scope: 'child',
    actorRole: actorRole(req),
    actorUserId: req.user!.id,
    childParentId: child.parentId,
    teacherAssigned: assigned,
  });
  if (!canRead) throw new HttpError(403, 'CHILD_LIBRARY_FORBIDDEN', 'Нет доступа к персональной библиотеке ребёнка');
  return { child, assigned };
}

function toMediaDto(
  req: Request,
  asset: {
    id: string;
    kind: string;
    title: string;
    description: string | null;
    tags: string[];
    publicUrl: string;
    thumbnailKey: string | null;
    mimeType: string;
    fileSize: number;
    width: number | null;
    height: number | null;
    durationSec: number | null;
    ownerUserId: string | null;
    owner: { name: string | null; email: string } | null;
    generationModel: string | null;
    generationPrompt: string | null;
    generationCostUsd: number;
    createdAt: Date;
  },
): AcademyAssetDto {
  const scope: AcademyLibraryScope = asset.ownerUserId ? 'teacher' : 'shared';
  const canEdit = canMutateAcademyLibraryAsset({
    scope,
    actorRole: actorRole(req),
    actorUserId: req.user!.id,
    ownerUserId: asset.ownerUserId,
  });
  return {
    id: asset.id,
    scope,
    kind: asset.kind,
    kindLabel: ACADEMY_ASSET_KIND_LABELS[asset.kind as keyof typeof ACADEMY_ASSET_KIND_LABELS] ?? asset.kind,
    title: asset.title,
    description: asset.description,
    tags: asset.tags,
    fileUrl: asset.publicUrl,
    thumbnailUrl: staticUrlForKey(asset.thumbnailKey),
    mimeType: asset.mimeType,
    fileSize: asset.fileSize,
    width: asset.width,
    height: asset.height,
    durationSec: asset.durationSec,
    ownerUserId: asset.ownerUserId,
    ownerName: asset.owner ? asset.owner.name ?? asset.owner.email : null,
    childId: null,
    childName: null,
    generationModel: asset.generationModel,
    generationPrompt: asset.generationPrompt,
    generationCostUsd: asset.generationCostUsd,
    sourceRefIds: [],
    createdAt: asset.createdAt.toISOString(),
    canEdit,
    canPromote: canPromoteAcademyAsset(scope, actorRole(req)),
    dragData: {
      type: 'academy-asset',
      assetId: asset.id,
      scope,
      kind: asset.kind,
      fileUrl: asset.publicUrl,
      mimeType: asset.mimeType,
    },
  };
}

function toChildDto(
  req: Request,
  asset: {
    id: string;
    kind: string;
    title: string;
    description: string | null;
    tags: string[];
    mimeType: string;
    fileSize: number;
    width: number | null;
    height: number | null;
    durationSec: number | null;
    createdById: string | null;
    generationModel: string | null;
    generationPrompt: string | null;
    generationCostUsd: number;
    sourceRefIds: string[];
    createdAt: Date;
    child: { id: string; name: string; parentId: string };
  },
  teacherAssigned: boolean,
): AcademyAssetDto {
  const fileUrl = privateFileUrl(asset.id);
  const canEdit = canMutateAcademyLibraryAsset({
    scope: 'child',
    actorRole: actorRole(req),
    actorUserId: req.user!.id,
    childParentId: asset.child.parentId,
    teacherAssigned,
    createdById: asset.createdById,
  });
  return {
    id: asset.id,
    scope: 'child',
    kind: asset.kind,
    kindLabel: ACADEMY_ASSET_KIND_LABELS[asset.kind as keyof typeof ACADEMY_ASSET_KIND_LABELS] ?? asset.kind,
    title: asset.title,
    description: asset.description,
    tags: asset.tags,
    fileUrl,
    thumbnailUrl: null,
    mimeType: asset.mimeType,
    fileSize: asset.fileSize,
    width: asset.width,
    height: asset.height,
    durationSec: asset.durationSec,
    ownerUserId: asset.createdById,
    ownerName: null,
    childId: asset.child.id,
    childName: asset.child.name,
    generationModel: asset.generationModel,
    generationPrompt: asset.generationPrompt,
    generationCostUsd: asset.generationCostUsd,
    sourceRefIds: asset.sourceRefIds,
    createdAt: asset.createdAt.toISOString(),
    canEdit,
    canPromote: false,
    dragData: {
      type: 'academy-asset',
      assetId: asset.id,
      scope: 'child',
      kind: asset.kind,
      fileUrl,
      mimeType: asset.mimeType,
    },
  };
}

// === Данные панели ===

academyMaterialsRouter.get('/models', (_req: Request, res: Response) => {
  const sample = {
    quality: 'medium' as const,
    resolution: '1K' as const,
    aspectRatio: '1:1' as const,
    count: 1,
    transparentBackground: false,
  };
  res.json({
    models: ACADEMY_GENERATION_MODELS.map((model) => ({
      slug: model,
      estimatedCostUsd: estimateAcademyGenerationCostUsd({ model, ...sample }),
    })),
  });
});

academyMaterialsRouter.get('/children', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const where: Prisma.ChildProfileWhereInput = req.user!.role === 'ADMIN'
      ? { deletedAt: null }
      : req.user!.role === 'TEACHER'
        ? { deletedAt: null, lessons: { some: { teacher: { userId: req.user!.id } } } }
        : { id: '__methodist_has_no_personal_access__' };
    const children = await prisma.childProfile.findMany({
      where,
      orderBy: { name: 'asc' },
      take: 200,
      select: { id: true, name: true, characterProfile: { select: { status: true } } },
    });
    const items: AcademyGenerationChildDto[] = children.map((child) => ({
      id: child.id,
      name: child.name,
      characterStatus: child.characterProfile?.status ?? null,
    }));
    res.json({ items });
  } catch (error) {
    next(error);
  }
});

academyMaterialsRouter.post('/estimate', (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = academyGenerationSchema.parse(req.body);
    const normalized = input.operation === 'transparent-background'
      ? { ...input, transparentBackground: true }
      : input;
    res.json({ estimatedCostUsd: estimateAcademyCostUsd(normalized) });
  } catch (error) {
    next(error);
  }
});

// === Запуск и статус генерации ===

academyMaterialsRouter.post('/generate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = academyGenerationSchema.parse(req.body);
    const input: AcademyGenerationInput = parsed.operation === 'transparent-background'
      ? { ...parsed, transparentBackground: true }
      : parsed;
    const estimatedCostUsd = estimateAcademyCostUsd(input);
    if (estimatedCostUsd > input.maxCostUsd) {
      throw new HttpError(
        400,
        'GENERATION_COST_LIMIT',
        `Оценка $${estimatedCostUsd.toFixed(2)} превышает лимит $${input.maxCostUsd.toFixed(2)}`,
      );
    }

    if (input.topicId) {
      const topic = await prisma.topic.findUnique({ where: { id: input.topicId }, select: { aiBudgetUsd: true } });
      if (!topic) throw new HttpError(404, 'TOPIC_NOT_FOUND', 'Тема не найдена');
      if (topic.aiBudgetUsd > 0 && estimatedCostUsd > topic.aiBudgetUsd) {
        throw new HttpError(400, 'TOPIC_AI_BUDGET_EXCEEDED', 'Оценка превышает AI-бюджет темы');
      }
    }

    const target = generationKindToAsset(input.kind);
    if (target.scope === 'child') {
      const { child } = await loadChildForActor(req, input.childId!);
      if (!hasAllPhotoConsents(child.consents)) {
        throw new HttpError(403, 'CONSENTS_REQUIRED', 'Для генерации нужны действующие согласия родителя');
      }
      if (child.characterProfile?.status !== 'APPROVED') {
        throw new HttpError(409, 'CHARACTER_NOT_APPROVED', 'Сначала утвердите AI-персонажа ребёнка');
      }
      if (input.characterReferenceIds.length > 0) {
        const available = new Set(child.characterProfile.references.map((ref) => ref.id));
        if (unique(input.characterReferenceIds).some((id) => !available.has(id))) {
          throw new HttpError(404, 'CHARACTER_REFERENCE_NOT_FOUND', 'Референс персонажа не найден');
        }
      }
    }

    if (input.referenceAssetIds.length > 0) {
      const referenceAssets = await prisma.mediaAsset.findMany({
        where: { id: { in: unique(input.referenceAssetIds) }, isActive: true },
        select: { id: true, ownerUserId: true, kind: true },
      });
      if (referenceAssets.length !== unique(input.referenceAssetIds).length) {
        throw new HttpError(404, 'REFERENCE_ASSET_NOT_FOUND', 'Референс из библиотеки не найден');
      }
      for (const asset of referenceAssets) {
        if (!(ACADEMY_MEDIA_ASSET_KINDS as readonly string[]).includes(asset.kind)) {
          throw new HttpError(400, 'REFERENCE_ASSET_INVALID', 'Референс не относится к библиотеке Academy');
        }
        const scope: AcademyLibraryScope = asset.ownerUserId ? 'teacher' : 'shared';
        if (!canReadAcademyLibraryAsset({
          scope,
          actorRole: actorRole(req),
          actorUserId: req.user!.id,
          ownerUserId: asset.ownerUserId,
        })) {
          throw new HttpError(403, 'REFERENCE_ASSET_FORBIDDEN', 'Нет доступа к выбранному референсу');
        }
      }
    }

    const project = await prisma.project.create({
      data: {
        userId: req.user!.id,
        mode: 'academy-generation',
        title: `Материал Academy: ${input.title}`,
        status: 'PENDING',
        progress: 0,
        inputImages: [],
        inputText: input.prompt,
        tokensCost: 0,
        userInputs: safeJson({ academyGeneration: input, estimatedCostUsd }),
        pipelineSnapshot: safeJson([{ blockSlug: 'academy-generation', params: input }]),
      },
    });

    try {
      await addAcademyGenerationJob({
        projectId: project.id,
        requestedById: req.user!.id,
        input,
        estimatedCostUsd,
      });
    } catch (error) {
      logger.error(`Failed to enqueue academy-generation project ${project.id}`, error);
      await prisma.project.update({
        where: { id: project.id },
        data: { status: 'FAILED', errorCode: 'QUEUE_UNAVAILABLE', errorMessage: 'Очередь генерации недоступна' },
      });
      throw new HttpError(503, 'QUEUE_UNAVAILABLE', 'Сервис генерации временно недоступен');
    }

    const response: AcademyGenerationStatusDto = {
      projectId: project.id,
      status: 'PENDING',
      progress: 0,
      errorMessage: null,
      estimatedCostUsd,
      assetIds: [],
    };
    res.status(202).json({ generation: response });
  } catch (error) {
    next(error);
  }
});

academyMaterialsRouter.get('/generations/:projectId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const project = await prisma.project.findFirst({
      where: {
        id: req.params.projectId,
        mode: 'academy-generation',
        ...(req.user!.role === 'ADMIN' ? {} : { userId: req.user!.id }),
      },
      select: { id: true, status: true, progress: true, errorMessage: true, userInputs: true, resultAssets: true },
    });
    if (!project) throw new HttpError(404, 'GENERATION_NOT_FOUND', 'Генерация не найдена');
    const raw = project.userInputs && typeof project.userInputs === 'object' && !Array.isArray(project.userInputs)
      ? project.userInputs as Record<string, Prisma.JsonValue>
      : {};
    const estimatedCostUsd = typeof raw.estimatedCostUsd === 'number' ? raw.estimatedCostUsd : 0;
    const response: AcademyGenerationStatusDto = {
      projectId: project.id,
      status: project.status,
      progress: project.progress,
      errorMessage: project.errorMessage,
      estimatedCostUsd,
      assetIds: parseResultAssetIds(project.resultAssets),
    };
    res.json({ generation: response });
  } catch (error) {
    next(error);
  }
});

// === Списки трёх библиотек ===

academyMaterialsRouter.get('/library/:scope', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const scope = z.enum(ACADEMY_LIBRARY_SCOPES).parse(req.params.scope);
    const query = listSchema.parse(req.query);
    if (scope === 'child') {
      if (!query.childId) throw new HttpError(400, 'CHILD_ID_REQUIRED', 'Выберите ребёнка');
      const { assigned } = await loadChildForActor(req, query.childId);
      const items = await prisma.childAsset.findMany({
        where: {
          childId: query.childId,
          ...(query.kind ? { kind: query.kind } : {}),
          ...(query.tag ? { tags: { has: query.tag } } : {}),
          ...(query.search ? {
            OR: [
              { title: { contains: query.search, mode: 'insensitive' } },
              { description: { contains: query.search, mode: 'insensitive' } },
            ],
          } : {}),
        },
        include: { child: { select: { id: true, name: true, parentId: true } } },
        orderBy: { createdAt: 'desc' },
        take: query.limit,
      });
      res.json({ items: items.map((item) => toChildDto(req, item, assigned)) });
      return;
    }

    const isAdmin = req.user!.role === 'ADMIN';
    const ownerWhere = scope === 'shared'
      ? { ownerUserId: null }
      : isAdmin
        ? { ownerUserId: query.ownerUserId ? query.ownerUserId : { not: null } }
        : { ownerUserId: req.user!.id };
    const items = await prisma.mediaAsset.findMany({
      where: {
        ...ownerWhere,
        isActive: true,
        kind: query.kind
          ? query.kind
          : { in: [...ACADEMY_MEDIA_ASSET_KINDS] },
        ...(query.tag ? { tags: { has: query.tag } } : {}),
        ...(query.search ? {
          OR: [
            { title: { contains: query.search, mode: 'insensitive' } },
            { description: { contains: query.search, mode: 'insensitive' } },
          ],
        } : {}),
      },
      include: { owner: { select: { name: true, email: true } } },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      take: query.limit,
    });
    res.json({ items: items.map((item) => toMediaDto(req, item)) });
  } catch (error) {
    next(error);
  }
});

async function loadMediaForMutation(req: Request, scope: 'shared' | 'teacher', id: string) {
  const asset = await prisma.mediaAsset.findFirst({
    where: {
      id,
      kind: { in: [...ACADEMY_MEDIA_ASSET_KINDS] },
      ...(scope === 'shared' ? { ownerUserId: null } : { ownerUserId: { not: null } }),
    },
  });
  if (!asset) throw new HttpError(404, 'ACADEMY_ASSET_NOT_FOUND', 'Материал не найден');
  if (!canMutateAcademyLibraryAsset({
    scope,
    actorRole: actorRole(req),
    actorUserId: req.user!.id,
    ownerUserId: asset.ownerUserId,
  })) {
    throw new HttpError(403, 'ACADEMY_ASSET_FORBIDDEN', 'Нет прав на изменение материала');
  }
  return asset;
}

async function loadChildAssetForMutation(req: Request, id: string) {
  const asset = await prisma.childAsset.findUnique({
    where: { id },
    include: { child: { select: { id: true, parentId: true } } },
  });
  if (!asset) throw new HttpError(404, 'CHILD_ASSET_NOT_FOUND', 'Материал ребёнка не найден');
  const assigned = req.user!.role === 'TEACHER' ? await isTeacherAssigned(req.user!.id, asset.childId) : false;
  if (!canMutateAcademyLibraryAsset({
    scope: 'child',
    actorRole: actorRole(req),
    actorUserId: req.user!.id,
    childParentId: asset.child.parentId,
    teacherAssigned: assigned,
    createdById: asset.createdById,
  })) {
    throw new HttpError(403, 'CHILD_ASSET_FORBIDDEN', 'Нет прав на изменение материала ребёнка');
  }
  return asset;
}

academyMaterialsRouter.patch('/library/:scope/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const scope = z.enum(ACADEMY_LIBRARY_SCOPES).parse(req.params.scope);
    const data = updateAcademyAssetSchema.parse(req.body);
    if (scope === 'child') {
      const asset = await loadChildAssetForMutation(req, req.params.id);
      await prisma.childAsset.update({ where: { id: asset.id }, data });
    } else {
      const asset = await loadMediaForMutation(req, scope, req.params.id);
      await prisma.mediaAsset.update({ where: { id: asset.id }, data });
    }
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

academyMaterialsRouter.delete('/library/:scope/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const scope = z.enum(ACADEMY_LIBRARY_SCOPES).parse(req.params.scope);
    if (scope === 'child') {
      const asset = await loadChildAssetForMutation(req, req.params.id);
      await prisma.childAsset.delete({ where: { id: asset.id } });
      await deleteChildAssetFile(asset.storageKey);
    } else {
      const asset = await loadMediaForMutation(req, scope, req.params.id);
      await prisma.mediaAsset.delete({ where: { id: asset.id } });
      await fileService.deleteFile(asset.storageKey).catch(() => undefined);
      if (asset.thumbnailKey) await fileService.deleteFile(asset.thumbnailKey).catch(() => undefined);
    }
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

academyMaterialsRouter.get('/library/child/:id/file', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const asset = await prisma.childAsset.findUnique({
      where: { id: req.params.id },
      include: { child: { select: { id: true, parentId: true } } },
    });
    if (!asset) throw new HttpError(404, 'CHILD_ASSET_NOT_FOUND', 'Материал ребёнка не найден');
    const assigned = req.user!.role === 'TEACHER' ? await isTeacherAssigned(req.user!.id, asset.childId) : false;
    const canRead = canReadAcademyLibraryAsset({
      scope: 'child',
      actorRole: actorRole(req),
      actorUserId: req.user!.id,
      childParentId: asset.child.parentId,
      teacherAssigned: assigned,
    });
    if (!canRead) throw new HttpError(403, 'CHILD_ASSET_FORBIDDEN', 'Нет доступа к материалу ребёнка');
    const buffer = await readChildAsset(asset.storageKey).catch(() => {
      throw new HttpError(404, 'CHILD_ASSET_FILE_MISSING', 'Файл материала недоступен');
    });
    res.setHeader('Content-Type', asset.mimeType);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('Content-Disposition', 'inline');
    res.send(buffer);
  } catch (error) {
    next(error);
  }
});

async function readPublicAsset(asset: { storageKey: string; publicUrl: string }): Promise<Buffer> {
  const root = resolveWorkspacePath(process.env.UPLOADS_DIR ?? './uploads');
  const target = path.resolve(root, asset.storageKey.replace(/^[/\\]+/, ''));
  if (target.startsWith(root + path.sep)) {
    const local = await fs.readFile(target).catch(() => null);
    if (local) return local;
  }
  const response = await fetch(asset.publicUrl);
  if (!response.ok) throw new HttpError(502, 'ASSET_COPY_FAILED', 'Не удалось скопировать файл материала');
  return Buffer.from(await response.arrayBuffer());
}

function extensionForMime(mimeType: string): string {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'audio/mpeg') return 'mp3';
  if (mimeType === 'audio/wav') return 'wav';
  if (mimeType === 'video/mp4') return 'mp4';
  if (mimeType === 'video/webm') return 'webm';
  if (mimeType === 'video/quicktime') return 'mov';
  return 'jpg';
}

// === Загрузка своей картинки в библиотеку (без AI) ===
const uploadKindSchema = z.enum([...ACADEMY_MEDIA_ASSET_KINDS] as [string, ...string[]]);

academyMaterialsRouter.post('/upload', uploadAcademyImage, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const file = req.file;
    if (!file) throw new HttpError(400, 'FILE_REQUIRED', 'Прикрепите файл');
    const kind = uploadKindSchema.parse((req.body?.kind as string) || 'academy-background');
    const title = String(req.body?.title || file.originalname || 'Загруженный материал').slice(0, 160);

    const key = path.posix.join('academy', 'library', req.user!.id, `${crypto.randomUUID()}.${extensionForMime(file.mimetype)}`);
    const uploaded = await getStorageProvider().upload({ key, body: file.buffer, contentType: file.mimetype });

    const asset = await prisma.mediaAsset.create({
      data: {
        kind,
        groupCode: 'academy',
        title,
        tags: ['uploaded'],
        ownerUserId: req.user!.id,
        storageKey: uploaded.key,
        publicUrl: uploaded.url,
        mimeType: file.mimetype,
        fileSize: file.size,
        isActive: true,
        generationModel: null,
        generationPrompt: null,
        generationCostUsd: 0,
      },
      include: { owner: { select: { name: true, email: true } } },
    });
    res.status(201).json({ asset: toMediaDto(req, asset) });
  } catch (err) {
    next(err);
  }
});

academyMaterialsRouter.post('/promote', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = promoteAcademyAssetSchema.parse(req.body);
    if (body.sourceScope === 'child') {
      // Явный API-инвариант: даже ADMIN не может опубликовать производное с внешностью ребёнка.
      throw new HttpError(
        400,
        'CHILD_ASSET_PROMOTION_FORBIDDEN',
        'Персональные материалы ребёнка нельзя переносить в общую библиотеку',
      );
    }
    if (!canPromoteAcademyAsset('teacher', actorRole(req))) {
      throw new HttpError(403, 'PROMOTION_FORBIDDEN', 'Только администратор может пополнять общую библиотеку');
    }
    const source = await prisma.mediaAsset.findFirst({
      where: { id: body.assetId, ownerUserId: { not: null }, kind: { in: [...ACADEMY_MEDIA_ASSET_KINDS] } },
    });
    if (!source) throw new HttpError(404, 'ACADEMY_ASSET_NOT_FOUND', 'Материал преподавателя не найден');
    const buffer = await readPublicAsset(source);
    const key = path.posix.join('academy', 'library', 'shared', `${crypto.randomUUID()}.${extensionForMime(source.mimeType)}`);
    const uploaded = await getStorageProvider().upload({ key, body: buffer, contentType: source.mimeType });
    const aggregate = await prisma.mediaAsset.aggregate({
      where: { ownerUserId: null, kind: source.kind },
      _max: { sortOrder: true },
    });
    const promoted = await prisma.mediaAsset.create({
      data: {
        kind: source.kind,
        groupCode: 'academy',
        title: source.title,
        description: source.description,
        tags: unique([...source.tags, 'shared', 'promoted']),
        ownerUserId: null,
        parentAssetId: source.id,
        storageKey: uploaded.key,
        publicUrl: uploaded.url,
        thumbnailKey: null,
        durationSec: source.durationSec,
        width: source.width,
        height: source.height,
        frameCount: source.frameCount,
        fileSize: buffer.length,
        mimeType: source.mimeType,
        isActive: true,
        sortOrder: (aggregate._max.sortOrder ?? 0) + 10,
        generationModel: source.generationModel,
        generationPrompt: source.generationPrompt,
        generationCostUsd: source.generationCostUsd,
        generationParams: source.generationParams === null ? Prisma.JsonNull : source.generationParams,
      },
      include: { owner: { select: { name: true, email: true } } },
    });
    res.status(201).json({ asset: toMediaDto(req, promoted) });
  } catch (error) {
    next(error);
  }
});
