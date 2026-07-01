import { z } from 'zod';
import { getBlockCatalogItem } from '@allvision/shared';
import type { BlockDefinition } from './types';
import {
  anyInputSchema,
  blockOutputSchema,
  providerResultToOutput,
  readInputUrl,
} from './utils';

const catalog = getBlockCatalogItem('fal-generic');
if (!catalog) throw new Error('Block catalog metadata missing: fal-generic');

const paramsSchema = z.object({
  endpoint: z.string().min(1),
  kind: z.enum(['image', 'video']).default('video'),
  prompt: z.string().optional(),
  image_url: z.string().optional(),
  image_url_2: z.string().optional(),
  image_url_3: z.string().optional(),
  video_url: z.string().optional(),
  duration: z.union([z.string(), z.number()]).optional(),
  aspect_ratio: z.string().optional(),
  resolution: z.string().optional(),
  // JSON-объект с любыми доп. полями конкретной модели fal (напр. {"num_images":2,"guidance_scale":5}).
  extra_params: z.string().optional(),
});

export const falGenericBlock: BlockDefinition = {
  ...catalog,
  inputSchema: anyInputSchema,
  outputSchema: blockOutputSchema,
  paramsSchema,
  estimatedCostCoins: () => catalog.supportedModels[0]?.estimatedCostCoins ?? 40,
  async executor(params, input, ctx) {
    const parsed = paramsSchema.parse(params);
    await ctx.reportProgress(5);

    const inputUrl = input === undefined || input === null ? '' : readInputUrl(input, '');
    const images = [inputUrl, parsed.image_url, parsed.image_url_2, parsed.image_url_3]
      .map((value) => (value ?? '').trim())
      .filter((value) => value.length > 0);
    const uniqueImages = [...new Set(images)];

    const falInput: Record<string, unknown> = {};
    if (parsed.prompt) falInput.prompt = parsed.prompt;
    if (uniqueImages.length > 0) {
      // fal игнорирует незнакомые поля -> шлём и image_url (одиночное), и image_urls (массив);
      // модель возьмёт то поле, которое есть в её схеме. extra_params может переопределить.
      falInput.image_url = uniqueImages[0];
      falInput.image_urls = uniqueImages;
    }
    if (parsed.video_url && parsed.video_url.trim()) {
      falInput.video_url = parsed.video_url.trim();
      falInput.video_urls = [parsed.video_url.trim()];
    }
    if (parsed.duration !== undefined && `${parsed.duration}`.trim().length > 0) {
      const d = Number(parsed.duration);
      if (Number.isFinite(d)) falInput.duration = d;
    }
    if (parsed.aspect_ratio && parsed.aspect_ratio !== 'auto') falInput.aspect_ratio = parsed.aspect_ratio;
    if (parsed.resolution && parsed.resolution.trim()) falInput.resolution = parsed.resolution.trim();

    if (parsed.extra_params && parsed.extra_params.trim().length > 0) {
      let extra: unknown;
      try {
        extra = JSON.parse(parsed.extra_params);
      } catch {
        throw new Error('fal-generic: «Доп. параметры (JSON)» должны быть валидным JSON-объектом');
      }
      if (!extra || typeof extra !== 'object' || Array.isArray(extra)) {
        throw new Error('fal-generic: «Доп. параметры (JSON)» должны быть JSON-объектом вида {"поле":значение}');
      }
      Object.assign(falInput, extra as Record<string, unknown>);
    }

    const result = await ctx.getAIProvider().falRaw({
      endpoint: parsed.endpoint,
      kind: parsed.kind,
      falInput,
      context: ctx.providerContext,
    });

    const output = providerResultToOutput(result, parsed.kind === 'image' ? 'image' : 'video');
    await ctx.reportProgress(100);
    return output;
  },
};
