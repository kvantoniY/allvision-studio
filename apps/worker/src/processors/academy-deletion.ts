import fs from 'node:fs/promises';
import path from 'node:path';
import type { Job } from 'bullmq';
import { Prisma, prisma } from '@allvision/database';
import type { AcademyDeletionJobData } from '@allvision/shared';
import { getStorageProvider } from '../providers';
import {
  deleteAccountPrivateDirectories,
  deleteChildPrivateDirectories,
} from '../utils/private-storage';
import { resolveWorkspacePath } from '../utils/paths';

function safeJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function deleteLocalUserUploadRoot(userId: string): Promise<void> {
  const uploadsRoot = resolveWorkspacePath(process.env.UPLOADS_DIR ?? './uploads');
  const target = path.resolve(uploadsRoot, 'user-uploads', userId);
  const allowedRoot = path.resolve(uploadsRoot, 'user-uploads');
  if (!target.startsWith(allowedRoot + path.sep)) throw new Error('INVALID_USER_UPLOAD_DELETE_TARGET');
  await fs.rm(target, { recursive: true, force: true });
}

export async function processAcademyDeletion(job: Job<AcademyDeletionJobData>) {
  const existing = await prisma.deletionLog.findUnique({ where: { id: job.data.deletionLogId } });
  if (!existing || existing.status === 'COMPLETED') return;
  await prisma.deletionLog.update({
    where: { id: existing.id },
    data: { status: 'PROCESSING', startedAt: new Date(), errorMessage: null },
  });
  try {
    if (job.data.scope === 'ACCOUNT') {
      await deleteAccountPrivateDirectories(job.data.parentId);
      if (job.data.userId) await deleteLocalUserUploadRoot(job.data.userId);
    } else {
      for (const childId of job.data.childIds) {
        await deleteChildPrivateDirectories(job.data.parentId, childId);
      }
    }
    const storage = getStorageProvider();
    let publicFilesDeleted = 0;
    let publicFileErrors = 0;
    for (const key of [...new Set(job.data.publicStorageKeys)]) {
      try {
        await storage.delete(key);
        publicFilesDeleted += 1;
      } catch {
        publicFileErrors += 1;
      }
    }
    if (publicFileErrors > 0) throw new Error(`PUBLIC_FILE_DELETE_ERRORS:${publicFileErrors}`);
    await prisma.deletionLog.update({
      where: { id: existing.id },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        summary: safeJson({
          ...(existing.summary && typeof existing.summary === 'object' && !Array.isArray(existing.summary)
            ? existing.summary
            : {}),
          storage: {
            privateRootsDeleted: job.data.scope === 'ACCOUNT' ? 1 : job.data.childIds.length,
            publicFilesDeleted,
          },
        }),
      },
    });
  } catch (error) {
    await prisma.deletionLog.update({
      where: { id: existing.id },
      data: { status: 'FAILED', errorMessage: (error as Error).message.slice(0, 1000) },
    });
    throw error;
  }
}
