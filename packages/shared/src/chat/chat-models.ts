import { getBlockCatalogItem } from '../blocks/catalog';
import type { BlockCatalogItem, ModelOption } from '../blocks/types';

export type ChatCategory = 'image' | 'video';
export type ChatAspectRatio = '1:1' | '9:16' | '16:9' | 'auto';

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
  acceptsTextOnly: boolean;
  supportedAspectRatios: ChatAspectRatio[];
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
  acceptsTextOnly: boolean;
  supportedAspectRatios?: ChatAspectRatio[];
  experimental?: boolean;
}): ChatModelOption {
  const model = requireModel(params.blockSlug, params.modelSlug);
  return {
    slug: model.slug,
    blockSlug: params.blockSlug,
    category: params.category,
    title: model.title,
    description: params.description,
    estimatedCostCoins: model.estimatedCostCoins,
    estimatedCostUsd: model.estimatedCostUsd ?? 0,
    acceptsImageInput: params.acceptsImageInput,
    acceptsVideoInput: params.acceptsVideoInput ?? false,
    acceptsTextOnly: params.acceptsTextOnly,
    supportedAspectRatios: params.supportedAspectRatios ?? ['auto', '1:1', '9:16', '16:9'],
    experimental: params.experimental,
  };
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
