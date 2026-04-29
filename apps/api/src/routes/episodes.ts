import { Router, type NextFunction, type Request, type Response } from 'express';
import { EpisodeStatus, Prisma, prisma, type ScenarioTemplate } from '@allvision/database';
import {
  createEpisodeSchema,
  EPISODE_REGENERATION_PRICE_TOKENS,
  EPISODE_WATERMARK_REMOVAL_PRICE_TOKENS,
  listEpisodesQuerySchema,
} from '@allvision/shared';
import { requireAuth } from '../middleware/auth';
import { episodeCreateLimiter } from '../middleware/rate-limit';
import * as fileService from '../services/file-service';
import { HttpError } from '../utils/http-error';
import { logger } from '../utils/logger';
import * as queues from '../queues';

export const episodesRouter = Router();

type ScenarioRole = {
  role: string;
  required: boolean;
  label: string;
};

const busyStatuses: EpisodeStatus[] = [
  EpisodeStatus.PENDING,
  EpisodeStatus.PROCESSING_IMAGE,
  EpisodeStatus.PROCESSING_VIDEO,
];

const episodeListInclude = {
  template: { select: { id: true, slug: true, title: true, category: true } },
  characters: {
    include: {
      character: {
        select: {
          id: true,
          name: true,
          type: true,
          referenceImages: true,
          primaryImageId: true,
          status: true,
        },
      },
    },
  },
} as const;

const episodeDetailInclude = {
  template: true,
  scene: true,
  characters: { include: { character: true } },
} as const;

function isPrismaNotFound(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025';
}

function parseRoles(template: ScenarioTemplate): ScenarioRole[] {
  const raw = Array.isArray(template.characterRoles as unknown)
    ? (template.characterRoles as unknown[])
    : [];
  return raw
    .filter((role): role is Record<string, unknown> => Boolean(role && typeof role === 'object'))
    .map((role) => ({
      role: String(role.role ?? 'main'),
      required: Boolean(role.required),
      label: String(role.label ?? role.role ?? 'Герой'),
    }));
}

function validateRoleAssignment(roles: ScenarioRole[], characterIds: string[]) {
  const uniqueIds = new Set(characterIds);
  if (uniqueIds.size !== characterIds.length) {
    throw new HttpError(400, 'CHARACTER_ROLES_MISMATCH', 'Duplicate character assignments are not supported');
  }

  const requiredCount = roles.filter((role) => role.required).length || 1;
  if (characterIds.length < requiredCount || characterIds.length > Math.max(requiredCount, roles.length)) {
    throw new HttpError(400, 'CHARACTER_ROLES_MISMATCH', 'Selected characters do not match template roles');
  }
}

function storageKeyFromUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.startsWith('results/')) return value;
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
    logger.warn(`Failed to delete episode asset ${key}`, err);
  }
}

async function markEpisodeQueueUnavailable(episodeId: string) {
  await prisma.$transaction(async (tx) => {
    const episode = await tx.episode.findUnique({
      where: { id: episodeId },
      select: { id: true, userId: true },
    });
    if (!episode) return;

    await tx.episode.update({
      where: { id: episodeId },
      data: { status: EpisodeStatus.FAILED, errorMessage: 'Queue unavailable' },
    });

    const spending = await tx.tokenTransaction.findFirst({
      where: {
        userId: episode.userId,
        refId: episodeId,
        reason: 'spending',
        amount: { lt: 0 },
      },
      orderBy: { createdAt: 'desc' },
      select: { amount: true },
    });
    const refundAmount = Math.abs(spending?.amount ?? 0);
    if (refundAmount <= 0) return;

    const user = await tx.user.update({
      where: { id: episode.userId },
      data: { tokenBalance: { increment: refundAmount } },
      select: { tokenBalance: true },
    });

    await tx.tokenTransaction.create({
      data: {
        userId: episode.userId,
        amount: refundAmount,
        reason: 'refund',
        refId: episodeId,
        balanceAfter: user.tokenBalance,
      },
    });
  });
}

async function enqueueEpisode(episode: { id: string; userId: string }) {
  await queues.addEpisodeJob({ episodeId: episode.id, userId: episode.userId });
}

episodesRouter.use(requireAuth);

episodesRouter.post('/', episodeCreateLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = createEpisodeSchema.parse(req.body);
    const userId = req.user!.id;

    const template = await prisma.scenarioTemplate.findFirst({
      where: { id: body.templateId, isActive: true },
    });
    if (!template) {
      throw new HttpError(404, 'TEMPLATE_NOT_FOUND', 'Template not found');
    }

    const roles = parseRoles(template);
    validateRoleAssignment(roles, body.characterIds);

    const characters = await prisma.character.findMany({
      where: {
        id: { in: body.characterIds },
        userId,
        status: 'READY',
      },
    });
    if (characters.length !== body.characterIds.length) {
      throw new HttpError(400, 'INVALID_CHARACTERS', 'Characters must belong to the user and be READY');
    }

    let sceneId: string | undefined;
    if (template.needsScene && !body.sceneId) {
      throw new HttpError(400, 'SCENE_REQUIRED', 'Scene is required for this template');
    }
    if (body.sceneId) {
      const scene = await prisma.scene.findFirst({
        where: { id: body.sceneId, userId },
        select: { id: true },
      });
      if (!scene) throw new HttpError(400, 'SCENE_NOT_FOUND', 'Scene not found');
      sceneId = scene.id;
    }

    const tokensCost = template.priceTokens;
    let episode;
    try {
      episode = await prisma.$transaction(async (tx) => {
        const user = await tx.user.update({
          where: { id: userId, tokenBalance: { gte: tokensCost } },
          data: { tokenBalance: { decrement: tokensCost } },
          select: { tokenBalance: true },
        });

        const created = await tx.episode.create({
          data: {
            userId,
            templateId: template.id,
            sceneId,
            title: template.title,
            status: EpisodeStatus.PENDING,
            progress: 0,
            customScenario: body.customScenario || null,
            durationSeconds: body.durationSeconds ?? template.recommendedDuration,
            style: body.style ?? template.defaultStyle,
            aspectRatio: body.aspectRatio ?? '9:16',
            tokensCost,
          },
          include: episodeDetailInclude,
        });

        await tx.episodeCharacter.createMany({
          data: body.characterIds.map((characterId, index) => ({
            episodeId: created.id,
            characterId,
            role: roles[index]?.role ?? 'main',
          })),
        });

        await tx.tokenTransaction.create({
          data: {
            userId,
            amount: -tokensCost,
            reason: 'spending',
            refId: created.id,
            balanceAfter: user.tokenBalance,
          },
        });

        return tx.episode.findUniqueOrThrow({
          where: { id: created.id },
          include: episodeDetailInclude,
        });
      });
    } catch (err) {
      if (isPrismaNotFound(err)) {
        throw new HttpError(402, 'INSUFFICIENT_TOKENS', 'Insufficient tokens');
      }
      throw err;
    }

    try {
      await enqueueEpisode(episode);
    } catch (err) {
      logger.error(`Failed to enqueue episode ${episode.id}`, err);
      await markEpisodeQueueUnavailable(episode.id).catch((queueErr) => {
        logger.error(`Failed to refund episode ${episode.id} after queue error`, queueErr);
      });
      throw new HttpError(503, 'QUEUE_UNAVAILABLE', 'Queue unavailable');
    }

    res.status(201).json({ episode });
  } catch (err) {
    next(err);
  }
});

episodesRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = listEpisodesQuerySchema.parse(req.query);
    const where: Prisma.EpisodeWhereInput = {
      userId: req.user!.id,
      ...(query.status ? { status: query.status } : {}),
      ...(query.templateId ? { templateId: query.templateId } : {}),
    };

    const [items, total] = await prisma.$transaction([
      prisma.episode.findMany({
        where,
        include: episodeListInclude,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      prisma.episode.count({ where }),
    ]);

    res.json({ items, total, page: query.page, limit: query.limit });
  } catch (err) {
    next(err);
  }
});

episodesRouter.get('/:id/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const episode = await prisma.episode.findFirst({
      where: { id: req.params.id, userId: req.user!.id },
      select: {
        id: true,
        status: true,
        progress: true,
        resultImage: true,
        resultVideo: true,
        resultThumbnail: true,
        errorMessage: true,
        completedAt: true,
        watermarkRemoved: true,
      },
    });
    if (!episode) throw new HttpError(404, 'EPISODE_NOT_FOUND', 'Episode not found');
    res.json(episode);
  } catch (err) {
    next(err);
  }
});

episodesRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const episode = await prisma.episode.findFirst({
      where: { id: req.params.id, userId: req.user!.id },
      include: episodeDetailInclude,
    });
    if (!episode) throw new HttpError(404, 'EPISODE_NOT_FOUND', 'Episode not found');
    res.json({ episode });
  } catch (err) {
    next(err);
  }
});

episodesRouter.post('/:id/regenerate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const episode = await prisma.episode.findFirst({
      where: { id: req.params.id, userId: req.user!.id },
      select: { id: true, userId: true, status: true },
    });
    if (!episode) throw new HttpError(404, 'EPISODE_NOT_FOUND', 'Episode not found');
    if (episode.status !== EpisodeStatus.COMPLETED && episode.status !== EpisodeStatus.FAILED) {
      throw new HttpError(409, 'EPISODE_NOT_REGENERATABLE', 'Episode cannot be regenerated now');
    }

    let updated;
    try {
      updated = await prisma.$transaction(async (tx) => {
        const user = await tx.user.update({
          where: { id: req.user!.id, tokenBalance: { gte: EPISODE_REGENERATION_PRICE_TOKENS } },
          data: { tokenBalance: { decrement: EPISODE_REGENERATION_PRICE_TOKENS } },
          select: { tokenBalance: true },
        });

        const regenerated = await tx.episode.update({
          where: { id: episode.id },
          data: {
            status: EpisodeStatus.PENDING,
            progress: 0,
            resultImage: null,
            resultVideo: null,
            resultThumbnail: null,
            completedAt: null,
            errorMessage: null,
            aiProviderJobId: null,
            aiProviderLogs: Prisma.DbNull,
            watermarkRemoved: false,
          },
          include: episodeDetailInclude,
        });

        await tx.tokenTransaction.create({
          data: {
            userId: req.user!.id,
            amount: -EPISODE_REGENERATION_PRICE_TOKENS,
            reason: 'spending',
            refId: episode.id,
            balanceAfter: user.tokenBalance,
          },
        });

        return regenerated;
      });
    } catch (err) {
      if (isPrismaNotFound(err)) {
        throw new HttpError(402, 'INSUFFICIENT_TOKENS', 'Insufficient tokens');
      }
      throw err;
    }

    try {
      await enqueueEpisode(updated);
    } catch (err) {
      logger.error(`Failed to enqueue regenerated episode ${episode.id}`, err);
      await markEpisodeQueueUnavailable(episode.id).catch((queueErr) => {
        logger.error(`Failed to refund regenerated episode ${episode.id} after queue error`, queueErr);
      });
      throw new HttpError(503, 'QUEUE_UNAVAILABLE', 'Queue unavailable');
    }

    res.json({ episode: updated });
  } catch (err) {
    next(err);
  }
});

episodesRouter.post('/:id/remove-watermark', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const episode = await prisma.episode.findFirst({
      where: { id: req.params.id, userId: req.user!.id },
      select: { id: true, status: true, watermarkRemoved: true },
    });
    if (!episode) throw new HttpError(404, 'EPISODE_NOT_FOUND', 'Episode not found');
    if (episode.status !== EpisodeStatus.COMPLETED) {
      throw new HttpError(409, 'EPISODE_NOT_COMPLETED', 'Episode is not completed');
    }
    if (episode.watermarkRemoved) {
      throw new HttpError(409, 'WATERMARK_ALREADY_REMOVED', 'Watermark is already removed');
    }

    let updated;
    try {
      updated = await prisma.$transaction(async (tx) => {
        const user = await tx.user.update({
          where: { id: req.user!.id, tokenBalance: { gte: EPISODE_WATERMARK_REMOVAL_PRICE_TOKENS } },
          data: { tokenBalance: { decrement: EPISODE_WATERMARK_REMOVAL_PRICE_TOKENS } },
          select: { tokenBalance: true },
        });

        const watermarked = await tx.episode.update({
          where: { id: episode.id },
          data: { watermarkRemoved: true },
          include: episodeDetailInclude,
        });

        await tx.tokenTransaction.create({
          data: {
            userId: req.user!.id,
            amount: -EPISODE_WATERMARK_REMOVAL_PRICE_TOKENS,
            reason: 'watermark_removal',
            refId: episode.id,
            balanceAfter: user.tokenBalance,
          },
        });

        return watermarked;
      });
    } catch (err) {
      if (isPrismaNotFound(err)) {
        throw new HttpError(402, 'INSUFFICIENT_TOKENS', 'Insufficient tokens');
      }
      throw err;
    }

    res.json({ episode: updated });
  } catch (err) {
    next(err);
  }
});

episodesRouter.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const episode = await prisma.episode.findFirst({
      where: { id: req.params.id, userId: req.user!.id },
      select: {
        id: true,
        status: true,
        resultImage: true,
        resultVideo: true,
        resultThumbnail: true,
      },
    });
    if (!episode) throw new HttpError(404, 'EPISODE_NOT_FOUND', 'Episode not found');
    if (busyStatuses.includes(episode.status)) {
      throw new HttpError(409, 'EPISODE_BUSY', 'Episode is still processing');
    }

    await prisma.$transaction([
      prisma.episodeCharacter.deleteMany({ where: { episodeId: episode.id } }),
      prisma.abuseReport.deleteMany({ where: { episodeId: episode.id } }),
      prisma.episode.delete({ where: { id: episode.id } }),
    ]);

    await Promise.all([
      deleteStorageKey(storageKeyFromUrl(episode.resultImage)),
      deleteStorageKey(storageKeyFromUrl(episode.resultVideo)),
      deleteStorageKey(storageKeyFromUrl(episode.resultThumbnail)),
    ]);

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
