import { Prisma, prisma, ProjectStatus } from '@allvision/database';
import type { StorageProvider } from '@allvision/shared';
import { getAIProvider, getStorageProvider } from './providers';
import type { ProviderMode } from './providers';
import { markProjectFailed } from './processors/base';
import { getBlock } from './blocks/registry';
import type { BlockDefinition, BlockLogger, BlockOutput } from './blocks/types';
import { logger as defaultLogger } from './utils/logger';
import { isProviderUserSafeError, providerUnavailableMessage } from './providers/provider-errors';

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
  mode?: ProviderMode;
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
  const steps = parsePipelineConfig(params.pipelineConfig);
  if (steps.length === 0) {
    throw new Error('Pipeline config must contain at least one step');
  }

  const getBlockFn = dependencies.getBlock ?? getBlock;
  const logger = dependencies.logger ?? defaultLogger;
  const storage = dependencies.storage ?? getStorageProvider();
  const providerFactory = dependencies.getAIProvider ?? getAIProvider;
  const selectedTier = params.selectedTier ?? 'standard';
  const mode = params.mode ?? 'production';
  const userInputs = params.userInputs ?? {};
  const stepOutputs: Record<string, unknown> = {};
  const stepProgress: StepProgressEntry[] = steps.map((step) => ({
    stepId: step.id,
    blockSlug: step.blockSlug,
    status: 'pending',
    progress: 0,
  }));

  const project = await prisma.project.findUnique({
    where: { id: params.generationId },
    select: { id: true, status: true, userId: true },
  });
  if (!project) throw new Error(`Generation project not found: ${params.generationId}`);

  await prisma.project.update({
    where: { id: params.generationId },
    data: {
      status: ProjectStatus.PROCESSING,
      progress: 0,
      errorMessage: null,
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
    await prisma.project.update({
      where: { id: params.generationId },
      data: {
        status: ProjectStatus.COMPLETED,
        progress: 100,
        completedAt: new Date(),
        errorMessage: null,
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
      { refundTokens: true },
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
