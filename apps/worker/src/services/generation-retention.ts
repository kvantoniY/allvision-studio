import { Prisma, ProjectStatus, prisma } from '@allvision/database';
import {
  GENERATION_RETENTION_MS,
  type StorageProvider,
} from '@allvision/shared';
import { getStorageProvider } from '../providers';
import { logger } from '../utils/logger';

const EXPIRABLE_PROJECT_MODES = ['service', 'free-chat', 'test-run'];
const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_MAX_BATCHES = 10;
const DEFAULT_INTERVAL_MINUTES = 360;

const cleanupProjectSelect = {
  id: true,
  userId: true,
  mode: true,
  inputImages: true,
  resultImage: true,
  resultVideo: true,
  resultThumbnail: true,
  resultAssets: true,
  userInputs: true,
  stepProgress: true,
} satisfies Prisma.ProjectSelect;

type CleanupProject = Prisma.ProjectGetPayload<{ select: typeof cleanupProjectSelect }>;

export type GenerationRetentionCleanupResult = {
  projectsDeleted: number;
  filesDeleted: number;
  fileDeleteErrors: number;
  protectedFilesSkipped: number;
  emptyChatsDeleted: number;
};

export type GenerationRetentionCleanupOptions = {
  now?: Date;
  limit?: number;
  maxBatches?: number;
  storage?: StorageProvider;
};

export async function runExpiredGenerationCleanup(
  options: GenerationRetentionCleanupOptions = {},
): Promise<GenerationRetentionCleanupResult> {
  const now = options.now ?? new Date();
  const limit = options.limit ?? numberFromEnv('GENERATION_CLEANUP_BATCH_SIZE', DEFAULT_BATCH_SIZE);
  const maxBatches = options.maxBatches ?? numberFromEnv('GENERATION_CLEANUP_MAX_BATCHES', DEFAULT_MAX_BATCHES);
  const storage = options.storage ?? getStorageProvider();
  const result: GenerationRetentionCleanupResult = {
    projectsDeleted: 0,
    filesDeleted: 0,
    fileDeleteErrors: 0,
    protectedFilesSkipped: 0,
    emptyChatsDeleted: 0,
  };

  for (let batch = 0; batch < maxBatches; batch += 1) {
    const projects = await prisma.project.findMany({
      where: {
        expiresAt: { lte: now },
        mode: { in: EXPIRABLE_PROJECT_MODES },
        status: { in: [ProjectStatus.COMPLETED, ProjectStatus.FAILED] },
      },
      select: cleanupProjectSelect,
      orderBy: { expiresAt: 'asc' },
      take: limit,
    });

    if (projects.length === 0) break;

    const batchResult = await deleteExpiredProjectBatch(projects, storage);
    result.projectsDeleted += batchResult.projectsDeleted;
    result.filesDeleted += batchResult.filesDeleted;
    result.fileDeleteErrors += batchResult.fileDeleteErrors;
    result.protectedFilesSkipped += batchResult.protectedFilesSkipped;

    if (projects.length < limit) break;
  }

  const staleEmptyChats = await prisma.chat.deleteMany({
    where: {
      deletedAt: null,
      updatedAt: { lte: new Date(now.getTime() - GENERATION_RETENTION_MS) },
      messages: { none: {} },
    },
  });
  result.emptyChatsDeleted = staleEmptyChats.count;

  if (
    result.projectsDeleted > 0 ||
    result.filesDeleted > 0 ||
    result.fileDeleteErrors > 0 ||
    result.emptyChatsDeleted > 0
  ) {
    logger.info('Expired generation cleanup finished', result);
  }

  return result;
}

export function startGenerationRetentionCleanup(): () => void {
  const intervalMinutes = numberFromEnv('GENERATION_CLEANUP_INTERVAL_MINUTES', DEFAULT_INTERVAL_MINUTES);
  const intervalMs = Math.max(1, intervalMinutes) * 60 * 1000;

  const run = () => {
    runExpiredGenerationCleanup().catch((error) => {
      logger.error(`Expired generation cleanup failed: ${(error as Error).message}`, error);
    });
  };

  run();
  const timer = setInterval(run, intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}

async function deleteExpiredProjectBatch(
  projects: CleanupProject[],
  storage: StorageProvider,
): Promise<GenerationRetentionCleanupResult> {
  const keys = unique(projects.flatMap((project) => collectProjectStorageKeys(project)));
  const protectedKeys = await findProtectedMediaAssetKeys(keys);
  const deletableKeys = keys.filter((key) => !protectedKeys.has(key));
  let filesDeleted = 0;
  let fileDeleteErrors = 0;

  for (const key of deletableKeys) {
    try {
      await storage.delete(key);
      filesDeleted += 1;
    } catch (error) {
      fileDeleteErrors += 1;
      logger.warn(`Failed to delete expired generation file ${key}`, error);
    }
  }

  const deleted = await prisma.project.deleteMany({
    where: { id: { in: projects.map((project) => project.id) } },
  });

  return {
    projectsDeleted: deleted.count,
    filesDeleted,
    fileDeleteErrors,
    protectedFilesSkipped: protectedKeys.size,
    emptyChatsDeleted: 0,
  };
}

export function collectProjectStorageKeys(project: CleanupProject): string[] {
  const keys = new Set<string>();
  const collect = (value: unknown) => {
    forEachStringValue(value, (candidate) => {
      const key = storageKeyFromTemporaryUrl(candidate, project.userId);
      if (key) keys.add(key);
    });
  };

  collect(project.inputImages);
  collect(project.resultImage);
  collect(project.resultVideo);
  collect(project.resultThumbnail);
  collect(project.resultAssets);
  collect(project.userInputs);
  collect(project.stepProgress);

  return [...keys];
}

export function storageKeyFromTemporaryUrl(value: string, userId?: string): string | null {
  let raw = value.trim();
  if (!raw) return null;

  if (raw.startsWith('chat:')) {
    raw = raw.slice('chat:'.length);
  } else if (/^https?:\/\//i.test(raw)) {
    try {
      const url = new URL(raw);
      raw = url.pathname;
    } catch {
      return null;
    }
  }

  raw = raw.replace(/^\/+/, '');
  if (raw.startsWith('static/')) raw = raw.slice('static/'.length);

  try {
    raw = decodeURIComponent(raw);
  } catch {
    return null;
  }

  raw = raw.replace(/^\/+/, '');
  if (!isTemporaryGenerationStorageKey(raw, userId)) return null;
  return raw;
}

export function isTemporaryGenerationStorageKey(key: string, userId?: string): boolean {
  if (key.startsWith('results/')) return true;
  if (key.startsWith('user-inputs/')) return true;
  if (key.startsWith('user-uploads/chat/')) return true;
  if (userId && key.startsWith(`user-uploads/${userId}/`)) return true;
  return false;
}

async function findProtectedMediaAssetKeys(keys: string[]): Promise<Set<string>> {
  if (keys.length === 0) return new Set();
  const assets = await prisma.mediaAsset.findMany({
    where: {
      OR: [
        { storageKey: { in: keys } },
        { thumbnailKey: { in: keys } },
      ],
    },
    select: { storageKey: true, thumbnailKey: true },
  });
  const protectedKeys = new Set<string>();
  for (const asset of assets) {
    protectedKeys.add(asset.storageKey);
    if (asset.thumbnailKey) protectedKeys.add(asset.thumbnailKey);
  }
  return protectedKeys;
}

function forEachStringValue(value: unknown, visitor: (value: string) => void, depth = 0) {
  if (depth > 8 || value === null || value === undefined) return;
  if (typeof value === 'string') {
    visitor(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) forEachStringValue(item, visitor, depth + 1);
    return;
  }
  if (typeof value === 'object') {
    for (const item of Object.values(value as Record<string, unknown>)) {
      forEachStringValue(item, visitor, depth + 1);
    }
  }
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function numberFromEnv(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
