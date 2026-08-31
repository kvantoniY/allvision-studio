import { Prisma, prisma } from '@allvision/database';
import { editorLaunchBlocker, generationExpiresAt, type UserInputFieldInput } from '@allvision/shared';
import { HttpError } from '../utils/http-error';
import { addServicePipelineJob } from '../queues';
import { logger } from '../utils/logger';

/**
 * Запуск услуги из редактора роликов.
 *
 * Отдельный путь от витринного `POST /api/services/:slug/launch` по одной причине: там
 * результат становится самостоятельным проектом, а здесь он должен вернуться в кадр —
 * поэтому проект создаётся в режиме `editor-generation`, и его подхватывает тот же хук
 * воркера, что и обычную генерацию сцены.
 *
 * Панель редактора узкая, полноценную форму услуги в неё не поместить. Поэтому услуга
 * запускается отсюда, только если её обязательные поля закрываются кадром из сцены и
 * простыми переключателями. Всё остальное честно отклоняем: молча подставить пустое
 * значение — значит списать коины за заведомо неверный запуск.
 */

export type EditorServiceInputs = Record<string, string | boolean>;

function parseForm(value: unknown): UserInputFieldInput[] {
  return Array.isArray(value) ? (value as UserInputFieldInput[]) : [];
}

function fieldVisible(field: UserInputFieldInput, values: EditorServiceInputs): boolean {
  if (!field.visibleWhen) return true;
  return values[field.visibleWhen.field] === field.visibleWhen.value;
}

export async function createEditorServiceGeneration(params: {
  userId: string;
  serviceSlug: string;
  /** Кадр из сцены: им закрываются photo/avatar поля услуги. */
  frameUrl?: string;
  values: EditorServiceInputs;
}) {
  const service = await prisma.service.findUnique({
    where: { slug: params.serviceSlug },
    select: {
      id: true,
      slug: true,
      title: true,
      pipelineConfig: true,
      userInputForm: true,
      priceCoinsPro: true,
      priceCoinsStandard: true,
      priceTokens: true,
    },
  });
  if (!service || !service.pipelineConfig) {
    throw new HttpError(404, 'SERVICE_NOT_FOUND', 'Услуга не найдена');
  }

  const fields = parseForm(service.userInputForm);
  const blocker = editorLaunchBlocker(service.userInputForm, params.values, Boolean(params.frameUrl));
  if (blocker) throw new HttpError(400, 'SERVICE_NEEDS_FULL_FORM', blocker);

  // Референсы приходят из панели по одному на поле. Кадр сцены — только запасной вариант
  // для первого фото-поля: человек мог снять подстановку и приложить свои файлы.
  const userInputs: Record<string, unknown> = {};
  const firstPhotoField = fields.find((field) => field.type === 'photo' || field.type === 'avatar');
  for (const field of fields) {
    if (!fieldVisible(field, params.values)) continue;
    const value = params.values[field.id];
    if (value !== undefined && value !== '') {
      userInputs[field.id] = value;
      continue;
    }
    if (field.id === firstPhotoField?.id && params.frameUrl) userInputs[field.id] = params.frameUrl;
  }

  const tierField = fields.find((field) => field.type === 'tier');
  const tier = tierField && params.values[tierField.id] === 'standard' ? 'standard' : 'pro';
  const tokensCost = (tier === 'standard'
    ? service.priceCoinsStandard ?? service.priceCoinsPro
    : service.priceCoinsPro ?? service.priceCoinsStandard) ?? service.priceTokens ?? 0;

  const steps = Array.isArray(service.pipelineConfig) ? service.pipelineConfig : [];
  const stepProgress = (steps as Array<{ id?: string; blockSlug?: string }>).map((step) => ({
    stepId: step.id ?? 'step',
    blockSlug: step.blockSlug ?? 'unknown',
    status: 'pending',
    progress: 0,
  }));

  let project;
  try {
    project = await prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: params.userId, tokenBalance: { gte: tokensCost } },
        data: { tokenBalance: { decrement: tokensCost } },
        select: { tokenBalance: true },
      });
      if (tokensCost > 0) {
        await tx.tokenTransaction.create({
          data: {
            userId: params.userId,
            reason: 'generation',
            amount: -tokensCost,
            balanceAfter: user.tokenBalance,
          },
        });
      }
      return tx.project.create({
        data: {
          userId: params.userId,
          serviceId: service.id,
          mode: 'editor-generation',
          title: `Сцена: ${service.title}`,
          status: 'PENDING',
          progress: 0,
          inputImages: params.frameUrl ? [params.frameUrl] : [],
          inputText: service.title,
          tokensCost,
          pipelineSnapshot: service.pipelineConfig as Prisma.InputJsonValue,
          selectedTier: tier,
          userInputs: userInputs as Prisma.InputJsonValue,
          stepProgress: stepProgress as Prisma.InputJsonValue,
          expiresAt: generationExpiresAt(),
        },
        select: { id: true, tokensCost: true },
      });
    });
  } catch (error) {
    if ((error as { code?: string }).code === 'P2025') {
      throw new HttpError(402, 'INSUFFICIENT_TOKENS', 'Недостаточно коинов');
    }
    throw error;
  }

  try {
    await addServicePipelineJob({ projectId: project.id, userId: params.userId, mode: 'production' });
  } catch (error) {
    // Очередь недоступна — возвращаем коины сразу: человек не должен платить за запуск,
    // которого не было.
    logger.error(`[editor-service] не удалось поставить задачу ${project.id}`, error);
    await prisma.$transaction(async (tx) => {
      await tx.project.update({
        where: { id: project.id },
        data: { status: 'FAILED', errorCode: 'QUEUE_UNAVAILABLE', errorMessage: 'Очередь недоступна' },
      });
      if (project.tokensCost > 0) {
        const user = await tx.user.update({
          where: { id: params.userId },
          data: { tokenBalance: { increment: project.tokensCost } },
          select: { tokenBalance: true },
        });
        await tx.tokenTransaction.create({
          data: {
            userId: params.userId,
            reason: 'refund',
            amount: project.tokensCost,
            balanceAfter: user.tokenBalance,
            refId: project.id,
          },
        });
      }
    });
    throw new HttpError(503, 'QUEUE_UNAVAILABLE', 'Сервис генерации временно недоступен');
  }

  return { projectId: project.id, tokensCost: project.tokensCost };
}
