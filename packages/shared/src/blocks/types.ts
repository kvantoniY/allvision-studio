export type BlockCategory = 'image' | 'video' | 'audio' | 'text' | 'compose';

export type ModelTierHint = 'standard' | 'pro' | 'both';

export interface ModelOption {
  slug: string;
  title: string;
  tierHint: ModelTierHint;
  estimatedCostCoins: number;
  estimatedCostUsd?: number;
}

export type JsonSchemaObject = {
  type: string;
  title?: string;
  description?: string;
  properties?: Record<string, JsonSchemaObject | Record<string, unknown>>;
  required?: string[];
  enum?: unknown[];
  default?: unknown;
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
}
