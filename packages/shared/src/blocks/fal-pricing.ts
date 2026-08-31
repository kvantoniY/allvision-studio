/**
 * slug модели -> fal endpoint для получения РЕАЛЬНОЙ цены через api.fal.ai/v1/models/pricing.
 * Держим в shared, чтобы админка (api/web) показывала живую себестоимость fal.
 * Источник значений — apps/worker/src/providers/fal-provider.ts (FAL_MODELS). При изменении там —
 * синхронизировать здесь (это display-only для цены; на исполнение не влияет).
 */
export const FAL_PRICING_ENDPOINTS: Record<string, string> = {
  // speech
  'minimax-speech': 'fal-ai/minimax/speech-02-hd',
  'elevenlabs-tts': 'fal-ai/elevenlabs/tts/multilingual-v2',
  // image
  'nano-banana': 'fal-ai/nano-banana-pro',
  'gpt-image-2': 'openai/gpt-image-2',
  'flux-schnell': 'fal-ai/flux/schnell',
  'flux-dev': 'fal-ai/flux/dev',
  'flux-pro-ultra': 'fal-ai/flux-pro/v1.1-ultra',
  'recraft-v3': 'fal-ai/recraft/v3/text-to-image',
  'ideogram-v3': 'fal-ai/ideogram/v3',
  'seedream-5-lite': 'fal-ai/bytedance/seedream/v5/lite/text-to-image',
  'seedream-4': 'fal-ai/bytedance/seedream/v4/text-to-image',
  'seedream-4.5': 'fal-ai/bytedance/seedream/v4.5/text-to-image',
  'grok-image': 'xai/grok-imagine-image',
  // text-to-video
  'veo-3.1': 'fal-ai/veo3.1',
  'veo-3.1-fast': 'fal-ai/veo3.1/fast',
  'sora-2': 'fal-ai/sora-2/text-to-video',
  'sora-2-pro': 'fal-ai/sora-2/text-to-video',
  'seedance-2': 'bytedance/seedance-2.0/text-to-video',
  'seedance-2-fast': 'bytedance/seedance-2.0/fast/text-to-video',
  'seedance-2-omni': 'bytedance/seedance-2.0/reference-to-video',
  'seedance-2-fast-omni': 'bytedance/seedance-2.0/fast/reference-to-video',
  'kling-3-omni': 'fal-ai/kling-video/v3/pro/text-to-video',
  'hailuo-2.3-text': 'fal-ai/minimax/hailuo-02/standard/text-to-video',
  'hailuo-2.3-fast-text': 'fal-ai/minimax/hailuo-02/standard/text-to-video',
  'wan-2.6': 'fal-ai/wan-25-preview/text-to-video',
  'seedance-2.5': 'bytedance/seedance-2.5/text-to-video',
  'seedance-2.5-omni': 'bytedance/seedance-2.5/reference-to-video',
  'seedance-2.5-i2v': 'bytedance/seedance-2.5/image-to-video',
  'seedream-5-pro': 'bytedance/seedream/v5/pro/text-to-image',
  'luma-ray2': 'fal-ai/luma-dream-machine/ray-2',
  // image-to-video
  'kling-std': 'fal-ai/kling-video/v2.5-turbo/standard/image-to-video',
  'kling-pro': 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video',
  'kling-3-std': 'fal-ai/kling-video/v3/standard/image-to-video',
  'kling-3-pro': 'fal-ai/kling-video/v3/pro/image-to-video',
  'hailuo-2.3': 'fal-ai/minimax/hailuo-02/standard/image-to-video',
  'hailuo-2.3-fast': 'fal-ai/minimax/hailuo-02-fast/image-to-video',
  'veo-3.1-i2v': 'fal-ai/veo3.1/image-to-video',
  'veo-3.1-fast-i2v': 'fal-ai/veo3.1/fast/image-to-video',
  'seedance-2-first-last': 'bytedance/seedance-2.0/image-to-video',
  'seedance-2-fast-first-last': 'bytedance/seedance-2.0/fast/image-to-video',
  'wan-2.6-i2v': 'fal-ai/wan-25-preview/image-to-video',
  'grok-video': 'xai/grok-imagine-video/image-to-video',
  'luma-ray2-i2v': 'fal-ai/luma-dream-machine/ray-2/image-to-video',
  // motion-control (video-to-video)
  'kling-motion-3.0-pro': 'fal-ai/kling-video/v3/pro/motion-control',
  'kling-motion-3.0-std': 'fal-ai/kling-video/v3/standard/motion-control',
  'kling-motion-2.6-pro': 'fal-ai/kling-video/v2.6/pro/motion-control',
  'kling-motion-2.6-std': 'fal-ai/kling-video/v2.6/standard/motion-control',
  'wan-motion': 'fal-ai/wan-motion',
  'wan-animate-move': 'fal-ai/wan/v2.2-14b/animate/move',
  'wan-animate-replace': 'fal-ai/wan/v2.2-14b/animate/replace',
};

export function falEndpointForModel(slug: string): string | undefined {
  return FAL_PRICING_ENDPOINTS[slug];
}

export type FalDocPricingParams = {
  quality?: string;
  resolution?: string;
  aspectRatio?: string;
};

/**
 * Цена gpt-image-2 на fal зависит от качества и размера кадра; /v1/models/pricing
 * такие тарифы не отражает (отдаёт одну unit_price), поэтому источник истины —
 * таблица со страницы модели fal (fal.ai/models/openai/gpt-image-2).
 * square = 1024x1024 (1:1/auto), rect = 1024x1536 / 1536x1024 (9:16, 16:9, 3:4...).
 */
const GPT_IMAGE_2_DOC_PRICES: Record<'square' | 'rect', Record<'low' | 'medium' | 'high', number>> = {
  square: { low: 0.006, medium: 0.053, high: 0.211 },
  rect: { low: 0.005, medium: 0.042, high: 0.165 },
};

/** Nano Banana Pro (slug nano-banana): цена по разрешению со страницы модели fal. */
const NANO_BANANA_DOC_PRICES: Record<string, number> = { '1K': 0.12, '2K': 0.14, '4K': 0.18 };

/**
 * Себестоимость по ДОКУМЕНТАЦИИ fal для моделей с тарифом по качеству/разрешению.
 * Возвращает undefined для моделей без такого тарифа — тогда цена берётся из
 * живого pricing API (unit_price × units) или из estimatedCostUsd каталога.
 */
export function falDocumentedCostUsd(slug: string, params: FalDocPricingParams = {}): number | undefined {
  if (slug === 'gpt-image-2') {
    const q = (params.quality ?? '').toLowerCase();
    const quality = q === 'low' || q === 'high' ? q : 'medium'; // auto/standard/пусто -> medium
    const aspect = (params.aspectRatio ?? '').toLowerCase();
    const size = !aspect || aspect === '1:1' || aspect === 'auto' ? 'square' : 'rect';
    return GPT_IMAGE_2_DOC_PRICES[size][quality];
  }
  if (slug === 'nano-banana') {
    const r = (params.resolution ?? '1K').toUpperCase();
    return NANO_BANANA_DOC_PRICES[r] ?? NANO_BANANA_DOC_PRICES['1K'];
  }
  return undefined;
}

/** Сколько единиц биллинга у fal по unit'у и настройкам (для unit_price × units). */
export function falBillingUnits(unit: string, params: { duration?: number; numImages?: number } = {}): number {
  const u = (unit ?? '').toLowerCase();
  if (u.includes('second')) return params.duration && params.duration > 0 ? params.duration : 5;
  if (u.includes('image')) return params.numImages && params.numImages > 0 ? params.numImages : 1;
  return 1; // megapixels / compute_seconds / прочее — за 1 единицу (примерно)
}
