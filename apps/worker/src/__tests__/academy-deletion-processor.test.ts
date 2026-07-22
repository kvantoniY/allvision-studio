import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Job } from 'bullmq';
import { prisma } from '@allvision/database';
import type { AcademyDeletionJobData } from '@allvision/shared';
import { getStorageProvider } from '../providers';
import { processAcademyDeletion } from '../processors/academy-deletion';

jest.mock('../providers', () => ({
  getStorageProvider: jest.fn(),
}));

const RUN = Date.now();
const EMAIL = `a10-worker-delete-${RUN}@example.com`;
const PRIVATE_ENV = [
  'CHILD_PHOTOS_DIR',
  'CHARACTER_REFS_DIR',
  'CHILD_ASSETS_DIR',
  'ACADEMY_MESSAGES_DIR',
] as const;

let tempRoot = '';
let userId = '';
let deletionLogId = '';
const originalEnv = new Map<string, string | undefined>();
const deleteFile = jest.fn().mockResolvedValue(undefined);

async function writeFixture(root: string, relative: string) {
  const target = path.join(root, ...relative.split('/'));
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, 'personal-data');
}

beforeAll(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'allvision-a10-worker-db-'));
  for (const key of [...PRIVATE_ENV, 'UPLOADS_DIR'] as const) {
    originalEnv.set(key, process.env[key]);
    process.env[key] = path.join(tempRoot, key.toLowerCase());
  }
  jest.mocked(getStorageProvider).mockReturnValue({
    upload: jest.fn().mockResolvedValue({ url: 'https://storage.test/file', key: 'file' }),
    getSignedUrl: jest.fn().mockResolvedValue('https://storage.test/file'),
    delete: deleteFile,
  });
  const user = await prisma.user.create({
    data: { email: EMAIL, passwordHash: 'already-anonymized', role: 'PARENT', deletedAt: new Date() },
  });
  userId = user.id;
  const log = await prisma.deletionLog.create({
    data: {
      requestedById: userId,
      scope: 'ACCOUNT',
      targetHash: `worker-test-${RUN}`,
      summary: { database: { anonymized: true } },
    },
  });
  deletionLogId = log.id;
  for (const key of PRIVATE_ENV) await writeFixture(process.env[key]!, `${userId}/child-1/file.bin`);
  await writeFixture(process.env.UPLOADS_DIR!, `user-uploads/${userId}/avatar.jpg`);
});

afterAll(async () => {
  await prisma.deletionLog.deleteMany({ where: { id: deletionLogId } });
  await prisma.user.deleteMany({ where: { id: userId } });
  for (const key of [...PRIVATE_ENV, 'UPLOADS_DIR'] as const) {
    const value = originalEnv.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  await fs.rm(tempRoot, { recursive: true, force: true });
  await prisma.$disconnect();
});

it('completes an account cleanup, preserves the DB audit summary and deletes listed files', async () => {
  const data: AcademyDeletionJobData = {
    deletionLogId,
    scope: 'ACCOUNT',
    parentId: userId,
    childIds: ['child-1'],
    userId,
    publicStorageKeys: ['results/a10-one.jpg', 'results/a10-one.jpg', 'user-inputs/a10-two.jpg'],
  };
  await processAcademyDeletion({ data } as unknown as Job<AcademyDeletionJobData>);

  const log = await prisma.deletionLog.findUniqueOrThrow({ where: { id: deletionLogId } });
  expect(log.status).toBe('COMPLETED');
  expect(log.completedAt).not.toBeNull();
  expect(log.summary).toMatchObject({
    database: { anonymized: true },
    storage: { privateRootsDeleted: 1, publicFilesDeleted: 2 },
  });
  expect(deleteFile).toHaveBeenCalledTimes(2);
  for (const key of PRIVATE_ENV) {
    await expect(fs.stat(path.join(process.env[key]!, userId))).rejects.toMatchObject({ code: 'ENOENT' });
  }
  await expect(fs.stat(path.join(process.env.UPLOADS_DIR!, 'user-uploads', userId)))
    .rejects.toMatchObject({ code: 'ENOENT' });
});
