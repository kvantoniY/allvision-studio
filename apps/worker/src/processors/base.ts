import { GenerationStatus, prisma } from '@allvision/database';

type GenerationResultPatch = {
  resultText?: string | null;
  resultImage?: string | null;
  resultVideo?: string | null;
  resultAudio?: string | null;
  resultThumbnail?: string | null;
};

export async function updateGenerationProgress(id: string, progress: number) {
  return prisma.generation.update({
    where: { id },
    data: {
      status: GenerationStatus.PROCESSING,
      progress: Math.max(0, Math.min(100, progress)),
    },
  });
}

export async function markGenerationCompleted(id: string, result: GenerationResultPatch) {
  return prisma.generation.update({
    where: { id },
    data: {
      ...result,
      status: GenerationStatus.COMPLETED,
      progress: 100,
      errorMessage: null,
      completedAt: new Date(),
    },
  });
}

export async function markGenerationFailed(
  id: string,
  message: string,
  options: { refundCoins?: boolean } = {},
) {
  return prisma.$transaction(async (tx) => {
    const generation = await tx.generation.update({
      where: { id },
      data: {
        status: GenerationStatus.FAILED,
        errorMessage: message,
        completedAt: new Date(),
      },
    });

    if (options.refundCoins && generation.coinsCost > 0) {
      const user = await tx.user.update({
        where: { id: generation.userId },
        data: { coinBalance: { increment: generation.coinsCost } },
      });

      await tx.coinTransaction.create({
        data: {
          userId: generation.userId,
          amount: generation.coinsCost,
          reason: 'refund',
          refType: 'Generation',
          refId: generation.id,
          balanceAfter: user.coinBalance,
        },
      });
    }

    return generation;
  });
}
