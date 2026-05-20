import { getBlockCatalogItem } from '../blocks/catalog';
import { costUsdToCoins, estimateModelCostUsd } from '../blocks/pricing';
import type { BlockCatalogItem, ModelOption } from '../blocks/types';
import { capabilityDurationOptions, getPiAPIModelCapability, type PiAPIParamCapability } from '../piapi/capabilities';

export type ChatCategory = 'image' | 'video';
export type ChatAspectRatio = '1:1' | '9:16' | '16:9' | '4:3' | '3:4' | '21:9' | '9:21' | 'auto';

export interface ChatModelOption {
  slug: string;
  blockSlug: string;
  category: ChatCategory;
  title: string;
  description: string;
  estimatedCostCoins: number;
  estimatedCostUsd: number;
  acceptsImageInput: boolean;
  acceptsVideoInput: boolean;
  acceptsAudioInput: boolean;
  acceptsTextOnly: boolean;
  supportedAspectRatios: ChatAspectRatio[];
  supportsAudio: boolean;
  audioParam?: 'enable_audio' | 'generate_audio';
  audioInputParam?: 'audio_url' | 'audio_urls';
  minDurationSec?: number;
  maxDurationSec?: number;
  defaultDurationSec?: number;
  durationOptions: number[];
  supportedResolutions: string[];
  defaultResolution?: string;
  advancedParams: PiAPIParamCapability[];
  experimental?: boolean;
}

function requireBlock(blockSlug: string): BlockCatalogItem {
  const block = getBlockCatalogItem(blockSlug);
  if (!block) throw new Error(`CHAT_MODELS block is missing from BLOCK_CATALOG: ${blockSlug}`);
  return block;
}

function requireModel(blockSlug: string, modelSlug: string): ModelOption {
  const block = requireBlock(blockSlug);
  const model = block.supportedModels.find((item) => item.slug === modelSlug);
  if (!model) throw new Error(`CHAT_MODELS model is missing from ${blockSlug}: ${modelSlug}`);
  return model;
}

function fromCatalog(params: {
  blockSlug: string;
  modelSlug: string;
  category: ChatCategory;
  description: string;
  acceptsImageInput: boolean;
  acceptsVideoInput?: boolean;
  acceptsAudioInput?: boolean;
  acceptsTextOnly: boolean;
  supportedAspectRatios?: ChatAspectRatio[];
  experimental?: boolean;
}): ChatModelOption {
  const model = requireModel(params.blockSlug, params.modelSlug);
  const capability = getPiAPIModelCapability(model.slug);
  const audioParam = model.optionalParams?.includes('enable_audio')
    ? 'enable_audio'
    : model.optionalParams?.includes('generate_audio')
      ? 'generate_audio'
      : undefined;
  const audioInputParam = capability?.audio.inputParam;
  const ratios = (capability?.aspectRatios ?? params.supportedAspectRatios ?? ['auto', '1:1', '9:16', '16:9'])
    .filter((value): value is ChatAspectRatio => ['auto', '1:1', '9:16', '16:9', '4:3', '3:4', '21:9', '9:21'].includes(value));
  return {
    slug: model.slug,
    blockSlug: params.blockSlug,
    category: params.category,
    title: model.title,
    description: params.description,
    estimatedCostCoins: model.estimatedCostCoins,
    estimatedCostUsd: model.estimatedCostUsd ?? 0,
    acceptsImageInput: params.acceptsImageInput || !!capability?.inputKinds.includes('image'),
    acceptsVideoInput: params.acceptsVideoInput ?? !!capability?.inputKinds.includes('video'),
    acceptsAudioInput: params.acceptsAudioInput ?? !!capability?.inputKinds.includes('audio'),
    acceptsTextOnly: params.acceptsTextOnly,
    supportedAspectRatios: ratios.length ? ratios : ['auto'],
    supportsAudio: !!audioParam,
    audioParam,
    audioInputParam,
    minDurationSec: capability?.duration?.minimum ?? model.limits?.minDurationSec,
    maxDurationSec: capability?.duration?.maximum ?? model.limits?.maxDurationSec,
    defaultDurationSec: capability?.duration?.default ?? defaultDurationForModel(model),
    durationOptions: params.category === 'video' ? durationOptionsForModel(model) : [],
    supportedResolutions: capability?.resolutions ?? model.limits?.resolutions ?? [],
    defaultResolution: capability?.defaultResolution,
    advancedParams: capability?.params ?? [],
    experimental: params.experimental,
  };
}

function defaultDurationForModel(model: ModelOption) {
  if (model.slug.startsWith('veo-3.1')) return 8;
  if (model.limits?.minDurationSec && model.limits.minDurationSec > 5) return model.limits.minDurationSec;
  return 5;
}

function durationOptionsForModel(model: ModelOption) {
  const capability = getPiAPIModelCapability(model.slug);
  if (capability) return capabilityDurationOptions(capability);
  const min = model.limits?.minDurationSec ?? 5;
  const max = model.limits?.maxDurationSec ?? 10;
  const candidates = max <= 8
    ? [max]
    : min > 5
      ? [min, max]
      : max >= 15
        ? [5, 10, 15]
        : [5, 10];
  return [...new Set(candidates.filter((value) => value >= min && value <= max))];
}

function modelBySlug(slug: string) {
  const chatModel = getChatModel(slug);
  if (!chatModel) return null;
  return requireModel(chatModel.blockSlug, chatModel.slug);
}

export function estimateChatGenerationCostCoins(
  modelSlug: string,
  options: { duration?: number; generateAudio?: boolean; params?: Record<string, unknown> } = {},
) {
  const chatModel = getChatModel(modelSlug);
  const catalogModel = modelBySlug(modelSlug);
  if (!chatModel || !catalogModel) return 0;
  const params: Record<string, unknown> = { ...(options.params ?? {}) };
  if (chatModel.category === 'video') {
    params.duration = options.duration ?? chatModel.defaultDurationSec ?? 5;
  }
  if (options.generateAudio && chatModel.audioParam) {
    params[chatModel.audioParam] = true;
  }
  return costUsdToCoins(estimateModelCostUsd(catalogModel, params));
}

export const CHAT_MODELS: ChatModelOption[] = [
  fromCatalog({
    blockSlug: 'image-edit',
    modelSlug: 'nano-banana',
    category: 'image',
    description: 'Создает изображение по промпту или редактирует приложенный референс. Хороший выбор для аватаров, обложек, быстрых визуальных идей и аккуратной правки фото.',
    acceptsImageInput: true,
    acceptsTextOnly: true,
    supportedAspectRatios: ['1:1', '9:16', '16:9', 'auto'],
  }),
  fromCatalog({
    blockSlug: 'image-to-video',
    modelSlug: 'kling-std',
    category: 'video',
    description: 'Анимирует приложенное изображение в короткий ролик в стандартном режиме Kling 2.6. Подходит для недорогих пробных оживлений фото.',
    acceptsImageInput: true,
    acceptsTextOnly: false,
  }),
  fromCatalog({
    blockSlug: 'image-to-video',
    modelSlug: 'kling-pro',
    category: 'video',
    description: 'Анимирует изображение в Pro-режиме Kling 2.6 с более стабильным лицом и плавным движением. Используйте, когда качество важнее цены.',
    acceptsImageInput: true,
    acceptsTextOnly: false,
  }),
  fromCatalog({
    blockSlug: 'image-to-video',
    modelSlug: 'kling-3-std',
    category: 'video',
    description: 'Kling 3.0 для более выразительной image-to-video генерации из референс-фото. Хороший баланс цены и современного качества.',
    acceptsImageInput: true,
    acceptsTextOnly: false,
  }),
  fromCatalog({
    blockSlug: 'image-to-video',
    modelSlug: 'kling-3-pro',
    category: 'video',
    description: 'Pro-режим Kling 3.0 для самых качественных роликов из изображения. Подходит для wow-сцен, промо и финальных вариантов.',
    acceptsImageInput: true,
    acceptsTextOnly: false,
  }),
  fromCatalog({
    blockSlug: 'image-to-video',
    modelSlug: 'hailuo-2.3-fast',
    category: 'video',
    description: 'Быстрый Hailuo/MiniMax для недорогой анимации изображения. Удобен для черновиков и коротких тестов движения.',
    acceptsImageInput: true,
    acceptsTextOnly: false,
  }),
  fromCatalog({
    blockSlug: 'image-to-video',
    modelSlug: 'hailuo-2.3',
    category: 'video',
    description: 'Основной Hailuo/MiniMax для image-to-video генерации. Дает альтернативный характер движения, если Kling выглядит слишком нейтрально.',
    acceptsImageInput: true,
    acceptsTextOnly: false,
  }),
  fromCatalog({
    blockSlug: 'image-to-video',
    modelSlug: 'veo-3.1-fast-i2v',
    category: 'video',
    description: 'Fast Veo 3.1 image-to-video с выбором длительности, формата, negative prompt и опционального звука.',
    acceptsImageInput: true,
    acceptsTextOnly: false,
    supportedAspectRatios: ['16:9', '9:16', '1:1'],
  }),
  fromCatalog({
    blockSlug: 'image-to-video',
    modelSlug: 'veo-3.1-i2v',
    category: 'video',
    description: 'Quality Veo 3.1 image-to-video для коротких сцен с 1080p и опциональным звуком.',
    acceptsImageInput: true,
    acceptsTextOnly: false,
    supportedAspectRatios: ['16:9', '9:16', '1:1'],
  }),
  fromCatalog({
    blockSlug: 'image-to-video',
    modelSlug: 'seedance-2-fast-first-last',
    category: 'video',
    description: 'Seedance first/last frame mode: анимирует стартовое изображение с optional last-frame reference.',
    acceptsImageInput: true,
    acceptsTextOnly: false,
  }),
  fromCatalog({
    blockSlug: 'image-to-video',
    modelSlug: 'seedance-2-first-last',
    category: 'video',
    description: 'Pro first/last frame mode Seedance 2 для контролируемого перехода между кадрами.',
    acceptsImageInput: true,
    acceptsTextOnly: false,
  }),
  fromCatalog({
    blockSlug: 'image-to-video',
    modelSlug: 'wan-2.6-i2v',
    category: 'video',
    description: 'Wan 2.6 image-to-video с audio_url, seed, negative prompt и настройками движения.',
    acceptsImageInput: true,
    acceptsAudioInput: true,
    acceptsTextOnly: false,
    supportedAspectRatios: ['16:9', '9:16', '1:1'],
  }),
  fromCatalog({
    blockSlug: 'text-to-video',
    modelSlug: 'seedance-2-fast',
    category: 'video',
    description: 'Быстрый text-to-video режим Seedance 2. Создает видео только из промпта и хорошо подходит для недорогих вариантов.',
    acceptsImageInput: false,
    acceptsTextOnly: true,
    supportedAspectRatios: ['9:16', '16:9', '1:1'],
  }),
  fromCatalog({
    blockSlug: 'text-to-video',
    modelSlug: 'seedance-2',
    category: 'video',
    description: 'Pro-режим Seedance 2 для видео по текстовому описанию. Лучше использовать для финальных запросов, где важны детали и стабильность кадра.',
    acceptsImageInput: false,
    acceptsTextOnly: true,
    supportedAspectRatios: ['9:16', '16:9', '1:1'],
  }),
  fromCatalog({
    blockSlug: 'text-to-video',
    modelSlug: 'seedance-2-fast-omni',
    category: 'video',
    description: 'Seedance Fast omni-reference mode: текст плюс image/video/audio references.',
    acceptsImageInput: true,
    acceptsVideoInput: true,
    acceptsAudioInput: true,
    acceptsTextOnly: true,
  }),
  fromCatalog({
    blockSlug: 'text-to-video',
    modelSlug: 'seedance-2-omni',
    category: 'video',
    description: 'Seedance Pro omni-reference mode для генерации по тексту с несколькими референсами.',
    acceptsImageInput: true,
    acceptsVideoInput: true,
    acceptsAudioInput: true,
    acceptsTextOnly: true,
  }),
  fromCatalog({
    blockSlug: 'text-to-video',
    modelSlug: 'hailuo-2.3-fast-text',
    category: 'video',
    description: 'Hailuo/MiniMax 2.3 Fast text-to-video через PiAPI generate-video endpoint.',
    acceptsImageInput: false,
    acceptsTextOnly: true,
  }),
  fromCatalog({
    blockSlug: 'text-to-video',
    modelSlug: 'hailuo-2.3-text',
    category: 'video',
    description: 'Hailuo/MiniMax 2.3 text-to-video как альтернатива Seedance/Veo.',
    acceptsImageInput: false,
    acceptsTextOnly: true,
  }),
  fromCatalog({
    blockSlug: 'text-to-video',
    modelSlug: 'veo-3.1-fast',
    category: 'video',
    description: 'Быстрый Veo 3.1 для кинематографичных роликов по промпту. Подходит для коротких сцен, фонов и establishing shots.',
    acceptsImageInput: false,
    acceptsTextOnly: true,
  }),
  fromCatalog({
    blockSlug: 'text-to-video',
    modelSlug: 'veo-3.1',
    category: 'video',
    description: 'Veo 3.1 для более качественной text-to-video генерации. Используйте для запросов, где важны камера, свет и реалистичная сцена.',
    acceptsImageInput: false,
    acceptsTextOnly: true,
  }),
  fromCatalog({
    blockSlug: 'text-to-video',
    modelSlug: 'wan-2.6',
    category: 'video',
    description: 'Wan 2.6 text-to-video с audio_url, seed, negative prompt и выбором качества.',
    acceptsImageInput: false,
    acceptsAudioInput: true,
    acceptsTextOnly: true,
    supportedAspectRatios: ['16:9', '9:16', '1:1'],
  }),
  fromCatalog({
    blockSlug: 'text-to-video',
    modelSlug: 'sora-2',
    category: 'video',
    description: 'Sora 2 для экспериментальной text-to-video генерации. Модель доступна в каталоге, но реальные paid-вызовы еще нужно smoke-test проверить.',
    acceptsImageInput: false,
    acceptsTextOnly: true,
    experimental: true,
  }),
  fromCatalog({
    blockSlug: 'text-to-video',
    modelSlug: 'sora-2-pro',
    category: 'video',
    description: 'Sora 2 Pro для экспериментальных Pro-видео по промпту. Помечена как бета до отдельной проверки реальных вызовов на проде.',
    acceptsImageInput: false,
    acceptsTextOnly: true,
    experimental: true,
  }),
];

export function getChatModel(slug: string): ChatModelOption | undefined {
  return CHAT_MODELS.find((model) => model.slug === slug);
}

export function listChatModels(category?: ChatCategory): ChatModelOption[] {
  return category ? CHAT_MODELS.filter((model) => model.category === category) : CHAT_MODELS;
}
