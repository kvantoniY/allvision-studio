import { z } from 'zod';
import { getBlockCatalogItem, usdToTokens } from '@allvision/shared';
import type { ProviderRunContext } from '../providers/ai-provider';
import type { BlockContext, BlockDefinition, BlockOutput } from './types';
import {
  anyInputSchema,
  blockOutputSchema,
  readInputUrl,
  tierModelParamsSchema,
} from './utils';

const catalog = getBlockCatalogItem('carousel-slides');
if (!catalog) throw new Error('Block catalog metadata missing: carousel-slides');

const paramsSchema = z.object({
  model: z.union([z.string(), tierModelParamsSchema]).optional(),
  person_photo: z.string().optional(),
  slides: z.union([z.array(z.string()), z.string()]).optional(),
  style_prompt: z.string().optional(),
  aspect_ratio: z.enum(['1:1', '3:4', '9:16']).default('3:4').optional(),
});

type ParsedParams = z.infer<typeof paramsSchema>;

export const carouselSlidesBlock: BlockDefinition = {
  ...catalog,
  inputSchema: anyInputSchema,
  outputSchema: blockOutputSchema,
  paramsSchema,
  estimatedCostCoins: (params) => {
    const parsed = paramsSchema.partial().safeParse(params);
    const slides = parsed.success ? normaliseSlides(parsed.data.slides) : [];
    const count = Math.max(1, slides.length || 1);
    return count * usdToTokens(0.1); // ~gpt-image-2 per slide
  },
  async executor(params, input, ctx) {
    const parsed = paramsSchema.parse(params);
    const personPhoto = parsed.person_photo ?? readInputUrl(input, '');
    if (!personPhoto) throw new Error('carousel-slides requires person_photo');

    const slides = normaliseSlides(parsed.slides);
    if (slides.length === 0) throw new Error('carousel-slides requires at least one slide');

    const model = stringModel(parsed.model, 'gpt-image-2');
    const aspect = parsed.aspect_ratio ?? '3:4';
    const provider = ctx.getAIProvider();
    const total = slides.length;

    const urls: string[] = [];
    let styleRef: string | undefined;
    for (let index = 0; index < total; index += 1) {
      const from = Math.round((index / total) * 95) + 2;
      const to = Math.round(((index + 1) / total) * 95) + 2;
      const prompt = buildSlidePrompt(parsed.style_prompt, index, total, slides[index], styleRef !== undefined);
      const result = await provider.imageEdit({
        imageUrl: personPhoto,
        prompt,
        model,
        params: {
          // Slide 1 establishes the template; later slides also get it as a style reference.
          image_urls: styleRef ? [styleRef] : [],
          output_format: 'jpg',
          aspect_ratio: aspect,
          quality: 'high',
        },
        context: scaledContext(ctx.providerContext, ctx.reportProgress, from, to),
      });
      urls.push(result.outputUrl);
      if (index === 0) styleRef = result.outputUrl;
    }

    await ctx.reportProgress(100);
    const output: BlockOutput = {
      type: 'image',
      url: urls[0],
      metadata: {
        slides: urls,
        slideCount: urls.length,
        provider: 'piapi',
        model,
      },
    };
    return output;
  },
};

function normaliseSlides(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => (typeof item === 'string' ? item : '')).map((item) => item.trim());
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed.map((item) => (typeof item === 'string' ? item.trim() : ''));
    } catch {
      return [trimmed];
    }
  }
  return [];
}

function buildSlidePrompt(
  stylePrompt: string | undefined,
  index: number,
  total: number,
  text: string,
  hasStyleRef: boolean,
): string {
  const slideNo = index + 1;
  const trimmed = text.trim();
  const parts = [
    stylePrompt?.trim(),
    `This is slide ${slideNo} of ${total} in ONE cohesive social-media carousel. Every slide must share the exact same visual style, layout grid, color palette, fonts, margins and overall template, so all slides look like one matching set.`,
    trimmed
      ? `Render this exact text on the slide, clearly legible, correctly spelled and well typeset, as the slide heading/body. Do not translate it, do not invent extra words, render only this text: "${trimmed}".`
      : 'This slide has no caption text; keep it as a clean visual slide without invented text.',
    'Feature the SAME real person from the first reference image naturally in the photo area of the slide; keep their face consistent, recognizable and undistorted across all slides.',
    hasStyleRef
      ? 'Use the second reference image ONLY as the visual style and layout template (palette, fonts, composition, framing). Do not copy its text and do not duplicate its exact content.'
      : 'Establish a clean, premium, reusable template that the other slides will follow.',
    'Professional graphic design, balanced composition, high quality, sharp readable typography, no gibberish text, no extra captions beyond the specified text, no watermark.',
  ];
  return parts.filter((part): part is string => Boolean(part && part.length > 0)).join(' ');
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
