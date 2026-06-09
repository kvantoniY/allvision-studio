import 'dotenv/config';
import { prisma } from './index';

const PRICING_MARGIN_DEFAULT = 0.8;
const PRICING_USD_TO_RUB_DEFAULT = 80;
const PRICING_RUB_PER_TOKEN_DEFAULT = 1;

export type PriceRecomputeOptions = {
  apply?: boolean;
  margin?: number;
  usdToRub?: number;
  rubPerToken?: number;
  log?: (message: string) => void;
  prismaClient?: typeof prisma;
};

export type PriceRecomputeChange = {
  id: string;
  slug: string;
  title: string;
  costUsdStandard: number;
  costUsdPro: number;
  oldStandard: number;
  newStandard: number;
  oldPro: number;
  newPro: number;
  changed: boolean;
};

export async function runPricesRecompute(options: PriceRecomputeOptions = {}) {
  const client = options.prismaClient ?? prisma;
  const log = options.log ?? console.log;
  const apply = options.apply ?? false;
  const margin = options.margin ?? Number(process.env.PRICING_MARGIN_DEFAULT ?? PRICING_MARGIN_DEFAULT);
  const usdToRub = options.usdToRub ?? Number(process.env.PRICING_USD_TO_RUB ?? PRICING_USD_TO_RUB_DEFAULT);
  const rubPerToken = options.rubPerToken ?? Number(process.env.PRICING_RUB_PER_TOKEN ?? PRICING_RUB_PER_TOKEN_DEFAULT);
  const { priceForMargin, summarizePipelinePricing } = loadSharedPricing();

  const services = await client.service.findMany({
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      slug: true,
      title: true,
      pipelineConfig: true,
      priceCoinsStandard: true,
      priceCoinsPro: true,
      priceTokens: true,
    },
  });

  const changes: PriceRecomputeChange[] = [];

  for (const service of services) {
    const pricing = summarizePipelinePricing(service.pipelineConfig, undefined, usdToRub, rubPerToken);
    const oldStandard = service.priceCoinsStandard ?? service.priceTokens ?? 0;
    const oldPro = service.priceCoinsPro ?? oldStandard;
    const newStandard = Math.max(1, priceForMargin(pricing.standard.costUsd, margin, usdToRub, rubPerToken));
    const newPro = Math.max(newStandard, priceForMargin(pricing.pro.costUsd, margin, usdToRub, rubPerToken));
    const changed = oldStandard !== newStandard || oldPro !== newPro;

    const change = {
      id: service.id,
      slug: service.slug,
      title: service.title,
      costUsdStandard: pricing.standard.costUsd,
      costUsdPro: pricing.pro.costUsd,
      oldStandard,
      newStandard,
      oldPro,
      newPro,
      changed,
    };
    changes.push(change);

    const marker = changed ? 'diff' : 'same';
    log(
      `[prices:${marker}] ${service.slug}: ` +
      `cost std=$${pricing.standard.costUsd.toFixed(4)} pro=$${pricing.pro.costUsd.toFixed(4)}; ` +
      `standard ${oldStandard} -> ${newStandard}; pro ${oldPro} -> ${newPro}`,
    );

    if (apply && changed) {
      await client.service.update({
        where: { id: service.id },
        data: {
          priceCoinsStandard: newStandard,
          priceCoinsPro: newPro,
          priceTokens: newStandard,
        },
      });
    }
  }

  log(`[prices] ${apply ? 'applied' : 'dry-run'}; services=${services.length}; changed=${changes.filter((item) => item.changed).length}; margin=${margin}; usdToRub=${usdToRub}; rubPerToken=${rubPerToken}`);
  return { apply, margin, usdToRub, rubPerToken, changes };
}

function loadSharedPricing(): {
  priceForMargin: (costUsd: number, margin: number, usdToRub: number, rubPerToken?: number) => number;
  summarizePipelinePricing: (steps: unknown, blocks?: unknown, usdToRub?: number, rubPerToken?: number) => {
    standard: { costUsd: number };
    pro: { costUsd: number };
  };
} {
  // Keep this runtime-only so @allvision/database can still build before @allvision/shared.
  // The production command runs after the monorepo build, where @allvision/shared/dist exists.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('@allvision/shared');
}

function parseArgs(argv: string[]) {
  const result: { apply: boolean; margin?: number; usdToRub?: number; rubPerToken?: number } = { apply: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--apply') result.apply = true;
    if (arg === '--margin') {
      result.margin = Number(argv[index + 1]);
      index += 1;
    }
    if (arg.startsWith('--margin=')) result.margin = Number(arg.slice('--margin='.length));
    if (arg === '--usd-to-rub') {
      result.usdToRub = Number(argv[index + 1]);
      index += 1;
    }
    if (arg.startsWith('--usd-to-rub=')) result.usdToRub = Number(arg.slice('--usd-to-rub='.length));
    if (arg === '--rub-per-token') {
      result.rubPerToken = Number(argv[index + 1]);
      index += 1;
    }
    if (arg.startsWith('--rub-per-token=')) result.rubPerToken = Number(arg.slice('--rub-per-token='.length));
  }
  return result;
}

if (require.main === module) {
  runPricesRecompute(parseArgs(process.argv.slice(2)))
    .catch((err) => {
      console.error(`[prices] failed: ${(err as Error).message}`);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
