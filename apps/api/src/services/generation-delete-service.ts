import { Prisma, prisma } from '@allvision/database';
import type { StorageProvider } from '@allvision/shared';
import { getStorageProvider } from '../providers';
import { logger } from '../utils/logger';

const generationDeleteProjectSelect = {
  id: true,
  userId: true,
  mode: true,
  aiProviderLogs: true,
  inputImages: true,
  resultImage: true,
  resultVideo: true,
  resultThumbnail: true,
  resultAssets: true,
  userInputs: true,
  stepProgress: true,
} satisfies Prisma.ProjectSelect;

type GenerationDeleteProject = Prisma.ProjectGetPayload<{ select: typeof generationDeleteProjectSelect }>;

export type DeleteGenerationResult = {
  projectsDeleted: number;
  filesDeleted: number;
  fileDeleteErrors: number;
  protectedFilesSkipped: number;
};

export async function deleteGenerationProjectById(
  projectId: string,
  options: { userId?: string; storage?: StorageProvider } = {},
): Promise<DeleteGenerationResult | null> {
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      ...(options.userId ? { userId: options.userId } : {}),
    },
    select: generationDeleteProjectSelect,
  });
  if (!project) return null;
  return deleteGenerationProjects([project], options.storage ?? getStorageProvider());
}

export async function deleteGenerationProjects(
  projects: GenerationDeleteProject[],
  storage: StorageProvider = getStorageProvider(),
): Promise<DeleteGenerationResult> {
  if (projects.length === 0) {
    return { projectsDeleted: 0, filesDeleted: 0, fileDeleteErrors: 0, protectedFilesSkipped: 0 };
  }

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
      logger.warn(`Failed to delete generation file ${key}`, error);
    }
  }

  const projectIds = projects.map((project) => project.id);
  const [, deleted] = await prisma.$transaction([
    prisma.aIUsageLog.deleteMany({ where: { projectId: { in: projectIds } } }),
    prisma.project.deleteMany({ where: { id: { in: projectIds } } }),
  ]);

  return {
    projectsDeleted: deleted.count,
    filesDeleted,
    fileDeleteErrors,
    protectedFilesSkipped: protectedKeys.size,
  };
}

export function collectProjectStorageKeys(project: GenerationDeleteProject): string[] {
  const keys = new Set<string>();
  const collect = (value: unknown) => {
    forEachStringValue(value, (candidate) => {
      const key = storageKeyFromTemporaryUrl(candidate, project.userId);
      if (key) keys.add(key);
    });
  };

  collect(project.aiProviderLogs);
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
  if (key.startsWith('outputs/')) return true;
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
