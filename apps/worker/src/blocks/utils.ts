import { z } from 'zod';
import type { AIJobHandle, AIJobStatus } from '@allvision/shared';
import type { BlockContext, BlockOutput } from './types';

export const anyInputSchema = z.unknown();

export const fileOutputSchema = z.object({
  type: z.enum(['image', 'video']),
  url: z.string().min(1),
  metadata: z.record(z.unknown()).optional(),
});

export const textOutputSchema = z.object({
  type: z.literal('text'),
  text: z.string(),
  metadata: z.record(z.unknown()).optional(),
});

export const blockOutputSchema = z.union([fileOutputSchema, textOutputSchema]);

export const tierModelParamsSchema = z.object({
  standard: z.string().min(1),
  pro: z.string().min(1),
});

export function readInputUrl(input: unknown, fallback = 'mock://input.jpg'): string {
  if (!input || typeof input !== 'object') return fallback;
  const value = input as Record<string, unknown>;
  if (typeof value.url === 'string') return value.url;
  if (typeof value.imageUrl === 'string') return value.imageUrl;
  if (Array.isArray(value.inputImages) && typeof value.inputImages[0] === 'string') {
    return value.inputImages[0];
  }
  if (typeof value.photo === 'string') return value.photo;
  return fallback;
}

export function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function estimateFromSupportedModel(
  params: unknown,
  fallback: number,
  supportedModels: Array<{ slug: string; estimatedCostCoins: number }>,
) {
  const model = asObject(params).model;
  if (typeof model !== 'string') return fallback;
  return supportedModels.find((option) => option.slug === model)?.estimatedCostCoins ?? fallback;
}

export async function waitForAIJob(params: {
  handle: AIJobHandle;
  ctx: BlockContext;
  expectedType: 'image' | 'video';
  progressStart?: number;
  progressEnd?: number;
  pollIntervalMs?: number;
  timeoutMs?: number;
}): Promise<BlockOutput> {
  const progressStart = params.progressStart ?? 10;
  const progressEnd = params.progressEnd ?? 95;
  const pollIntervalMs = params.pollIntervalMs ?? 250;
  const timeoutMs = params.timeoutMs ?? 30_000;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const status = await params.ctx.getAIProvider().getJobStatus(params.handle);
    if (status.status === 'processing') {
      const mapped =
        progressStart +
        Math.round((status.progress / 100) * (progressEnd - progressStart));
      await params.ctx.reportProgress(Math.min(progressEnd, mapped));
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      continue;
    }

    if (status.status === 'failed') {
      throw new Error(status.errorMessage ?? 'AI provider returned failed');
    }

    return completedStatusToOutput(status, params.expectedType);
  }

  throw new Error('AI processing timeout');
}

function completedStatusToOutput(status: AIJobStatus, expectedType: 'image' | 'video'): BlockOutput {
  if (!status.resultUrl) {
    throw new Error('AI provider completed without result URL');
  }
  if (status.resultType !== expectedType) {
    throw new Error(`AI provider returned ${status.resultType ?? 'unknown'} instead of ${expectedType}`);
  }
  return {
    type: expectedType,
    url: status.resultUrl,
    metadata: {
      providerProgress: status.progress,
    },
  };
}
