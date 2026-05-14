import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Prisma, prisma, ProjectStatus } from '@allvision/database';
import type { StorageProvider } from '@allvision/shared';
import sharp from 'sharp';
import { getAIProvider, getStorageProvider } from './providers';
import type { PipelineProviderMode } from './providers';
import { markProjectFailed } from './processors/base';
import { getBlock } from './blocks/registry';
import type { BlockDefinition, BlockLogger, BlockOutput } from './blocks/types';
import { logger as defaultLogger } from './utils/logger';
import { isProviderUserSafeError, ProviderError, providerUnavailableMessage } from './providers/provider-errors';
import { resolveWorkspacePath } from './utils/paths';

export type PipelineTier = 'standard' | 'pro';

export interface PipelineStep {
  id: string;
  blockSlug: string;
  params?: unknown;
  input?: unknown;
}

export interface PipelineRunParams {
  generationId: string;
  pipelineConfig: unknown;
  userInputs?: Record<string, unknown>;
  selectedTier?: PipelineTier;
  mode?: PipelineProviderMode;
}

export interface PipelineRunnerDependencies {
  getBlock?: (slug: string) => BlockDefinition;
  getAIProvider?: typeof getAIProvider;
  storage?: StorageProvider;
  logger?: BlockLogger;
}

interface StepProgressEntry {
  stepId: string;
  blockSlug: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  output?: unknown;
  errorMessage?: string;
}

export interface PlaceholderContext {
  userInputs: Record<string, unknown>;
  stepOutputs: Record<string, unknown>;
  selectedTier: PipelineTier;
  tierModel?: unknown;
}

export async function runPipeline(
  params: PipelineRunParams,
  dependencies: PipelineRunnerDependencies = {},
) {
  const project = await prisma.project.findUnique({
    where: { id: params.generationId },
    select: { id: true, status: true, userId: true, mode: true, userInputs: true },
  });
  if (!project) throw new Error(`Generation project not found: ${params.generationId}`);

  const storage = dependencies.storage ?? getStorageProvider();
  const pipelineConfig = await hydratePipelineReferences(params.pipelineConfig, project.userId, storage);
  const steps = parsePipelineConfig(pipelineConfig);
  if (steps.length === 0) {
    throw new Error('Pipeline config must contain at least one step');
  }

  const getBlockFn = dependencies.getBlock ?? getBlock;
  const logger = dependencies.logger ?? defaultLogger;
  const providerFactory = dependencies.getAIProvider ?? getAIProvider;
  const selectedTier = params.selectedTier ?? 'standard';
  const mode = params.mode ?? 'production';
  const userInputs = await hydrateMediaAssetInputs(params.userInputs ?? {}, project.userId);
  const stepOutputs: Record<string, unknown> = {};
  const stepProgress: StepProgressEntry[] = steps.map((step) => ({
    stepId: step.id,
    blockSlug: step.blockSlug,
    status: 'pending',
    progress: 0,
  }));

  await prisma.project.update({
    where: { id: params.generationId },
    data: {
      status: ProjectStatus.PROCESSING,
      progress: 0,
      errorMessage: null,
      errorCode: null,
      stepProgress: toJson(stepProgress),
    },
  });

  let previousOutput: unknown = userInputs;

  try {
    for (let index = 0; index < steps.length; index += 1) {
      const step = steps[index];
      const block = getBlockFn(step.blockSlug);

      stepProgress[index] = {
        ...stepProgress[index],
        status: 'processing',
        progress: 0,
      };
      await persistProgress(params.generationId, stepProgress, index, steps.length, 0);

      const context: PlaceholderContext = {
        userInputs,
        stepOutputs,
        selectedTier,
      };
      const resolvedParams = resolvePlaceholders(step.params ?? {}, context);
      const resolvedInput = resolvePlaceholders(step.input ?? previousOutput, context);

      const blockContext = {
        generationId: params.generationId,
        providerContext: {
          projectId: params.generationId,
          userId: project.userId,
          blockSlug: step.blockSlug,
          stepId: step.id,
          reportProgress: async (percent: number) => {
            const safePercent = clampPercent(percent);
            stepProgress[index] = {
              ...stepProgress[index],
              status: 'processing',
              progress: safePercent,
            };
            await persistProgress(
              params.generationId,
              stepProgress,
              index,
              steps.length,
              safePercent,
            );
          },
        },
        storage,
        logger,
        getAIProvider: () => providerFactory(step.blockSlug, { mode }),
        reportProgress: async (percent: number) => {
          const safePercent = clampPercent(percent);
          stepProgress[index] = {
            ...stepProgress[index],
            status: 'processing',
            progress: safePercent,
          };
          await persistProgress(
            params.generationId,
            stepProgress,
            index,
            steps.length,
            safePercent,
          );
        },
      };

      const output = await block.executor(resolvedParams, resolvedInput, blockContext);
      block.outputSchema.parse(output);
      stepOutputs[step.id] = output;
      previousOutput = output;
      stepProgress[index] = {
        ...stepProgress[index],
        status: 'completed',
        progress: 100,
        output,
      };
      await persistProgress(params.generationId, stepProgress, index, steps.length, 100);
    }

    const finalOutput = normaliseFinalOutput(previousOutput);
    if (project.mode === 'library-generation') {
      await createLibraryMediaAssetFromProject({
        projectId: params.generationId,
        userId: project.userId,
        projectUserInputs: project.userInputs,
        finalOutput,
        storage,
      });
    }
    await prisma.project.update({
      where: { id: params.generationId },
      data: {
        status: ProjectStatus.COMPLETED,
        progress: 100,
        completedAt: new Date(),
        errorMessage: null,
        errorCode: null,
        resultImage: finalOutput.resultImage ?? null,
        resultVideo: finalOutput.resultVideo ?? null,
        resultThumbnail: finalOutput.resultThumbnail ?? null,
        stepProgress: toJson(stepProgress),
      },
    });

    return {
      generationId: params.generationId,
      output: previousOutput,
      stepProgress,
    };
  } catch (err) {
    const errorCode = err instanceof ProviderError ? err.code : undefined;
    const activeIndex = stepProgress.findIndex((step) => step.status === 'processing');
    if (activeIndex >= 0) {
      const userSafeMessage = isProviderUserSafeError(err)
        ? providerUnavailableMessage
        : (err as Error).message;
      stepProgress[activeIndex] = {
        ...stepProgress[activeIndex],
        status: 'failed',
        errorMessage: userSafeMessage,
      };
      await prisma.project.update({
        where: { id: params.generationId },
        data: { stepProgress: toJson(stepProgress) },
      });
    }
    logger.error(`[pipeline] Project ${params.generationId} failed`, err);
    await markProjectFailed(
      params.generationId,
      isProviderUserSafeError(err) ? providerUnavailableMessage : (err as Error).message,
      { refundTokens: true, errorCode },
    );
    throw err;
  }
}

export function parsePipelineConfig(value: unknown): PipelineStep[] {
  if (!Array.isArray(value)) {
    throw new Error('Pipeline config must be an array');
  }
  return value.map((step, index) => {
    if (!step || typeof step !== 'object' || Array.isArray(step)) {
      throw new Error(`Pipeline step ${index + 1} must be an object`);
    }
    const raw = step as Record<string, unknown>;
    if (typeof raw.id !== 'string' || raw.id.length === 0) {
      throw new Error(`Pipeline step ${index + 1} has invalid id`);
    }
    if (typeof raw.blockSlug !== 'string' || raw.blockSlug.length === 0) {
      throw new Error(`Pipeline step ${raw.id} has invalid blockSlug`);
    }
    return {
      id: raw.id,
      blockSlug: raw.blockSlug,
      params: raw.params,
      input: raw.input,
    };
  });
}

export function resolvePlaceholders(value: unknown, context: PlaceholderContext): unknown {
  if (isTierChoice(value)) {
    return value[context.selectedTier];
  }

  if (Array.isArray(value)) {
    return value.map((item) => resolvePlaceholders(item, context));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, resolvePlaceholders(item, context)]),
    );
  }

  if (typeof value !== 'string') return value;

  const exact = value.match(/^{{\s*([^}]+)\s*}}$/);
  if (exact) {
    return resolveToken(exact[1].trim(), context);
  }

  return value.replace(/{{\s*([^}]+)\s*}}/g, (_match, token: string) => {
    const resolved = resolveToken(token.trim(), context);
    if (resolved === undefined || resolved === null) return '';
    if (typeof resolved === 'string') return resolved;
    return JSON.stringify(resolved);
  });
}

export function replaceAssetReferences(value: unknown, urls: Map<string, string>): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => replaceAssetReferences(item, urls));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, replaceAssetReferences(item, urls)]),
    );
  }

  if (typeof value !== 'string') return value;
  const match = value.match(/^asset:([a-zA-Z0-9_-]+)$/);
  if (!match) return value;
  return urls.get(match[1]) ?? value;
}

function collectAssetReferenceIds(value: unknown, ids = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    value.forEach((item) => collectAssetReferenceIds(item, ids));
    return ids;
  }

  if (value && typeof value === 'object') {
    Object.values(value).forEach((item) => collectAssetReferenceIds(item, ids));
    return ids;
  }

  if (typeof value === 'string') {
    const match = value.match(/^asset:([a-zA-Z0-9_-]+)$/);
    if (match) ids.add(match[1]);
  }
  return ids;
}

async function hydrateAssetReferences(value: unknown, userId: string): Promise<unknown> {
  const ids = Array.from(collectAssetReferenceIds(value));
  if (ids.length === 0) return value;
  const assets = await prisma.mediaAsset.findMany({
    where: { id: { in: ids }, isActive: true },
    select: { id: true, publicUrl: true, ownerUserId: true },
  });
  const found = new Set(assets.map((asset) => asset.id));
  const missing = ids.filter((id) => !found.has(id));
  if (missing.length > 0) {
    throw new Error(`INVALID_ASSET_REFERENCE: ${missing.join(',')}`);
  }
  const forbidden = assets.find((asset) => asset.ownerUserId && asset.ownerUserId !== userId);
  if (forbidden) {
    throw new Error(`INVALID_ASSET_ACCESS: ${forbidden.id}`);
  }
  return replaceAssetReferences(value, new Map(assets.map((asset) => [asset.id, asset.publicUrl])));
}

function collectChatUploadReferenceKeys(value: unknown, keys = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    value.forEach((item) => collectChatUploadReferenceKeys(item, keys));
    return keys;
  }

  if (value && typeof value === 'object') {
    Object.values(value).forEach((item) => collectChatUploadReferenceKeys(item, keys));
    return keys;
  }

  if (typeof value === 'string') {
    const key = chatUploadKeyFromRef(value);
    if (key) keys.add(key);
  }
  return keys;
}

function replaceChatUploadReferences(value: unknown, urls: Map<string, string>): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => replaceChatUploadReferences(item, urls));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, replaceChatUploadReferences(item, urls)]),
    );
  }

  if (typeof value !== 'string') return value;
  const key = chatUploadKeyFromRef(value);
  if (!key) return value;
  return urls.get(key) ?? value;
}

function chatUploadKeyFromRef(value: string): string | null {
  if (value.startsWith('chat:')) return value.slice('chat:'.length).replace(/^\/+/, '');
  if (value.startsWith('user-uploads/chat/')) return value.replace(/^\/+/, '');
  return null;
}

function assertChatUploadKeyAccess(key: string, userId: string): string {
  const normalized = key.replace(/^\/+/, '');
  const expectedPrefix = `user-uploads/chat/${userId}/`;
  if (!normalized.startsWith(expectedPrefix) || normalized.includes('..')) {
    throw new Error(`INVALID_CHAT_UPLOAD_ACCESS: ${key}`);
  }
  return normalized;
}

async function hydrateChatUploadReferences(value: unknown, userId: string, storage: StorageProvider): Promise<unknown> {
  const keys = Array.from(collectChatUploadReferenceKeys(value));
  if (keys.length === 0) return value;
  const urls = new Map<string, string>();
  for (const rawKey of keys) {
    const key = assertChatUploadKeyAccess(rawKey, userId);
    urls.set(key, await storage.getSignedUrl(key, 7 * 24 * 60 * 60));
  }
  return replaceChatUploadReferences(value, urls);
}

async function hydratePipelineReferences(value: unknown, userId: string, storage: StorageProvider): Promise<unknown> {
  const withAssets = await hydrateAssetReferences(value, userId);
  return hydrateChatUploadReferences(withAssets, userId, storage);
}

async function hydrateMediaAssetInputs(inputs: Record<string, unknown>, userId: string): Promise<Record<string, unknown>> {
  const ids = Object.values(inputs)
    .map((value) => mediaAssetInputId(value))
    .filter((value): value is string => typeof value === 'string' && value.length > 0);
  if (ids.length === 0) return inputs;
  const assets = await prisma.mediaAsset.findMany({
    where: { id: { in: ids }, isActive: true },
    select: { id: true, publicUrl: true, ownerUserId: true },
  });
  if (assets.length === 0) return inputs;
  const forbidden = assets.find((asset) => asset.ownerUserId && asset.ownerUserId !== userId);
  if (forbidden) {
    throw new Error(`INVALID_ASSET_ACCESS: ${forbidden.id}`);
  }
  const urls = new Map(assets.map((asset) => [asset.id, asset.publicUrl]));
  return Object.fromEntries(
    Object.entries(inputs).map(([key, value]) => [
      key,
      typeof value === 'string' && mediaAssetInputId(value) && urls.has(mediaAssetInputId(value)!)
        ? urls.get(mediaAssetInputId(value)!)
        : value,
    ]),
  );
}

function mediaAssetInputId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = value.match(/^asset:([a-zA-Z0-9_-]+)$/);
  if (match) return match[1];
  return value;
}

function resolveToken(token: string, context: PlaceholderContext): unknown {
  if (token === 'tier_model') return context.tierModel;
  if (token.startsWith('user.')) {
    return readPath(context.userInputs, token.slice('user.'.length));
  }
  if (token.startsWith('step_')) {
    const [stepId, ...pathParts] = token.split('.');
    const output = context.stepOutputs[stepId];
    if (pathParts.length === 0 || (pathParts.length === 1 && pathParts[0] === 'output')) {
      return output;
    }
    if (pathParts[0] === 'output') {
      return readPath(output, pathParts.slice(1).join('.'));
    }
    return readPath(output, pathParts.join('.'));
  }
  return undefined;
}

function readPath(source: unknown, path: string): unknown {
  if (!path) return source;
  return path.split('.').reduce<unknown>((current, part) => {
    if (!current || typeof current !== 'object') return undefined;
    return (current as Record<string, unknown>)[part];
  }, source);
}

function isTierChoice(value: unknown): value is { standard: unknown; pro: unknown } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return 'standard' in record && 'pro' in record && Object.keys(record).every((key) => key === 'standard' || key === 'pro');
}

type LibraryMediaKind = 'user-avatar' | 'user-location';

type LibraryGenerationMeta = {
  kind: LibraryMediaKind;
  title: string;
  prompt: string;
};

export function parseLibraryGenerationMeta(value: unknown): LibraryGenerationMeta | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const root = value as Record<string, unknown>;
  const raw = root.libraryGeneration;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const meta = raw as Record<string, unknown>;
  const kind = meta.kind;
  const title = meta.title;
  const prompt = meta.prompt;
  if ((kind !== 'user-avatar' && kind !== 'user-location') || typeof title !== 'string' || typeof prompt !== 'string') {
    return null;
  }
  return { kind, title, prompt };
}

export async function createLibraryMediaAssetFromProject(params: {
  projectId: string;
  userId: string;
  projectUserInputs: unknown;
  finalOutput: { resultImage?: string; resultVideo?: string; resultThumbnail?: string };
  storage: StorageProvider;
}) {
  const meta = parseLibraryGenerationMeta(params.projectUserInputs);
  if (!meta) throw new Error('LIBRARY_GENERATION_META_MISSING');
  if (!params.finalOutput.resultImage) throw new Error('LIBRARY_GENERATION_OUTPUT_MISSING');

  const media = await materialiseLibraryImage(params.finalOutput.resultImage, meta.kind, params.storage);
  const aggregate = await prisma.mediaAsset.aggregate({
    where: { ownerUserId: params.userId, kind: meta.kind },
    _max: { sortOrder: true },
  });
  return prisma.mediaAsset.create({
    data: {
      ownerUserId: params.userId,
      kind: meta.kind,
      title: meta.title,
      description: meta.prompt,
      tags: ['generated'],
      storageKey: media.storageKey,
      publicUrl: media.publicUrl,
      thumbnailKey: null,
      width: media.width ?? null,
      height: media.height ?? null,
      frameCount: null,
      durationSec: null,
      fileSize: media.fileSize,
      mimeType: media.mimeType,
      isActive: true,
      sortOrder: (aggregate._max.sortOrder ?? 0) + 10,
    },
  });
}

async function materialiseLibraryImage(outputUrl: string, kind: LibraryMediaKind, storage: StorageProvider) {
  const existingKey = storageKeyFromPublicUrl(outputUrl);
  if (existingKey) {
    const local = await readLocalStorageImage(existingKey).catch(() => null);
    if (local) {
      return {
        storageKey: existingKey,
        publicUrl: outputUrl,
        ...local,
      };
    }
  }

  const downloaded = await fetch(outputUrl);
  if (!downloaded.ok) {
    throw new Error(`LIBRARY_GENERATION_DOWNLOAD_FAILED: ${downloaded.status}`);
  }
  const contentType = downloaded.headers.get('content-type') ?? 'image/jpeg';
  const buffer = Buffer.from(await downloaded.arrayBuffer());
  const ext = extensionForImage(contentType, outputUrl);
  const storageKey = existingKey ?? `media-assets/${kind}/${crypto.randomUUID()}.${ext}`;
  const uploaded = await storage.upload({ key: storageKey, body: buffer, contentType });
  const metadata = await sharp(buffer).metadata().catch(() => undefined);
  return {
    storageKey: uploaded.key,
    publicUrl: uploaded.url,
    fileSize: buffer.length,
    mimeType: contentType,
    width: metadata?.width,
    height: metadata?.height,
  };
}

function storageKeyFromPublicUrl(url: string) {
  const marker = '/static/';
  const index = url.indexOf(marker);
  if (index === -1) return null;
  return decodeURIComponent(url.slice(index + marker.length).replace(/^\/+/, ''));
}

async function readLocalStorageImage(key: string) {
  const rootDir = resolveWorkspacePath(process.env.UPLOADS_DIR ?? './uploads');
  const target = path.resolve(rootDir, key.replace(/^\/+/, ''));
  if (!target.startsWith(rootDir + path.sep) && target !== rootDir) {
    throw new Error(`INVALID_STORAGE_KEY: ${key}`);
  }
  const buffer = await fs.readFile(target);
  const [stat, metadata] = await Promise.all([
    fs.stat(target),
    sharp(buffer).metadata().catch(() => undefined),
  ]);
  return {
    fileSize: stat.size,
    mimeType: mimeTypeForPath(target),
    width: metadata?.width,
    height: metadata?.height,
  };
}

function extensionForImage(contentType: string, url: string) {
  if (contentType.includes('png')) return 'png';
  if (contentType.includes('webp')) return 'webp';
  if (contentType.includes('jpeg') || contentType.includes('jpg')) return 'jpg';
  const ext = url.split('?')[0]?.split('.').pop()?.toLowerCase();
  if (ext === 'png' || ext === 'webp' || ext === 'jpg' || ext === 'jpeg') return ext === 'jpeg' ? 'jpg' : ext;
  return 'jpg';
}

function mimeTypeForPath(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  return 'image/jpeg';
}

function normaliseFinalOutput(output: unknown): {
  resultImage?: string;
  resultVideo?: string;
  resultThumbnail?: string;
} {
  if (!output || typeof output !== 'object') return {};
  const value = output as Partial<BlockOutput> & Record<string, unknown>;
  const url = typeof value.url === 'string' ? value.url : undefined;
  if (value.type === 'image' && url) return { resultImage: url };
  if (value.type === 'video' && url) return { resultVideo: url };
  return {
    resultImage: typeof value.resultImage === 'string' ? value.resultImage : undefined,
    resultVideo: typeof value.resultVideo === 'string' ? value.resultVideo : undefined,
    resultThumbnail: typeof value.resultThumbnail === 'string' ? value.resultThumbnail : undefined,
  };
}

async function persistProgress(
  generationId: string,
  stepProgress: StepProgressEntry[],
  stepIndex: number,
  totalSteps: number,
  stepPercent: number,
) {
  const aggregate = Math.round(((stepIndex + clampPercent(stepPercent) / 100) / totalSteps) * 100);
  await prisma.project.update({
    where: { id: generationId },
    data: {
      progress: Math.min(99, aggregate),
      stepProgress: toJson(stepProgress),
    },
  });
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}
