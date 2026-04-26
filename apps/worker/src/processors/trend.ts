import type { Job } from 'bullmq';
import type { ProjectJobData } from '@allvision/shared';

// Заглушка — см. photo-restore.ts.
export async function processTrend(job: Job<ProjectJobData>) {
  console.log(`[trend] job received: ${job.id}`, job.data);
  return { ok: true, stub: true };
}
