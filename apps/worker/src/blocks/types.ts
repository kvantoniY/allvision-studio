import type { z } from 'zod';
import type {
  AIProvider,
  BlockCategory,
  ModelOption,
  StorageProvider,
} from '@allvision/shared';

export interface BlockLogger {
  debug?: (message: string, meta?: unknown) => void;
  info: (message: string, meta?: unknown) => void;
  warn: (message: string, meta?: unknown) => void;
  error: (message: string, meta?: unknown) => void;
}

export interface BlockContext {
  generationId: string;
  reportProgress: (percent: number) => Promise<void>;
  getAIProvider: () => AIProvider;
  storage: StorageProvider;
  logger: BlockLogger;
}

export interface BlockDefinition {
  slug: string;
  title: string;
  description: string;
  category: BlockCategory;
  inputSchema: z.ZodSchema;
  outputSchema: z.ZodSchema;
  paramsSchema: z.ZodSchema;
  supportedModels: ModelOption[];
  executor: (params: unknown, input: unknown, ctx: BlockContext) => Promise<unknown>;
  estimatedCostCoins: (params: unknown) => number;
}

export type BlockOutputType = 'image' | 'video' | 'text';

export interface FileBlockOutput {
  type: Exclude<BlockOutputType, 'text'>;
  url: string;
  metadata?: Record<string, unknown>;
}

export interface TextBlockOutput {
  type: 'text';
  text: string;
  metadata?: Record<string, unknown>;
}

export type BlockOutput = FileBlockOutput | TextBlockOutput;
