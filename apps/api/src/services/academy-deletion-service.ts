import crypto from 'node:crypto';
import {
  Prisma,
  prisma,
  type DeletionScope,
  type Prisma as PrismaTypes,
} from '@allvision/database';
import type { AcademyDeletionJobData, DeletionLogDto } from '@allvision/shared';
import { addAcademyDeletionJob } from '../queues';
import { HttpError } from '../utils/http-error';
import { collectProjectStorageKeys, storageKeyFromTemporaryUrl } from './generation-delete-service';

type Tx = PrismaTypes.TransactionClient;

function deletionHash(value: string): string {
  const salt = process.env.DELETION_HASH_SALT ?? process.env.JWT_ACCESS_SECRET ?? 'allvision-academy-local';
  return crypto.createHash('sha256').update(`${salt}:${value}`).digest('hex');
}

function safeJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function unique(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function keyFromUrl(value: string | null | undefined, userId: string): string | null {
  return value ? storageKeyFromTemporaryUrl(value, userId) : null;
}

function toDto(log: {
  id: string;
  scope: DeletionScope;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  errorMessage: string | null;
  createdAt: Date;
  completedAt: Date | null;
}): DeletionLogDto {
  return {
    id: log.id,
    scope: log.scope,
    status: log.status,
    errorMessage: log.errorMessage,
    createdAt: log.createdAt.toISOString(),
    completedAt: log.completedAt?.toISOString() ?? null,
  };
}

async function anonymizeChild(tx: Tx, childId: string) {
  const child = await tx.childProfile.findUnique({
    where: { id: childId },
    include: {
      characterProfile: { select: { id: true } },
      assets: { select: { generationProjectId: true } },
    },
  });
  if (!child || child.deletedAt) {
    return { childHash: deletionHash(childId), projectsSanitized: 0, publicStorageKeys: [] };
  }
  const childHash = deletionHash(child.id);
  const sceneProjects = await tx.lessonInstanceSceneAsset.findMany({
    where: { instance: { lesson: { childId: child.id } } },
    select: { projectId: true },
  });
  const characterProjects = child.characterProfile
    ? await tx.project.findMany({
        where: { mode: 'character-profile', inputText: child.characterProfile.id },
        select: { id: true },
      })
    : [];
  const projectIds = unique([
    ...child.assets.map((asset) => asset.generationProjectId),
    ...sceneProjects.map((item) => item.projectId),
    ...characterProjects.map((item) => item.id),
  ]);
  const generationProjects = projectIds.length > 0
    ? await tx.project.findMany({
        where: { id: { in: projectIds } },
        select: {
          id: true, userId: true, mode: true, aiProviderLogs: true, inputImages: true,
          resultImage: true, resultVideo: true, resultThumbnail: true, resultAssets: true,
          userInputs: true, stepProgress: true,
        },
      })
    : [];
  const publicStorageKeys = unique([
    keyFromUrl(child.avatar, child.parentId),
    ...generationProjects.flatMap(collectProjectStorageKeys),
  ]);

  const [threads, reports, lessonChat, instances, photos, assets, consents] = await Promise.all([
    tx.thread.count({ where: { childId: child.id } }),
    tx.lessonReport.count({ where: { lesson: { childId: child.id } } }),
    tx.lessonChatMessage.count({ where: { lesson: { childId: child.id } } }),
    tx.lessonInstance.count({ where: { lesson: { childId: child.id } } }),
    tx.childPhoto.count({ where: { childId: child.id } }),
    tx.childAsset.count({ where: { childId: child.id } }),
    tx.consent.count({ where: { childId: child.id } }),
  ]);

  await tx.thread.deleteMany({ where: { childId: child.id } });
  await tx.lessonReport.deleteMany({ where: { lesson: { childId: child.id } } });
  await tx.lessonChatMessage.deleteMany({ where: { lesson: { childId: child.id } } });
  await tx.lessonInstance.deleteMany({ where: { lesson: { childId: child.id } } });
  await tx.childRewardItem.deleteMany({ where: { childId: child.id } });
  await tx.childAchievement.deleteMany({ where: { childId: child.id } });
  await tx.characterProfile.deleteMany({ where: { childId: child.id } });
  await tx.childAsset.deleteMany({ where: { childId: child.id } });
  await tx.childPhoto.deleteMany({ where: { childId: child.id } });
  await tx.consent.deleteMany({ where: { childId: child.id } });
  await tx.accessLog.updateMany({
    where: { childId: child.id },
    data: { resourceId: `deleted:${childHash}` },
  });
  if (projectIds.length > 0) {
    await tx.project.updateMany({
      where: { id: { in: projectIds } },
      data: {
        title: 'Удалённый детский проект',
        status: 'FAILED',
        progress: 0,
        inputImages: [],
        inputText: null,
        resultImage: null,
        resultVideo: null,
        resultThumbnail: null,
        resultAssets: Prisma.JsonNull,
        errorMessage: 'Персональные данные удалены по запросу',
        errorCode: 'DATA_DELETED',
        aiProviderJobId: null,
        aiProviderLogs: Prisma.JsonNull,
        pipelineSnapshot: Prisma.JsonNull,
        userInputs: Prisma.JsonNull,
        stepProgress: Prisma.JsonNull,
      },
    });
  }
  await tx.childProfile.update({
    where: { id: child.id },
    data: {
      name: `Удалённый профиль ${childHash.slice(0, 8)}`,
      birthDate: null,
      avatar: null,
      notes: null,
      deletedAt: new Date(),
      anonymizedAt: new Date(),
      anonymizedKey: childHash,
    },
  });
  return {
    childHash,
    projectsSanitized: projectIds.length,
    publicStorageKeys,
    removed: { threads, reports, lessonChat, instances, photos, assets, consents },
  };
}

async function enqueueAndRead(logId: string, jobData: AcademyDeletionJobData): Promise<DeletionLogDto> {
  try {
    await addAcademyDeletionJob(jobData, { jobId: logId });
  } catch (error) {
    await prisma.deletionLog.update({
      where: { id: logId },
      data: { status: 'FAILED', errorMessage: 'Не удалось поставить физическую очистку файлов в очередь' },
    });
  }
  return toDto(await prisma.deletionLog.findUniqueOrThrow({ where: { id: logId } }));
}

export async function requestChildDeletion(parentId: string, childId: string): Promise<DeletionLogDto> {
  const child = await prisma.childProfile.findFirst({ where: { id: childId, parentId, deletedAt: null } });
  if (!child) throw new HttpError(404, 'CHILD_NOT_FOUND', 'Профиль ребёнка не найден');
  const result = await prisma.$transaction(async (tx) => {
    const cleanup = await anonymizeChild(tx, child.id);
    const log = await tx.deletionLog.create({
      data: {
        requestedById: parentId,
        scope: 'CHILD',
        targetHash: cleanup.childHash,
        summary: safeJson({ database: cleanup }),
      },
    });
    return { log, cleanup };
  });
  return enqueueAndRead(result.log.id, {
    deletionLogId: result.log.id,
    scope: 'CHILD',
    parentId,
    childIds: [child.id],
    publicStorageKeys: result.cleanup.publicStorageKeys,
  });
}

export async function requestAccountDeletion(userId: string, profileAvatarKey?: string | null): Promise<DeletionLogDto> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { childProfiles: { select: { id: true, deletedAt: true } }, teacherProfile: { select: { id: true } } },
  });
  if (!user) throw new HttpError(404, 'USER_NOT_FOUND', 'Пользователь не найден');
  const activeChildIds = user.childProfiles.filter((child) => !child.deletedAt).map((child) => child.id);
  const allChildIds = user.childProfiles.map((child) => child.id);
  const [projects, mediaAssets, characters, scenes, episodes, orders, supportAttachments] = await Promise.all([
    prisma.project.findMany({
      where: { userId },
      select: {
        id: true, userId: true, mode: true, aiProviderLogs: true, inputImages: true,
        resultImage: true, resultVideo: true, resultThumbnail: true, resultAssets: true,
        userInputs: true, stepProgress: true,
      },
    }),
    prisma.mediaAsset.findMany({ where: { ownerUserId: userId }, select: { storageKey: true, thumbnailKey: true } }),
    prisma.character.findMany({ where: { userId }, select: { id: true, referenceImages: true } }),
    prisma.scene.findMany({ where: { userId }, select: { id: true, referenceImages: true } }),
    prisma.episode.findMany({ where: { userId }, select: { id: true, resultImage: true, resultVideo: true, resultThumbnail: true } }),
    prisma.order.findMany({ where: { userId }, select: { id: true, referenceFiles: true, resultVideo: true } }),
    prisma.supportAttachment.findMany({
      where: { message: { OR: [{ authorId: userId }, { ticket: { userId } }] } },
      select: { storageKey: true },
    }),
  ]);
  const publicStorageKeys = unique([
    profileAvatarKey,
    ...projects.flatMap(collectProjectStorageKeys),
    ...mediaAssets.flatMap((asset) => [asset.storageKey, asset.thumbnailKey]),
    ...characters.flatMap((item) => item.referenceImages.map((url) => keyFromUrl(url, userId))),
    ...scenes.flatMap((item) => item.referenceImages.map((url) => keyFromUrl(url, userId))),
    ...episodes.flatMap((item) => [
      keyFromUrl(item.resultImage, userId), keyFromUrl(item.resultVideo, userId), keyFromUrl(item.resultThumbnail, userId),
    ]),
    ...orders.flatMap((item) => [
      ...item.referenceFiles.map((url) => keyFromUrl(url, userId)),
      keyFromUrl(item.resultVideo, userId),
    ]),
    ...supportAttachments.map((item) => item.storageKey),
  ]);
  const accountHash = deletionHash(userId);

  const log = await prisma.$transaction(async (tx) => {
    const childResults = [];
    for (const childId of activeChildIds) childResults.push(await anonymizeChild(tx, childId));
    await tx.thread.deleteMany({
      where: {
        OR: [
          { parentId: userId },
          ...(user.teacherProfile ? [{ teacherId: user.teacherProfile.id }] : []),
        ],
      },
    });
    await tx.childAsset.updateMany({ where: { createdById: userId }, data: { createdById: null } });
    await tx.supportMessage.deleteMany({ where: { authorId: userId } });
    await tx.supportTicket.deleteMany({ where: { userId } });
    await tx.abuseReport.deleteMany({
      where: { OR: [{ characterId: { in: characters.map((item) => item.id) } }, { episodeId: { in: episodes.map((item) => item.id) } }] },
    });
    await tx.episodeCharacter.deleteMany({
      where: {
        OR: [
          { episodeId: { in: episodes.map((item) => item.id) } },
          { characterId: { in: characters.map((item) => item.id) } },
        ],
      },
    });
    await tx.episode.deleteMany({ where: { userId } });
    await tx.character.deleteMany({ where: { userId } });
    await tx.scene.deleteMany({ where: { userId } });
    await tx.mediaAsset.deleteMany({ where: { ownerUserId: userId } });
    await tx.project.deleteMany({ where: { userId } });
    await tx.chat.deleteMany({ where: { userId } });
    await tx.fairyTaleScriptRecord.updateMany({
      where: { userId },
      data: {
        childName: 'Удалено',
        childAge: 0,
        moralLesson: 'Удалено по запросу пользователя',
        additionalDetails: null,
        title: 'Удалённый сценарий',
        content: safeJson({ deleted: true }),
        rawText: 'Удалено по запросу пользователя',
      },
    });
    await tx.order.updateMany({
      where: { userId },
      data: {
        scenario: 'Удалено по запросу пользователя',
        referenceFiles: [],
        contactInfo: 'удалено',
        adminNotes: null,
        resultVideo: null,
        resultDelivered: false,
      },
    });
    await tx.aIUsageLog.updateMany({ where: { userId }, data: { userId: null, requestPayload: Prisma.JsonNull, responsePayload: Prisma.JsonNull } });
    await tx.teacherProfile.updateMany({ where: { userId }, data: { isActive: false, bio: null, subjects: [] } });
    await tx.user.update({
      where: { id: userId },
      data: {
        deletedAt: new Date(),
        email: `deleted_${accountHash.slice(0, 20)}@allvision.local`,
        name: null,
        avatar: null,
        messenger: null,
        messengerType: null,
        emailVerifyToken: null,
        emailVerifyExpiresAt: null,
        passwordResetToken: null,
        passwordResetExpiresAt: null,
      },
    });
    return tx.deletionLog.create({
      data: {
        requestedById: userId,
        scope: 'ACCOUNT',
        targetHash: accountHash,
        summary: safeJson({
          database: {
            children: childResults,
            projects: projects.length,
            mediaAssets: mediaAssets.length,
            characters: characters.length,
            scenes: scenes.length,
            episodes: episodes.length,
            publicFilesQueued: publicStorageKeys.length,
          },
        }),
      },
    });
  });
  return enqueueAndRead(log.id, {
    deletionLogId: log.id,
    scope: 'ACCOUNT',
    parentId: userId,
    childIds: allChildIds,
    userId,
    publicStorageKeys,
  });
}

export async function getDeletionLog(requesterId: string, logId: string): Promise<DeletionLogDto> {
  const log = await prisma.deletionLog.findFirst({ where: { id: logId, requestedById: requesterId } });
  if (!log) throw new HttpError(404, 'DELETION_LOG_NOT_FOUND', 'Запрос на удаление не найден');
  return toDto(log);
}
