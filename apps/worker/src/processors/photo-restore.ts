import type { Job } from 'bullmq';

export async function processPhotoRestore(job: Job) {
  console.log('[photo-restore] processing', job.id, job.data);
  // Реализация — на Этапе 1.4+.
}
