import { prisma, ProjectStatus } from '@allvision/database';

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
  await prisma.project.update({
    where: { id: projectId },
    data: {
      status: ProjectStatus.COMPLETED,
      progress: 100,
      completedAt: new Date(),
      resultImage: result.resultImage ?? null,
      resultVideo: result.resultVideo ?? null,
      resultThumbnail: result.resultThumbnail ?? null,
    },
  });
}

export async function markProjectFailed(
  projectId: string,
  errorMessage: string,
  options: { refundTokens?: boolean } = {},
) {
  const refundTokens = options.refundTokens ?? true;

  await prisma.$transaction(async (tx) => {
    const project = await tx.project.findUnique({
      where: { id: projectId },
      select: { id: true, userId: true, tokensCost: true, status: true },
    });
    if (!project) return;

    await tx.project.update({
      where: { id: projectId },
      data: {
        status: ProjectStatus.FAILED,
        errorMessage,
      },
    });

    if (refundTokens && project.tokensCost > 0) {
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
    }
  });
}
