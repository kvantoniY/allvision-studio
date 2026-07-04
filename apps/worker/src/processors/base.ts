import { CharacterStatus, EpisodeStatus, prisma, ProjectStatus } from '@allvision/database';
import { CHARACTER_SLOT_PRICE_TOKENS, generationExpiresAt } from '@allvision/shared';
import { publishProjectEvent } from '../utils/project-events';

export async function updateProjectProgress(
  projectId: string,
  progress: number,
  status?: ProjectStatus,
) {
  await prisma.project.update({
    where: { id: projectId },
    data: {
      progress,
      ...(status ? { status } : {}),
    },
  });
}

export interface ProjectResult {
  resultImage?: string;
  resultVideo?: string;
  resultThumbnail?: string;
}

export async function markProjectCompleted(projectId: string, result: ProjectResult) {
  const completedAt = new Date();
  await prisma.project.update({
    where: { id: projectId },
    data: {
      status: ProjectStatus.COMPLETED,
      progress: 100,
      completedAt,
      expiresAt: generationExpiresAt(completedAt),
      resultImage: result.resultImage ?? null,
      resultVideo: result.resultVideo ?? null,
      resultThumbnail: result.resultThumbnail ?? null,
    },
  });
}

export async function markProjectFailed(
  projectId: string,
  errorMessage: string,
  options: { refundTokens?: boolean; errorCode?: string } = {},
) {
  const refundTokens = options.refundTokens ?? true;
  let failedUserId: string | undefined;

  await prisma.$transaction(async (tx) => {
    const failedAt = new Date();
    const project = await tx.project.findUnique({
      where: { id: projectId },
      select: { id: true, userId: true, tokensCost: true, status: true },
    });
    if (!project) return;
    if (project.status === ProjectStatus.COMPLETED) return;
    failedUserId = project.userId;

    await tx.project.update({
      where: { id: projectId },
      data: {
        status: ProjectStatus.FAILED,
        errorMessage,
        errorCode: options.errorCode ?? null,
        completedAt: failedAt,
        expiresAt: generationExpiresAt(failedAt),
      },
    });

    if (!refundTokens || project.tokensCost <= 0) return;

    const existingRefund = await tx.tokenTransaction.findFirst({
      where: {
        userId: project.userId,
        refId: projectId,
        reason: 'refund',
        amount: project.tokensCost,
      },
      select: { id: true },
    });
    if (existingRefund) return;

    const user = await tx.user.update({
      where: { id: project.userId },
      data: { tokenBalance: { increment: project.tokensCost } },
      select: { tokenBalance: true },
    });

    await tx.tokenTransaction.create({
      data: {
        userId: project.userId,
        amount: project.tokensCost,
        reason: 'refund',
        refId: projectId,
        balanceAfter: user.tokenBalance,
      },
    });
  });

  if (failedUserId) {
    publishProjectEvent({
      projectId,
      userId: failedUserId,
      status: 'FAILED',
      kind: 'status',
    });
  }
}

export async function markCharacterReady(characterId: string) {
  await prisma.$transaction(async (tx) => {
    const character = await tx.character.findUnique({
      where: { id: characterId },
      select: { id: true, userId: true, isPaid: true },
    });
    if (!character) return;

    await tx.character.update({
      where: { id: characterId },
      data: {
        status: CharacterStatus.READY,
        nsfwChecked: true,
      },
    });

    if (!character.isPaid) {
      await tx.user.update({
        where: { id: character.userId },
        data: { freeCharacterUsed: true },
      });
    }
  });
}

export async function markCharacterRejected(
  characterId: string,
  _reason: string,
  options: { refundIfPaid?: boolean } = {},
) {
  const refundIfPaid = options.refundIfPaid ?? true;

  await prisma.$transaction(async (tx) => {
    const character = await tx.character.findUnique({
      where: { id: characterId },
      select: { id: true, userId: true, isPaid: true, status: true },
    });
    if (!character) return;

    await tx.character.update({
      where: { id: characterId },
      data: {
        status: CharacterStatus.REJECTED,
        nsfwChecked: true,
      },
    });

    if (!character.isPaid) {
      await tx.user.update({
        where: { id: character.userId },
        data: { freeCharacterUsed: false },
      });
      return;
    }

    if (!refundIfPaid || character.status === CharacterStatus.REJECTED) return;

    const existingRefund = await tx.tokenTransaction.findFirst({
      where: {
        userId: character.userId,
        refId: characterId,
        reason: 'refund',
        amount: CHARACTER_SLOT_PRICE_TOKENS,
      },
      select: { id: true },
    });
    if (existingRefund) return;

    const user = await tx.user.update({
      where: { id: character.userId },
      data: { tokenBalance: { increment: CHARACTER_SLOT_PRICE_TOKENS } },
      select: { tokenBalance: true },
    });

    await tx.tokenTransaction.create({
      data: {
        userId: character.userId,
        amount: CHARACTER_SLOT_PRICE_TOKENS,
        reason: 'refund',
        refId: characterId,
        balanceAfter: user.tokenBalance,
      },
    });
  });
}

export async function updateEpisodeProgress(
  episodeId: string,
  progress: number,
  status?: EpisodeStatus,
) {
  await prisma.episode.update({
    where: { id: episodeId },
    data: {
      progress,
      ...(status ? { status } : {}),
    },
  });
}

export interface EpisodeResult {
  resultImage?: string;
  resultVideo?: string;
  resultThumbnail?: string;
}

export async function markEpisodeCompleted(episodeId: string, result: EpisodeResult) {
  await prisma.episode.update({
    where: { id: episodeId },
    data: {
      status: EpisodeStatus.COMPLETED,
      progress: 100,
      completedAt: new Date(),
      resultImage: result.resultImage ?? null,
      resultVideo: result.resultVideo ?? null,
      resultThumbnail: result.resultThumbnail ?? null,
      errorMessage: null,
    },
  });
}

export async function markEpisodeFailed(
  episodeId: string,
  errorMessage: string,
  options: { refundTokens?: boolean } = {},
) {
  const refundTokens = options.refundTokens ?? true;

  await prisma.$transaction(async (tx) => {
    const episode = await tx.episode.findUnique({
      where: { id: episodeId },
      select: { id: true, userId: true, status: true },
    });
    if (!episode) return;

    await tx.episode.update({
      where: { id: episodeId },
      data: {
        status: EpisodeStatus.FAILED,
        errorMessage,
      },
    });

    if (!refundTokens || episode.status === EpisodeStatus.FAILED) return;

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
