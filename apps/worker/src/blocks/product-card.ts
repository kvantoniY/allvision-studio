import { z } from 'zod';
import { getBlockCatalogItem } from '@allvision/shared';
import type { ProviderRunContext } from '../providers/ai-provider';
import type { BlockContext, BlockDefinition, BlockOutput } from './types';
import {
  anyInputSchema,
  blockOutputSchema,
  readInputUrl,
  tierModelParamsSchema,
} from './utils';

const catalog = getBlockCatalogItem('product-card');
if (!catalog) throw new Error('Block catalog metadata missing: product-card');

const modelParam = z.union([z.string(), tierModelParamsSchema]).optional();

const paramsSchema = z.object({
  photo1: z.string().optional(),
  photo2: z.string().optional(),
  photo3: z.string().optional(),
  product_name: z.string().optional(),
  outputs: z.union([z.array(z.string()), z.string()]).optional(),
  cover_model: modelParam,
  cover_prompt: z.string().optional(),
  animation_model: modelParam,
  animation_prompt: z.string().optional(),
  animation_duration: z.number().min(1).max(30).optional(),
  ad_model: modelParam,
  ad_prompt: z.string().optional(),
  ad_duration: z.number().min(1).max(30).optional(),
  aspect_ratio: z.enum(['auto', '9:16', '16:9', '1:1', '4:3', '3:4']).optional(),
});

type ParsedParams = z.infer<typeof paramsSchema>;
type Asset = { type: 'image' | 'video'; url: string; label: string };

const KNOWN_OUTPUTS = ['cover', 'animation', 'ad'] as const;

export const productCardBlock: BlockDefinition = {
  ...catalog,
  inputSchema: anyInputSchema,
  outputSchema: blockOutputSchema,
  paramsSchema,
  estimatedCostCoins: (params) => {
    const parsed = paramsSchema.partial().safeParse(params);
    const outputs = parsed.success ? normaliseOutputs(parsed.data.outputs) : [];
    const perOutput: Record<string, number> = { cover: 15, animation: 60, ad: 120 };
    const total = outputs.reduce((sum, key) => sum + (perOutput[key] ?? 0), 0);
    return total > 0 ? total : 15;
  },
  async executor(params, input, ctx) {
    const parsed = paramsSchema.parse(params);
    const photos = [parsed.photo1, parsed.photo2, parsed.photo3]
      .map((value) => (typeof value === 'string' ? value.trim() : ''))
      .filter((value) => value.length > 0);
    if (photos.length === 0) {
      const fallback = readInputUrl(input, '');
      if (fallback) photos.push(fallback);
    }
    if (photos.length === 0) throw new Error('product-card requires at least one product photo');

    const outputs = normaliseOutputs(parsed.outputs);
    if (outputs.length === 0) throw new Error('product-card requires at least one selected output');

    const provider = ctx.getAIProvider();
    const productName = parsed.product_name?.trim() ?? '';
    const aspect = parsed.aspect_ratio ?? 'auto';
    const assets: Asset[] = [];
    let coverUrl: string | undefined;

    const total = outputs.length;
    let done = 0;
    const segment = () => {
      const from = Math.round((done / total) * 95) + 2;
      const to = Math.round(((done + 1) / total) * 95) + 2;
      done += 1;
      return scaledContext(ctx.providerContext, ctx.reportProgress, from, to);
    };

    if (outputs.includes('cover')) {
      const result = await provider.imageEdit({
        imageUrl: photos[0],
        prompt: composeCoverPrompt(parsed.cover_prompt, productName),
        model: stringModel(parsed.cover_model, 'gpt-image-2'),
        params: {
          image_urls: photos.slice(1),
          output_format: 'jpg',
          aspect_ratio: aspect === 'auto' ? '1:1' : aspect,
          quality: 'high',
        },
        context: segment(),
      });
      coverUrl = result.outputUrl;
      assets.push({ type: 'image', url: result.outputUrl, label: 'Обложка' });
    }

    if (outputs.includes('animation')) {
      const result = await provider.imageToVideo({
        imageUrl: coverUrl ?? photos[0],
        prompt: composeAnimationPrompt(parsed.animation_prompt, productName),
        durationSec: parsed.animation_duration ?? 5,
        model: stringModel(parsed.animation_model, 'kling-3-pro'),
        params: {
          aspect_ratio: aspect,
          resolution: '720p',
        },
        context: segment(),
      });
      assets.push({ type: 'video', url: result.outputUrl, label: 'Анимация' });
    }

    if (outputs.includes('ad')) {
      const result = await provider.textToVideo({
        prompt: composeAdPrompt(parsed.ad_prompt, productName),
        durationSec: parsed.ad_duration ?? 8,
        model: stringModel(parsed.ad_model, 'seedance-2-omni'),
        params: {
          mode: 'omni_reference',
          image_urls: photos,
          aspect_ratio: aspect === 'auto' ? '16:9' : aspect,
          resolution: '720p',
        },
        context: segment(),
      });
      assets.push({ type: 'video', url: result.outputUrl, label: 'Реклама' });
    }

    if (assets.length === 0) throw new Error('product-card produced no assets');

    await ctx.reportProgress(100);
    const output: BlockOutput = {
      type: assets[0].type,
      url: assets[0].url,
      metadata: { assets, provider: 'piapi' },
    };
    return output;
  },
};

function normaliseOutputs(value: unknown): string[] {
  let list: string[] = [];
  if (Array.isArray(value)) list = value.map((item) => (typeof item === 'string' ? item.trim() : ''));
  else if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) list = parsed.map((item) => (typeof item === 'string' ? item.trim() : ''));
        else list = [trimmed];
      } catch {
        list = trimmed.split(',').map((item) => item.trim());
      }
    }
  }
  // Keep only known outputs, preserve order cover -> animation -> ad.
  return KNOWN_OUTPUTS.filter((key) => list.includes(key));
}

function composeCoverPrompt(adminPrompt: string | undefined, name: string): string {
  return [
    adminPrompt?.trim() || 'Clean premium e-commerce product cover. The product is the hero: centered, sharp and well-lit on a tasteful studio background, professional product photography, high detail.',
    name ? `Product: "${name}".` : '',
    'Keep the EXACT product from the reference photos - same shape, color, logo, materials and details. Realistic textures, high quality, no invented text, no watermark.',
  ].filter(Boolean).join(' ');
}

function composeAnimationPrompt(adminPrompt: string | undefined, name: string): string {
  return [
    adminPrompt?.trim() || 'Gentle premium product showcase: slow smooth rotation and a subtle camera move revealing the product from different angles, clean studio lighting.',
    name ? `Product: "${name}".` : '',
    'Keep the product shape, color and details stable and realistic. No morphing, no distortion, no text, no watermark.',
  ].filter(Boolean).join(' ');
}

function composeAdPrompt(adminPrompt: string | undefined, name: string): string {
  return [
    adminPrompt?.trim() || 'Cinematic premium product advertisement: dynamic shots of the product from different angles, beautiful lighting, macro detail of textures and materials, elegant motion and professional commercial editing rhythm.',
    name ? `Product: "${name}".` : '',
    'Feature the EXACT product from the reference images - keep its shape, color, logo and details accurate. Photorealistic premium commercial look, no on-screen text, no watermark.',
  ].filter(Boolean).join(' ');
}

function stringModel(value: string | { standard: string; pro: string } | undefined, fallback: string) {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function scaledContext(
  context: ProviderRunContext,
  reportProgress: (percent: number) => Promise<void>,
  from: number,
  to: number,
): ProviderRunContext {
  return {
    ...context,
    reportProgress: async (percent: number) => {
      const safe = Math.max(0, Math.min(100, percent));
      await reportProgress(from + ((to - from) * safe) / 100);
    },
  };
}
