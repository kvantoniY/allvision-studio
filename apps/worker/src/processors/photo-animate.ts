import type { Job } from 'bullmq';

export async function processPhotoAnimate(job: Job) {
  console.log('[photo-animate] processing', job.id, job.data);
  // Реализация — на Этапе 1.4+.
}
