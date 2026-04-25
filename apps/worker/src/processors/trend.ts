import type { Job } from 'bullmq';

export async function processTrend(job: Job) {
  console.log('[trend] processing', job.id, job.data);
  // Реализация — на Этапе 1.4+.
}
