import { BLOCK_CATALOG, getBlockCatalogItem } from './catalog';
import type { BlockCatalogItem, ModelOption } from './types';
import {
  PRICING_RUB_PER_TOKEN_DEFAULT,
  PRICING_USD_TO_RUB_DEFAULT,
  rubToTokens,
  usdToTokens,
} from '../constants/pricing';

export const PRICING_MARGIN_DEFAULT = 0.8;
export { PRICING_RUB_PER_TOKEN_DEFAULT, PRICING_USD_TO_RUB_DEFAULT };

export type PipelineStepLike = {
  id?: string;
  blockSlug: string;
  params?: unknown;
};

export type TierName = 'standard' | 'pro';

export type PipelineCostBreakdownItem = {
  stepId: string;
  blockSlug: string;
  modelSlug: string | null;
  modelTitle: string | null;
  costUsd: number;
  costCoins: number;
};

export type PipelineTierCost = {
  tier: TierName;
  costUsd: number;
  costCoins: number;
  steps: PipelineCostBreakdownItem[];
};

export type PipelinePricingSummary = {
  standard: PipelineTierCost;
  pro: PipelineTierCost;
};

export type ServiceMargin = {
  priceCoins: number;
  costUsd: number;
  costCoins: number;
  profitCoins: number;
  profitUsd: number;
  marginPercent: number | null;
};

export function roundCoinsToTen(value: number) {
  return roundCoinsUp(value);
}

export function roundCoinsUp(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.ceil(value);
}

export function costUsdToCoins(
  value: number,
  usdToRub = PRICING_USD_TO_RUB_DEFAULT,
  rubPerToken = PRICING_RUB_PER_TOKEN_DEFAULT,
) {
  return usdToTokens(value, usdToRub, rubPerToken);
}

export function priceForMargin(
  costUsd: number,
  margin = PRICING_MARGIN_DEFAULT,
  usdToRub = PRICING_USD_TO_RUB_DEFAULT,
  rubPerToken = PRICING_RUB_PER_TOKEN_DEFAULT,
) {
  return rubToTokens(costUsd * usdToRub * (1 + margin), rubPerToken);
}

export function serviceMargin(
  priceCoins: number | null | undefined,
  costUsd: number,
  usdToRub = PRICING_USD_TO_RUB_DEFAULT,
  rubPerToken = PRICING_RUB_PER_TOKEN_DEFAULT,
): ServiceMargin {
  const price = priceCoins ?? 0;
  const rawCostCoins = (costUsd * usdToRub) / rubPerToken;
  const costCoins = costUsdToCoins(costUsd, usdToRub, rubPerToken);
  const profitCoins = price - rawCostCoins;
  return {
    priceCoins: price,
    costUsd,
    costCoins,
    profitCoins,
    profitUsd: (profitCoins * rubPerToken) / usdToRub,
    marginPercent: price > 0 ? (profitCoins / price) * 100 : null,
  };
}

export function summarizePipelinePricing(
  steps: unknown,
  blocks: BlockCatalogItem[] = BLOCK_CATALOG,
  usdToRub = PRICING_USD_TO_RUB_DEFAULT,
  rubPerToken = PRICING_RUB_PER_TOKEN_DEFAULT,
): PipelinePricingSummary {
  const parsed = parseSteps(steps);
  return {
    standard: summarizeTier(parsed, 'standard', blocks, usdToRub, rubPerToken),
    pro: summarizeTier(parsed, 'pro', blocks, usdToRub, rubPerToken),
  };
}

export function estimateStepCostUsd(
  step: PipelineStepLike,
  tier: TierName,
  blocks: BlockCatalogItem[] = BLOCK_CATALOG,
): { model: ModelOption | undefined; costUsd: number } {
  const block = blocks.find((item) => item.slug === step.blockSlug) ?? getBlockCatalogItem(step.blockSlug);
  if (!block) return { model: undefined, costUsd: 0 };
  const params = asRecord(step.params);
  const model = selectModel(block, params, tier);
  if (!model) return { model: undefined, costUsd: 0 };
  return { model, costUsd: estimateModelCostUsd(model, params) };
}

export function estimateModelCostUsd(model: ModelOption, params: Record<string, unknown> = {}) {
  const duration = positiveNumber(params.duration) ?? positiveNumber(params.durationSec) ?? defaultDuration(model);
  const resolution = stringValue(params.resolution) ?? stringValue(params.quality);
  const generateAudio = booleanValue(params.generate_audio) ?? booleanValue(params.generateAudio) ?? false;
  const enableAudio = booleanValue(params.enable_audio) ?? booleanValue(params.enableAudio) ?? false;

  if (model.slug === 'nano-banana') {
    const costs: Record<string, number> = { '1K': 0.06, '2K': 0.08, '4K': 0.12 };
    return costs[resolution ?? '1K'] ?? costs['1K'];
  }

  if (model.slug === 'qubico-video-toolkit') {
    const frames = positiveNumber(params.estimatedFrames) ?? duration * 24;
    return frames * 0.004;
  }

  if (model.slug === 'kling-std') return 0.2 * Math.max(1, Math.ceil(duration / 5));
  if (model.slug === 'kling-pro') return 0.33 * Math.max(1, Math.ceil(duration / 5));

  if (model.slug === 'kling-3-std' || model.slug === 'kling-3-pro') {
    const perFiveSeconds = kling3UnitCost(model.slug, resolution ?? '720p', enableAudio);
    return perFiveSeconds * Math.max(1, Math.ceil(duration / 5));
  }

  if (model.slug === 'kling-3-omni') {
    return duration * kling3OmniPerSecond(resolution ?? '720p', enableAudio);
  }

  if (model.slug === 'hailuo-2.3' || model.slug === 'hailuo-2.3-fast' || model.slug === 'hailuo-2.3-text' || model.slug === 'hailuo-2.3-fast-text') {
    return hailuoCost(model.slug, duration, resolution ?? '768P');
  }

  if (model.slug === 'seedance-2' || model.slug === 'seedance-2-fast' || model.slug === 'seedance-2-less-restriction' || model.slug === 'seedance-2-fast-less-restriction' || model.slug === 'seedance-2-omni' || model.slug === 'seedance-2-fast-omni' || model.slug === 'seedance-2-first-last' || model.slug === 'seedance-2-fast-first-last') {
    return duration * seedancePerSecond(model.slug, resolution ?? '720p');
  }

  if (model.slug === 'veo-3.1' || model.slug === 'veo-3.1-fast' || model.slug === 'veo-3.1-i2v' || model.slug === 'veo-3.1-fast-i2v') {
    return duration * veoPerSecond(model.slug, generateAudio);
  }

  if (model.slug === 'wan-2.6' || model.slug === 'wan-2.6-i2v') {
    return duration * wanPerSecond(resolution ?? '720p');
  }

  if (model.slug === 'sora-2' || model.slug === 'sora-2-pro') {
    return duration * (model.slug === 'sora-2-pro' ? 0.24 : 0.08);
  }

  if (model.slug.startsWith('kling-motion-')) {
    return duration * motionTransferPerSecond(model.slug);
  }

  return model.estimatedCostUsd ?? 0;
}

function summarizeTier(
  steps: PipelineStepLike[],
  tier: TierName,
  blocks: BlockCatalogItem[],
  usdToRub: number,
  rubPerToken: number,
): PipelineTierCost {
  const breakdown = steps.map((step, index) => {
    const { model, costUsd } = estimateStepCostUsd(step, tier, blocks);
    return {
      stepId: step.id ?? `step_${index + 1}`,
      blockSlug: step.blockSlug,
      modelSlug: model?.slug ?? null,
      modelTitle: model?.title ?? null,
      costUsd,
      costCoins: costUsdToCoins(costUsd, usdToRub, rubPerToken),
    };
  });
  const costUsd = breakdown.reduce((sum, item) => sum + item.costUsd, 0);
  return {
    tier,
    costUsd,
    costCoins: costUsdToCoins(costUsd, usdToRub, rubPerToken),
    steps: breakdown,
  };
}

function parseSteps(value: unknown): PipelineStepLike[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is PipelineStepLike => (
    Boolean(item) &&
    typeof item === 'object' &&
    typeof (item as { blockSlug?: unknown }).blockSlug === 'string'
  )).map((item) => ({
    id: typeof (item as { id?: unknown }).id === 'string' ? (item as { id: string }).id : undefined,
    blockSlug: (item as { blockSlug: string }).blockSlug,
    params: (item as { params?: unknown }).params,
  }));
}

function selectModel(block: BlockCatalogItem, params: Record<string, unknown>, tier: TierName) {
  const modelParam = params.model;
  let slug: string | undefined;
  if (typeof modelParam === 'string') slug = modelParam;
  if (modelParam && typeof modelParam === 'object' && !Array.isArray(modelParam)) {
    const value = (modelParam as Record<string, unknown>)[tier];
    if (typeof value === 'string') slug = value;
  }
  return block.supportedModels.find((item) => item.slug === slug)
    ?? block.supportedModels.find((item) => item.tierHint === tier)
    ?? block.supportedModels.find((item) => item.tierHint === 'both')
    ?? block.supportedModels[0];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function positiveNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  if (typeof value === 'string' && Number.isFinite(Number(value)) && Number(value) > 0) return Number(value);
  return undefined;
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function booleanValue(value: unknown) {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

function defaultDuration(model: ModelOption) {
  if (model.slug.startsWith('veo-3.1')) return 8;
  if (model.slug.startsWith('hailuo-2.3')) return 6;
  if (model.slug.startsWith('wan-2.6')) return 5;
  return 5;
}

function seedancePerSecond(slug: string, resolution: string) {
  const canonical = slug.includes('fast') ? 'seedance-2-fast' : 'seedance-2';
  const table: Record<string, Record<string, number>> = {
    'seedance-2': { '480p': 0.1, '720p': 0.2, '1080p': 0.5 },
    'seedance-2-fast': { '480p': 0.06, '720p': 0.16, '1080p': 0.35 },
  };
  const base = table[canonical]?.[resolution] ?? table[canonical]?.['720p'] ?? 0;
  return slug.includes('less-restriction') ? base * 1.25 : base;
}

function veoPerSecond(slug: string, generateAudio: boolean) {
  if (slug === 'veo-3.1-fast' || slug === 'veo-3.1-fast-i2v') return generateAudio ? 0.09 : 0.06;
  return generateAudio ? 0.24 : 0.12;
}

function wanPerSecond(resolution: string) {
  return resolution === '1080p' ? 0.12 : 0.07;
}

function kling3UnitCost(slug: string, resolution: string, enableAudio: boolean) {
  if (slug === 'kling-3-pro') return resolution === '1080p' ? 2.8 : 1.3;
  if (enableAudio) return resolution === '1080p' ? 1.6 : 0.9;
  return resolution === '1080p' ? 1.2 : 0.5;
}

function kling3OmniPerSecond(resolution: string, enableAudio: boolean) {
  if (resolution === '1080p') return enableAudio ? 0.2 : 0.15;
  return enableAudio ? 0.15 : 0.1;
}

function hailuoCost(slug: string, duration: number, resolution: string) {
  const canonical = slug.includes('fast') ? 'hailuo-2.3-fast' : 'hailuo-2.3';
  const key = `${canonical}:${resolution}:${duration}`;
  const table: Record<string, number> = {
    'hailuo-2.3:768P:6': 0.23,
    'hailuo-2.3:1080P:6': 0.68,
    'hailuo-2.3:768P:10': 0.39,
    'hailuo-2.3:1080P:10': 1.14,
    'hailuo-2.3-fast:768P:6': 0.14,
    'hailuo-2.3-fast:1080P:6': 0.41,
    'hailuo-2.3-fast:768P:10': 0.23,
    'hailuo-2.3-fast:1080P:10': 0.68,
  };
  return table[key] ?? (modelFallback(slug));
}

function motionTransferPerSecond(slug: string) {
  const table: Record<string, number> = {
    'kling-motion-2.6-std': 0.065,
    'kling-motion-2.6-pro': 0.104,
    'kling-motion-3.0-std': 0.195,
    'kling-motion-3.0-pro': 0.26,
  };
  return table[slug] ?? 0;
}

function modelFallback(slug: string) {
  return BLOCK_CATALOG
    .flatMap((block) => block.supportedModels)
    .find((model) => model.slug === slug)
    ?.estimatedCostUsd ?? 0;
}
