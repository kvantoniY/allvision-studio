import type { BlockCatalogItem, JsonSchemaObject, ModelOption } from './types';

function objectSchema(
  properties: Record<string, JsonSchemaObject | Record<string, unknown>>,
  required: string[] = [],
): JsonSchemaObject {
  return {
    type: 'object',
    properties,
    required,
    additionalProperties: false,
  };
}

const modelTierObject: JsonSchemaObject = objectSchema(
  {
    standard: { type: 'string', title: 'Standard model' },
    pro: { type: 'string', title: 'Pro model' },
  },
  ['standard', 'pro'],
);

const restoreModels: ModelOption[] = [
  { slug: 'gfpgan', title: 'GFPGAN Mock', tierHint: 'standard', estimatedCostCoins: 3 },
  { slug: 'nano-banana-restore', title: 'Nano Banana Restore Mock', tierHint: 'pro', estimatedCostCoins: 7 },
];

const imageToVideoModels: ModelOption[] = [
  { slug: 'kling-2.6', title: 'Kling 2.6 Mock', tierHint: 'standard', estimatedCostCoins: 20 },
  { slug: 'seedance-2.0', title: 'Seedance 2.0 Mock', tierHint: 'pro', estimatedCostCoins: 45 },
];

const faceSwapModels: ModelOption[] = [
  { slug: 'faceswap-lite', title: 'FaceSwap Lite Mock', tierHint: 'standard', estimatedCostCoins: 18 },
  { slug: 'faceswap-pro', title: 'FaceSwap Pro Mock', tierHint: 'pro', estimatedCostCoins: 35 },
];

const textToVideoModels: ModelOption[] = [
  { slug: 'veo-3.1', title: 'Veo 3.1 Mock', tierHint: 'standard', estimatedCostCoins: 45 },
  { slug: 'seedance-2.0-text', title: 'Seedance 2.0 Text Mock', tierHint: 'pro', estimatedCostCoins: 80 },
];

export const BLOCK_CATALOG: BlockCatalogItem[] = [
  {
    slug: 'image-restore',
    title: 'Восстановление старого фото',
    description: 'Убирает шум, царапины и мягко восстанавливает детали изображения.',
    category: 'image',
    paramsSchema: objectSchema({
      model: modelTierObject,
      strength: { type: 'number', title: 'Restoration strength', default: 0.75 },
    }),
    supportedModels: restoreModels,
  },
  {
    slug: 'image-upscale',
    title: 'Увеличение разрешения',
    description: 'Повышает разрешение изображения перед анимацией или печатью.',
    category: 'image',
    paramsSchema: objectSchema({
      model: modelTierObject,
      scale: { type: 'number', title: 'Scale', enum: [2, 4], default: 2 },
    }),
    supportedModels: [
      { slug: 'upscale-x2', title: 'Upscale x2 Mock', tierHint: 'standard', estimatedCostCoins: 2 },
      { slug: 'upscale-x4', title: 'Upscale x4 Mock', tierHint: 'pro', estimatedCostCoins: 5 },
    ],
  },
  {
    slug: 'image-to-video',
    title: 'Анимация фото в видео',
    description: 'Превращает статичное фото в короткий ролик.',
    category: 'video',
    paramsSchema: objectSchema(
      {
        model: modelTierObject,
        duration: { type: 'number', title: 'Duration seconds', default: 5 },
        prompt: { type: 'string', title: 'Prompt' },
      },
      ['duration'],
    ),
    supportedModels: imageToVideoModels,
  },
  {
    slug: 'face-swap-video',
    title: 'Свап лица в видео',
    description: 'Подставляет лицо пользователя в готовый видео-шаблон.',
    category: 'video',
    paramsSchema: objectSchema(
      {
        model: modelTierObject,
        templateVideo: { type: 'string', title: 'Template video URL' },
        prompt: { type: 'string', title: 'Prompt' },
      },
      ['templateVideo'],
    ),
    supportedModels: faceSwapModels,
  },
  {
    slug: 'video-compose',
    title: 'Финальная сборка видео',
    description: 'Собирает итоговый ролик: watermark, музыка, титры и обложка.',
    category: 'compose',
    paramsSchema: objectSchema({
      watermark: { type: 'boolean', title: 'Watermark', default: true },
      title: { type: 'string', title: 'Title' },
      music: { type: 'string', title: 'Music URL' },
    }),
    supportedModels: [
      { slug: 'ffmpeg-local', title: 'FFmpeg Local Mock', tierHint: 'both', estimatedCostCoins: 1 },
    ],
  },
  {
    slug: 'text-to-video',
    title: 'Видео по промпту',
    description: 'Создаёт видео напрямую по текстовому описанию.',
    category: 'video',
    paramsSchema: objectSchema(
      {
        model: modelTierObject,
        prompt: { type: 'string', title: 'Prompt' },
        duration: { type: 'number', title: 'Duration seconds', default: 5 },
      },
      ['prompt', 'duration'],
    ),
    supportedModels: textToVideoModels,
  },
];

export function getBlockCatalogItem(slug: string): BlockCatalogItem | undefined {
  return BLOCK_CATALOG.find((block) => block.slug === slug);
}
