import type { Job } from 'bullmq';
import type { ProjectJobData } from '@allvision/shared';

// На этапе 1.6a — заглушка. Реальная логика появится в 1.6b после создания
// API для Project'ов: получаем job.data.projectId, читаем Project из БД,
// вызываем aiProvider.restorePhoto, поллим getJobStatus, обновляем прогресс,
// сохраняем результат через uploadResult, помечаем COMPLETED/FAILED.
export async function processPhotoRestore(job: Job<ProjectJobData>) {
  console.log(`[photo-restore] job received: ${job.id}`, job.data);
  return { ok: true, stub: true };
}
