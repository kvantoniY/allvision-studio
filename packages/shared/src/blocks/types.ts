export type BlockCategory = 'image' | 'video' | 'motion' | 'audio' | 'text' | 'compose';

export type ModelTierHint = 'standard' | 'pro' | 'both';

export interface ModelOption {
  slug: string;
  title: string;
  tierHint: ModelTierHint;
  estimatedCostCoins: number;
  estimatedCostUsd?: number;
  /** Lumean — отдельный сервис озвучки со своим балансом, не часть fal. */
  provider: 'piapi' | 'fal' | 'lumean' | 'mock' | 'local';
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
  /** Человекочитаемые подписи для enum-значений в admin UI: значение -> подпись. */
  enumLabels?: Record<string, string>;
  default?: unknown;
  minimum?: number;
  maximum?: number;
  items?: JsonSchemaObject | Record<string, unknown>;
  additionalProperties?: boolean | JsonSchemaObject | Record<string, unknown>;
  /** id группы из BlockCatalogItem.paramGroups — параметры рендерятся секциями в admin UI. */
  group?: string;
};

/** Секция параметров блока в конструкторе услуг (например, поля конкретного режима роутера). */
export type ParamGroupDef = {
  id: string;
  title: string;
  description?: string;
  /**
   * Условная видимость секции: первый параметр из whenFields с КОНКРЕТНЫМ значением
   * (не плейсхолдер {{...}} и не пусто) определяет режим; секция показывается, если
   * значение входит в whenValues. Если конкретного значения нет (режим выбирает
   * пользователь) — секция показывается.
   */
  whenFields?: string[];
  whenValues?: string[];
  /** Свёрнута по умолчанию (legacy/редко используемые параметры). */
  collapsed?: boolean;
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
  /** Секции для группировки параметров в admin-конструкторе (роутеры с режимами). */
  paramGroups?: ParamGroupDef[];
}
