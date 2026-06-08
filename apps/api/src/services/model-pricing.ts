import { prisma } from '@allvision/database';
import { BLOCK_CATALOG, type ModelPriceOverrides } from '@allvision/shared';

const MODEL_PRICE_OVERRIDES_KEY = 'MODEL_PRICE_OVERRIDES';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function modelMinimumPrices() {
  const map = new Map<string, number>();
  for (const block of BLOCK_CATALOG) {
    for (const model of block.supportedModels) {
      const current = map.get(model.slug) ?? 0;
      map.set(model.slug, Math.max(current, model.estimatedCostCoins ?? 0));
    }
  }
  return map;
}

export function normaliseModelPriceOverrides(value: unknown): ModelPriceOverrides {
  let source = value;
  if (typeof value === 'string') {
    try {
      source = JSON.parse(value) as unknown;
    } catch {
      return {};
    }
  }
  if (!isRecord(source)) return {};

  const supportedSlugs = modelMinimumPrices();
  const result: ModelPriceOverrides = {};
  for (const [slug, rawPrice] of Object.entries(source)) {
    if (!supportedSlugs.has(slug)) continue;
    const price = typeof rawPrice === 'number' ? rawPrice : Number(rawPrice);
    if (!Number.isFinite(price)) continue;
    const rounded = Math.ceil(price);
    if (rounded >= 1) result[slug] = rounded;
  }
  return result;
}

export async function readModelPriceOverrides(): Promise<ModelPriceOverrides> {
  const row = await prisma.setting.findUnique({ where: { key: MODEL_PRICE_OVERRIDES_KEY } });
  return normaliseModelPriceOverrides(row?.value);
}

export async function writeModelPriceOverrides(value: unknown): Promise<ModelPriceOverrides> {
  const normalised = normaliseModelPriceOverrides(value);
  await prisma.setting.upsert({
    where: { key: MODEL_PRICE_OVERRIDES_KEY },
    update: { value: JSON.stringify(normalised) },
    create: { key: MODEL_PRICE_OVERRIDES_KEY, value: JSON.stringify(normalised) },
  });
  return normalised;
}
