import path from 'node:path';
import { Prisma, prisma } from '@allvision/database';
import { generationExpiresAt } from '@allvision/shared';
import { getStorageProvider } from '../providers';
import { PiAPIAccountClient } from './piapi-client';
import { logger } from '../utils/logger';

type RecoveryRef = {
  logId?: string;
  taskId?: string | null;
  blockSlug?: string | null;
  recoverableOutputUrl?: string | null;
};

type NormalizedPiAPITask = {
  status: 'pending' | 'processing' | 'completed' | 'failed';
  outputUrl?: string;
  errorCode?: string;
  errorMessage?: string;
};

const VIDEO_OUTPUT_BLOCKS = new Set([
  'image-to-video',
  'face-swap-video',
  'text-to-video',
  'motion-transfer',
  'trend-video-transfer',
  'scene-transfer',
  'video-compose',
  'video-effect',
  'video-watermark-remove',
  'video-upscale',
]);

const RECOVERABLE_PROJECT_STATUSES = new Set(['PENDING', 'PROCESSING', 'FAILED']);

export async function tryRecoverPiAPIProject(projectId: string, userId?: string): Promise<boolean> {
  try {
    return await recoverPiAPIProject(projectId, userId);
  } catch (err) {
    logger.warn(`[piapi-recovery] failed for project=${projectId}`, err);
    return false;
  }
}

async function recoverPiAPIProject(projectId: string, userId?: string): Promise<boolean> {
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      ...(userId ? { userId } : {}),
    },
    select: {
      id: true,
      userId: true,
      mode: true,
      status: true,
      aiProviderJobId: true,
      stepProgress: true,
    },
  });

  if (!project || !RECOVERABLE_PROJECT_STATUSES.has(project.status)) return false;
  if (project.mode === 'library-generation') return false;

  const refs = await recoveryRefs(project.id, project.aiProviderJobId, project.stepProgress);
  if (refs.length === 0) return false;

  const apiKey = process.env.PIAPI_API_KEY;
  if (!apiKey) return false;
  const client = new PiAPIAccountClient({
    apiKey,
    baseUrl: process.env.PIAPI_BASE_URL ?? 'https://api.piapi.ai',
  });

  for (const ref of refs) {
    const providerUrl = ref.recoverableOutputUrl ?? (ref.taskId ? await completedTaskOutput(client, ref.taskId) : undefined);
    if (!providerUrl) continue;

    const outputType = inferOutputType(ref.blockSlug, providerUrl);
    const local = await materialiseProviderOutput({
      providerUrl,
      projectId: project.id,
      userId: project.userId,
      outputType,
    });
    const completedAt = new Date();
    const output = {
      type: outputType,
      url: local.url,
      metadata: {
        provider: 'piapi',
        recovered: true,
        piapiTaskId: ref.taskId ?? undefined,
        piapiUrl: providerUrl,
      },
    };
    const nextStepProgress = recoverStepProgress(project.stepProgress, ref, output);

    await prisma.project.update({
      where: { id: project.id },
      data: {
        status: 'COMPLETED',
        progress: 100,
        completedAt,
        expiresAt: generationExpiresAt(completedAt),
        errorMessage: null,
        errorCode: null,
        resultImage: outputType === 'image' ? local.url : null,
        resultVideo: outputType === 'video' ? local.url : null,
        resultThumbnail: null,
        stepProgress: nextStepProgress.length > 0 ? nextStepProgress as Prisma.InputJsonValue : Prisma.JsonNull,
      },
    });

    if (ref.logId) {
      await prisma.aIUsageLog.update({
        where: { id: ref.logId },
        data: {
          status: 'success',
          errorCode: null,
          errorMessage: null,
          recoverableOutputUrl: providerUrl,
        },
      }).catch((err) => logger.warn(`[piapi-recovery] failed to update usage log=${ref.logId}`, err));
    }

    logger.info(`[piapi-recovery] project=${project.id} recovered from taskId=${ref.taskId ?? 'recoverable-url'}`);
    return true;
  }

  return false;
}

async function recoveryRefs(projectId: string, aiProviderJobId: string | null, stepProgress: unknown): Promise<RecoveryRef[]> {
  const logs = await prisma.aIUsageLog.findMany({
    where: {
      projectId,
      provider: 'piapi',
      OR: [
        { taskId: { not: null } },
        { recoverableOutputUrl: { not: null } },
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: 8,
    select: {
      id: true,
      taskId: true,
      blockSlug: true,
      recoverableOutputUrl: true,
    },
  });

  const refs: RecoveryRef[] = logs.map((log) => ({
    logId: log.id,
    taskId: log.taskId,
    blockSlug: log.blockSlug,
    recoverableOutputUrl: log.recoverableOutputUrl,
  }));

  if (aiProviderJobId && !refs.some((ref) => ref.taskId === aiProviderJobId)) {
    refs.unshift({
      taskId: aiProviderJobId,
      blockSlug: activeStepBlockSlug(stepProgress),
    });
  }

  return refs;
}

async function completedTaskOutput(client: PiAPIAccountClient, taskId: string): Promise<string | undefined> {
  const raw = await client.getTask(taskId);
  const task = normaliseTask(raw);
  if (task.status !== 'completed') return undefined;
  return task.outputUrl;
}

async function materialiseProviderOutput(params: {
  providerUrl: string;
  projectId: string;
  userId: string;
  outputType: 'image' | 'video';
}) {
  const response = await fetch(params.providerUrl);
  if (!response.ok) {
    throw new Error(`RECOVERY_DOWNLOAD_FAILED: ${response.status}`);
  }
  const contentType = response.headers.get('content-type')?.split(';')[0]?.trim()
    ?? (params.outputType === 'video' ? 'video/mp4' : 'image/jpeg');
  const ext = extensionFor(contentType, params.providerUrl, params.outputType);
  const key = `outputs/${params.userId}/${params.projectId}/recovered/result.${ext}`;
  const body = Buffer.from(await response.arrayBuffer());
  return getStorageProvider().upload({ key, body, contentType });
}

function recoverStepProgress(stepProgress: unknown, ref: RecoveryRef, output: Record<string, unknown>) {
  if (!Array.isArray(stepProgress)) return [];
  let recovered = false;
  return stepProgress.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
    const step = item as Record<string, unknown>;
    const shouldRecover = !recovered && (
      (ref.blockSlug && step.blockSlug === ref.blockSlug)
      || step.status === 'processing'
      || step.status === 'failed'
    );
    if (shouldRecover) {
      recovered = true;
      return { ...step, status: 'completed', progress: 100, output };
    }
    if (recovered && step.status === 'pending') {
      return { ...step, status: 'completed', progress: 100, output, recovered: true };
    }
    return step;
  });
}

function inferOutputType(blockSlug: string | null | undefined, providerUrl: string): 'image' | 'video' {
  if (blockSlug && VIDEO_OUTPUT_BLOCKS.has(blockSlug)) return 'video';
  if (/\.(mp4|mov|webm)(?:$|\?)/i.test(providerUrl)) return 'video';
  return 'image';
}

function extensionFor(contentType: string, providerUrl: string, outputType: 'image' | 'video') {
  if (contentType === 'video/mp4') return 'mp4';
  if (contentType === 'video/webm') return 'webm';
  if (contentType === 'video/quicktime') return 'mov';
  if (contentType === 'image/png') return 'png';
  if (contentType === 'image/webp') return 'webp';
  if (contentType === 'image/jpeg') return 'jpg';
  const fromPath = path.extname(new URL(providerUrl).pathname).replace('.', '').toLowerCase();
  if (fromPath) return fromPath;
  return outputType === 'video' ? 'mp4' : 'jpg';
}

function activeStepBlockSlug(stepProgress: unknown): string | null {
  if (!Array.isArray(stepProgress)) return null;
  const active = stepProgress.find((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
    const status = (item as Record<string, unknown>).status;
    return status === 'processing' || status === 'failed';
  }) ?? stepProgress.find((item) => item && typeof item === 'object' && !Array.isArray(item));
  if (!active || typeof active !== 'object' || Array.isArray(active)) return null;
  const blockSlug = (active as Record<string, unknown>).blockSlug;
  return typeof blockSlug === 'string' ? blockSlug : null;
}

function normaliseTask(raw: Record<string, unknown>): NormalizedPiAPITask {
  const data = readObject(raw, ['data']) ?? raw;
  const statusRaw = readString(data, ['status'])
    ?? readString(data, ['task_status'])
    ?? readString(raw, ['status'])
    ?? 'processing';
  return {
    status: mapStatus(statusRaw),
    outputUrl: findOutputUrl(data),
    errorCode: readCode(data, ['error', 'code']) ?? readCode(data, ['error_code']),
    errorMessage: readString(data, ['error', 'message'])
      ?? readString(data, ['error_message'])
      ?? readString(data, ['message']),
  };
}

function findOutputUrl(data: Record<string, unknown>): string | undefined {
  return findFirstString(data, [
    ['output', 'video_url'],
    ['output', 'image_url'],
    ['output', 'url'],
    ['output', 'result_url'],
    ['output', 'result'],
    ['output', 'video'],
    ['output', 'image'],
    ['output_url'],
    ['video_url'],
    ['image_url'],
    ['result_url'],
  ]) ?? findFirstArrayString(data, [
    ['output', 'image_urls'],
    ['output', 'video_urls'],
    ['image_urls'],
    ['video_urls'],
  ]) ?? readKlingWorkUrl(data);
}

function readKlingWorkUrl(source: Record<string, unknown>): string | undefined {
  const output = readObject(source, ['output']);
  const works = Array.isArray(output?.works) ? output?.works : source.works;
  if (!Array.isArray(works)) return undefined;
  const first = works.find((item) => item && typeof item === 'object') as Record<string, unknown> | undefined;
  if (!first) return undefined;
  return readString(first, ['video', 'resource_without_watermark'])
    ?? readString(first, ['video', 'resource'])
    ?? readString(first, ['cover', 'resource'])
    ?? readString(first, ['resource_without_watermark'])
    ?? readString(first, ['resource'])
    ?? readString(first, ['url']);
}

function mapStatus(value: string): NormalizedPiAPITask['status'] {
  const status = value.toLowerCase();
  if (status === 'completed' || status === 'success' || status === 'succeeded') return 'completed';
  if (status === 'failed' || status === 'error') return 'failed';
  if (status === 'pending' || status === 'queued') return 'pending';
  return 'processing';
}

function readObject(source: Record<string, unknown>, pathParts: string[]): Record<string, unknown> | undefined {
  const value = readPath(source, pathParts);
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function readString(source: Record<string, unknown>, pathParts: string[]): string | undefined {
  const value = readPath(source, pathParts);
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function readCode(source: Record<string, unknown>, pathParts: string[]): string | undefined {
  const value = readPath(source, pathParts);
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return undefined;
}

function readPath(source: Record<string, unknown>, pathParts: string[]): unknown {
  return pathParts.reduce<unknown>((current, part) => {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined;
    return (current as Record<string, unknown>)[part];
  }, source);
}

function findFirstString(source: Record<string, unknown>, paths: string[][]): string | undefined {
  for (const pathParts of paths) {
    const value = readString(source, pathParts);
    if (value) return value;
  }
  return undefined;
}

function findFirstArrayString(source: Record<string, unknown>, paths: string[][]): string | undefined {
  for (const pathParts of paths) {
    const value = readPath(source, pathParts);
    if (!Array.isArray(value)) continue;
    const first = value.find((item) => typeof item === 'string' && item.trim().length > 0);
    if (typeof first === 'string') return first;
  }
  return undefined;
}
