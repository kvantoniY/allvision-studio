import type { Job } from 'bullmq';
import type { FairyTaleJobData } from '@allvision/shared';

// Заглушка под услугу 6 (этап 1.7.5). На 1.6a — только логирование.
export async function processFairyTaleScript(job: Job<FairyTaleJobData>) {
  console.log(`[fairy-tale-script] job received: ${job.id}`, job.data);
  return { ok: true, stub: true };
}
