import { z } from 'zod';
import type { ProviderResult } from '../providers/ai-provider';
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

export function providerResultToOutput(
  result: ProviderResult,
  expectedType: 'image' | 'video',
): BlockOutput {
  return {
    type: expectedType,
    url: result.outputUrl,
    metadata: {
      providerCostUsd: result.costUsd,
      providerDurationMs: result.durationMs,
      ...(result.meta ?? {}),
    },
  };
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
