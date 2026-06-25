import { getBlockCatalogItem } from '../blocks/catalog';
import { costUsdToCoins, estimateModelCostUsd } from '../blocks/pricing';
import type { BlockCatalogItem, ModelOption } from '../blocks/types';
import { capabilityDurationOptions, getPiAPIModelCapability, type PiAPIParamCapability } from '../piapi/capabilities';

export type ChatCategory = 'image' | 'video';
export type ChatAspectRatio = '1:1' | '9:16' | '16:9' | '4:3' | '3:4' | '21:9' | '9:21' | 'auto';
export type ModelPriceOverrides = Record<string, number>;

const VIDEO_PRICE_MULTIPLIER = 3;

export interface ChatModelOption {
  slug: string;
  blockSlug: string;
  category: ChatCategory;
  familySlug: string;
  familyTitle: string;
  functionTitle: string;
  functionDescription: string;
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
  /** Модель генерирует звук нативно и его нельзя отключить (Seedance, Sora 2). */
  audioAlwaysOn: boolean;
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
  /** Нужен ли текстовый промпт. Для видео-инструментов (например, удаление watermark) — false. */
  requiresPrompt: boolean;
  /** Утилита (обработка готового медиа), а не генератор. Влияет на группировку в UI. */
  tool?: boolean;
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
  familySlug?: string;
  familyTitle?: string;
  functionTitle?: string;
  functionDescription?: string;
  acceptsImageInput: boolean;
  acceptsVideoInput?: boolean;
  acceptsAudioInput?: boolean;
  acceptsTextOnly: boolean;
  supportedAspectRatios?: ChatAspectRatio[];
  experimental?: boolean;
  requiresPrompt?: boolean;
  tool?: boolean;
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
  const family = modelFamilyFor(model.slug, params.blockSlug);
  return {
    slug: model.slug,
    blockSlug: params.blockSlug,
    category: params.category,
    familySlug: params.familySlug ?? family.slug,
    familyTitle: params.familyTitle ?? family.title,
    functionTitle: params.functionTitle ?? functionTitleFor(model.title, params.blockSlug),
    functionDescription: params.functionDescription ?? params.description,
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
    audioAlwaysOn: !!capability?.audio.alwaysOn,
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
    requiresPrompt: params.requiresPrompt ?? true,
    tool: params.tool,
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

function modelFamilyFor(modelSlug: string, blockSlug: string) {
  if (modelSlug === 'nano-banana') return { slug: 'nano-banana', title: 'Nano Banana 2' };
  if (modelSlug.startsWith('kling-motion-2.6') || modelSlug === 'kling-std' || modelSlug === 'kling-pro') return { slug: 'kling-2.6', title: 'Kling 2.6' };
  if (modelSlug.startsWith('kling-motion-3.0') || modelSlug.startsWith('kling-3')) return { slug: 'kling-3.0', title: 'Kling 3.0' };
  if (modelSlug.startsWith('seedance-2')) return { slug: 'seedance-2', title: 'Seedance 2' };
  if (modelSlug.startsWith('hailuo-2.3')) return { slug: 'hailuo-2.3', title: 'Hailuo 2.3' };
  if (modelSlug.startsWith('veo-3.1')) return { slug: 'veo-3.1', title: 'Veo 3.1' };
  if (modelSlug.startsWith('wan-2.6')) return { slug: 'wan-2.6', title: 'Wan 2.6' };
  if (modelSlug.startsWith('sora-2')) return { slug: 'sora-2', title: 'Sora 2' };
  if (blockSlug === 'face-swap-video') return { slug: 'face-swap', title: 'Face Swap' };
  if (blockSlug === 'video-watermark-remove') return { slug: 'watermark-remove', title: 'Удаление watermark' };
  return { slug: modelSlug, title: modelSlug };
}

function functionTitleFor(title: string, blockSlug: string) {
  if (blockSlug === 'motion-transfer') return title.replace('Kling Motion Control ', 'Motion Control ');
  if (blockSlug === 'face-swap-video') return 'Video Face Swap';
  return title
    .replace(/^Kling 2\.6\s*/, '')
    .replace(/^Kling 3\.0\s*/, '')
    .replace(/^Seedance 2\s*/, '')
    .replace(/^Hailuo \/ MiniMax 2\.3\s*/, '')
    .replace(/^Veo 3\.1\s*/, '')
    .replace(/^Wan 2\.6\s*/, '')
    .replace(/^Sora 2\s*/, 'Sora ')
    .trim() || title;
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

export function applyModelPriceOverride(modelSlug: string, costCoins: number, priceOverrides?: ModelPriceOverrides) {
  const override = priceOverrides?.[modelSlug];
  if (typeof override !== 'number' || !Number.isFinite(override)) return costCoins;
  const rounded = Math.ceil(override);
  return rounded >= 1 ? rounded : costCoins;
}

export function estimateChatGenerationPriceCoins(
  modelSlug: string,
  options: { duration?: number; generateAudio?: boolean; params?: Record<string, unknown>; priceOverrides?: ModelPriceOverrides } = {},
) {
  const chatModel = getChatModel(modelSlug);
  const costCoins = estimateChatGenerationCostCoins(modelSlug, options);
  const defaultPriceCoins = chatModel?.category === 'video'
    ? Math.max(1, costCoins * VIDEO_PRICE_MULTIPLIER)
    : costCoins;
  return applyModelPriceOverride(
    modelSlug,
    defaultPriceCoins,
    options.priceOverrides,
  );
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
    blockSlug: 'image-edit',
    modelSlug: 'gpt-image-2',
    category: 'image',
    description: 'GPT Image 2 от OpenAI — сильная модель для лиц и групповых фото, держит идентичность и композицию лучше Nano Banana. Принимает несколько референс-фото. Размер: 1:1, 9:16 или 16:9.',
    acceptsImageInput: true,
    acceptsTextOnly: true,
    supportedAspectRatios: ['1:1', '9:16', '16:9'],
  }),
  fromCatalog({
    blockSlug: 'image-edit',
    modelSlug: 'flux-schnell',
    category: 'image',
    description: 'Flux Schnell — самая быстрая и дешёвая модель Flux. Подходит для быстрых черновиков, превью и эскизов идей. Только text-to-image.',
    acceptsImageInput: false,
    acceptsTextOnly: true,
    supportedAspectRatios: ['1:1', '9:16', '16:9', '4:3', '3:4'],
  }),
  fromCatalog({
    blockSlug: 'image-edit',
    modelSlug: 'flux-dev',
    category: 'image',
    description: 'Flux Dev — сбалансированная text-to-image модель Flux. Хорошо детализирует лица, ткань, освещение. Подходит для аватаров и обложек.',
    acceptsImageInput: false,
    acceptsTextOnly: true,
    supportedAspectRatios: ['1:1', '9:16', '16:9', '4:3', '3:4'],
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
    blockSlug: 'motion-transfer',
    modelSlug: 'kling-motion-2.6-std',
    category: 'video',
    description: 'Kling Motion Control 2.6 Standard: переносит движение из driving video или preset motion на загруженное фото.',
    functionTitle: 'Motion Control Standard',
    acceptsImageInput: true,
    acceptsVideoInput: true,
    acceptsTextOnly: false,
  }),
  fromCatalog({
    blockSlug: 'motion-transfer',
    modelSlug: 'kling-motion-2.6-pro',
    category: 'video',
    description: 'Kling Motion Control 2.6 Pro для более стабильного переноса движения и мимики на исходное фото.',
    functionTitle: 'Motion Control Pro',
    acceptsImageInput: true,
    acceptsVideoInput: true,
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
    blockSlug: 'motion-transfer',
    modelSlug: 'kling-motion-3.0-std',
    category: 'video',
    description: 'Kling Motion Control 3.0 Standard: более современный перенос движения с выбором 720p/1080p.',
    functionTitle: 'Motion Control Standard',
    acceptsImageInput: true,
    acceptsVideoInput: true,
    acceptsTextOnly: false,
  }),
  fromCatalog({
    blockSlug: 'motion-transfer',
    modelSlug: 'kling-motion-3.0-pro',
    category: 'video',
    description: 'Kling Motion Control 3.0 Pro для премиального переноса сложной динамики, танца и мимики.',
    functionTitle: 'Motion Control Pro',
    acceptsImageInput: true,
    acceptsVideoInput: true,
    acceptsTextOnly: false,
  }),
  fromCatalog({
    blockSlug: 'text-to-video',
    modelSlug: 'kling-3-omni',
    category: 'video',
    description: 'Kling 3.0 Omni: text-to-video с image/video references, @image/@video anchors, audio и multi_shots JSON.',
    functionTitle: 'Omni Reference',
    acceptsImageInput: true,
    acceptsVideoInput: true,
    acceptsTextOnly: true,
    supportedAspectRatios: ['auto', '16:9', '9:16', '1:1'],
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
    blockSlug: 'face-swap-video',
    modelSlug: 'qubico-video-toolkit',
    category: 'video',
    description: 'Qubico Video Toolkit face swap: вставляет лицо из загруженного фото в выбранное target video.',
    familySlug: 'face-swap',
    familyTitle: 'Face Swap',
    functionTitle: 'Video Face Swap',
    acceptsImageInput: true,
    acceptsVideoInput: true,
    acceptsTextOnly: false,
    supportedAspectRatios: ['auto', '16:9', '9:16', '1:1'],
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
    blockSlug: 'talking-avatar',
    modelSlug: 'omnihuman-1.5',
    category: 'video',
    familySlug: 'talking-avatar',
    familyTitle: 'Говорящий персонаж',
    functionTitle: 'OmniHuman 1.5 (lip-sync)',
    description: 'Фото персонажа + аудио-озвучка → видео, где он говорит этим голосом (синхрон губ, жесты). Сценарий-промпт опционален.',
    acceptsImageInput: true,
    acceptsAudioInput: true,
    acceptsTextOnly: false,
    requiresPrompt: false,
    supportedAspectRatios: ['auto', '16:9', '9:16', '1:1'],
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
  fromCatalog({
    blockSlug: 'video-watermark-remove',
    modelSlug: 'remove-watermark',
    category: 'video',
    description: 'Убирает водяной знак из загруженного видео, сохраняя качество и звук. Прикрепите видео — промпт не нужен. Стоимость зависит от длительности (от 5 сек).',
    functionTitle: 'Удаление водяного знака',
    acceptsImageInput: false,
    acceptsVideoInput: true,
    acceptsTextOnly: false,
    supportedAspectRatios: ['auto'],
    requiresPrompt: false,
    tool: true,
  }),
];

export function getChatModel(slug: string): ChatModelOption | undefined {
  return CHAT_MODELS.find((model) => model.slug === slug);
}

export function listChatModels(category?: ChatCategory): ChatModelOption[] {
  return category ? CHAT_MODELS.filter((model) => model.category === category) : CHAT_MODELS;
}
