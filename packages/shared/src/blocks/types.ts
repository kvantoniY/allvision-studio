export type BlockCategory = 'image' | 'video' | 'motion' | 'audio' | 'text' | 'compose';

export type ModelTierHint = 'standard' | 'pro' | 'both';

export interface ModelOption {
  slug: string;
  title: string;
  tierHint: ModelTierHint;
  estimatedCostCoins: number;
  estimatedCostUsd?: number;
  provider: 'piapi' | 'mock' | 'local';
  providerModel?: string;
  taskType?: string;
  description?: string;
  limits?: {
    maxDurationSec?: number;
    minDurationSec?: number;
    maxResolution?: string;
    resolutions?: string[];
    aspectRatios?: string[];
    maxFileSize?: string;
    [key: string]: unknown;
  };
  requiredParams?: string[];
  optionalParams?: string[];
  docsUrl?: string;
}

export type JsonSchemaObject = {
  type: string;
  title?: string;
  description?: string;
  properties?: Record<string, JsonSchemaObject | Record<string, unknown>>;
  required?: string[];
  enum?: unknown[];
  default?: unknown;
  minimum?: number;
  maximum?: number;
  items?: JsonSchemaObject | Record<string, unknown>;
  additionalProperties?: boolean | JsonSchemaObject | Record<string, unknown>;
};

export interface BlockCatalogItem {
  slug: string;
  title: string;
  description: string;
  category: BlockCategory;
  paramsSchema: JsonSchemaObject;
  supportedModels: ModelOption[];
  useWhen?: string;
  compatibleInputs?: string[];
  examples?: string[];
}
