import '../src/config/env';
import { prisma } from '@allvision/database';
import { initialiseWorkerProviders } from '../src/providers';
import { runExpiredGenerationCleanup } from '../src/services/generation-retention';

async function main() {
  await initialiseWorkerProviders();
  const result = await runExpiredGenerationCleanup({
    limit: positiveNumber(process.env.GENERATION_CLEANUP_BATCH_SIZE, 200),
    maxBatches: positiveNumber(process.env.GENERATION_CLEANUP_MAX_BATCHES, 100),
  });
  console.log(JSON.stringify(result, null, 2));
}

function positiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
