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

const aspectRatioSchema = {
  type: 'string',
  title: 'Aspect ratio',
  enum: ['auto', '9:16', '16:9', '1:1'],
  default: 'auto',
  description: 'auto keeps/probes the input media ratio where the provider supports it.',
};

const restoreModels: ModelOption[] = [
  {
    slug: 'mock-restore',
    title: 'Mock restore placeholder',
    tierHint: 'both',
    estimatedCostCoins: 0,
    estimatedCostUsd: 0,
    provider: 'mock',
    description: 'Local/mock placeholder for old-photo restoration. Does not call a paid provider.',
  },
];

const imageToVideoModels: ModelOption[] = [
  {
    slug: 'kling-std',
    title: 'Kling 2.6 Standard',
    tierHint: 'standard',
    estimatedCostCoins: 20,
    estimatedCostUsd: 0.20,
    provider: 'piapi',
    description: 'PiAPI Kling image-to-video standard mode. Creates a short video from one image.',
    limits: { maxDurationSec: 10, maxResolution: '1280x720' },
    requiredParams: ['image_url'],
    docsUrl: 'https://piapi.ai/docs/kling-api/create-task',
  },
  {
    slug: 'kling-pro',
    title: 'Kling 2.6 Pro',
    tierHint: 'pro',
    estimatedCostCoins: 30,
    estimatedCostUsd: 0.33,
    provider: 'piapi',
    description: 'PiAPI Kling image-to-video pro mode. Better motion quality for short portrait clips.',
    limits: { maxDurationSec: 10, maxResolution: '1280x720' },
    requiredParams: ['image_url'],
    docsUrl: 'https://piapi.ai/docs/kling-api/create-task',
  },
];

const faceSwapModels: ModelOption[] = [
  {
    slug: 'qubico-video-toolkit',
    title: 'Qubico Video Toolkit Face Swap',
    tierHint: 'both',
    estimatedCostCoins: 40,
    estimatedCostUsd: 0.48,
    provider: 'piapi',
    description: 'Qubico video-toolkit face swap through PiAPI. Uses one face image and one target video URL.',
    limits: { maxDurationSec: 10, maxFileSize: '15MB' },
    requiredParams: ['swap_image', 'target_video'],
    docsUrl: 'https://piapi.ai/docs/video-face-swap-api/create-task',
  },
];

const textToVideoModels: ModelOption[] = [
  {
    slug: 'veo-3.1',
    title: 'Veo 3.1 Mock',
    tierHint: 'standard',
    estimatedCostCoins: 45,
    provider: 'mock',
    description: 'Mock text-to-video model placeholder for future provider integration.',
  },
  {
    slug: 'seedance-2.0-text',
    title: 'Seedance 2.0 Text Mock',
    tierHint: 'pro',
    estimatedCostCoins: 80,
    provider: 'mock',
    description: 'Mock pro text-to-video model placeholder for future provider integration.',
  },
];

const imageEditModels: ModelOption[] = [
  {
    slug: 'nano-banana',
    title: 'Nano Banana 2 (Gemini)',
    tierHint: 'standard',
    estimatedCostCoins: 6,
    estimatedCostUsd: 0.06,
    provider: 'piapi',
    description: 'PiAPI Gemini Nano Banana 2 image editing. Accepts a prompt and up to 14 input image URLs; P7a uses one image.',
    limits: { maxResolution: '4K', maxFileSize: '10MB', maxInputImages: 14 },
    requiredParams: ['prompt'],
    docsUrl: 'https://piapi.ai/docs/gemini-api/nano-banana-2',
  },
];

export const BLOCK_CATALOG: BlockCatalogItem[] = [
  {
    slug: 'image-restore',
    title: 'Восстановление старого фото',
    description: 'Убирает шум, царапины и мягко восстанавливает детали изображения.',
    category: 'image',
    paramsSchema: objectSchema({
      model: modelTierObject,
      strength: { type: 'number', title: 'Restoration strength', default: 0.75, minimum: 0, maximum: 1, description: 'How strongly the mock restore placeholder should alter the input. Real restoration now uses image-edit.' },
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
      scale: { type: 'number', title: 'Scale', enum: [2, 4], default: 2, description: 'Upscale multiplier. This block is still mock-only in P7a.' },
    }),
    supportedModels: [
      { slug: 'upscale-x2', title: 'Upscale x2 Mock', tierHint: 'standard', estimatedCostCoins: 2, provider: 'mock', description: 'Mock x2 upscale.' },
      { slug: 'upscale-x4', title: 'Upscale x4 Mock', tierHint: 'pro', estimatedCostCoins: 5, provider: 'mock', description: 'Mock x4 upscale.' },
    ],
  },
  {
    slug: 'image-edit',
    title: 'Редактирование изображения',
    description: 'Universal image-to-image block: restoration, stylization, background edits, and object changes through a hidden admin prompt.',
    category: 'image',
    paramsSchema: objectSchema(
      {
        model: modelTierObject,
        prompt: { type: 'string', title: 'Prompt', description: 'Admin-only prompt for the image editing model. It is not shown to the user.' },
        negative_prompt: { type: 'string', title: 'Negative prompt', description: 'Compatibility field. Nano Banana 2 docs do not expose this parameter, so PiAPI payload does not send it.' },
        strength: { type: 'number', title: 'Strength', minimum: 0, maximum: 1, description: 'Compatibility field. Nano Banana 2 docs do not expose this parameter, so PiAPI payload does not send it.' },
        output_format: { type: 'string', title: 'Output format', enum: ['jpg', 'png', 'webp'], default: 'jpg', description: 'Nano Banana 2 output image format.' },
        aspect_ratio: aspectRatioSchema,
        resolution: { type: 'string', title: 'Resolution', enum: ['1K', '2K', '4K'], default: '1K', description: 'Nano Banana 2 output resolution. Pricing grows with resolution.' },
      },
      ['prompt'],
    ),
    supportedModels: imageEditModels,
  },
  {
    slug: 'image-to-video',
    title: 'Анимация фото в видео',
    description: 'Превращает статичное фото в короткий ролик.',
    category: 'video',
    paramsSchema: objectSchema(
      {
        model: modelTierObject,
        duration: { type: 'number', title: 'Duration seconds', default: 5, minimum: 1, maximum: 10, description: 'Video duration in seconds. Kling through PiAPI is capped at 10 seconds in this product.' },
        prompt: { type: 'string', title: 'Prompt', description: 'Motion guidance sent to the model, for example: subject smiles and waves.' },
        aspect_ratio: aspectRatioSchema,
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
        target_video: { type: 'string', title: 'Target video URL', description: 'Target video URL. For media-select user fields, use a placeholder like {{user.trendVideo}}.' },
        prompt: { type: 'string', title: 'Prompt', description: 'Internal note for the step. Qubico face-swap currently does not use prompt text.' },
        duration: { type: 'number', title: 'Duration seconds', default: 5, minimum: 1, maximum: 10, description: 'Expected target video duration, used for cost estimation.' },
        estimatedFrames: { type: 'number', title: 'Estimated frames', default: 120, minimum: 1, description: 'Cost estimation hint. PiAPI Qubico is billed roughly per processed frame.' },
        aspect_ratio: aspectRatioSchema,
      },
      ['target_video'],
    ),
    supportedModels: faceSwapModels,
  },
  {
    slug: 'video-compose',
    title: 'Финальная сборка видео',
    description: 'Собирает итоговый ролик: watermark, музыка, титры и обложка.',
    category: 'compose',
    paramsSchema: objectSchema({
      watermark: { type: 'boolean', title: 'Watermark', default: true, description: 'Whether to add the Allvision watermark in local compose.' },
      title: { type: 'string', title: 'Title', description: 'Optional title/watermark text for local compose.' },
      music: { type: 'string', title: 'Music URL', description: 'Optional music URL for future compose behavior.' },
    }),
    supportedModels: [
      { slug: 'ffmpeg-local', title: 'FFmpeg Local Mock', tierHint: 'both', estimatedCostCoins: 1, provider: 'local', description: 'Local FFmpeg/pass-through compose step. No paid provider call.' },
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
        prompt: { type: 'string', title: 'Prompt', description: 'Text prompt for future text-to-video provider integration. P7a keeps this mock-only.' },
        duration: { type: 'number', title: 'Duration seconds', default: 5, minimum: 1, maximum: 10, description: 'Desired duration in seconds.' },
        aspect_ratio: aspectRatioSchema,
      },
      ['prompt', 'duration'],
    ),
    supportedModels: textToVideoModels,
  },
];

export function getBlockCatalogItem(slug: string): BlockCatalogItem | undefined {
  return BLOCK_CATALOG.find((block) => block.slug === slug);
}
