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
  slides: z.union([z.array(z.unknown()), z.string()]).optional(),
  style_prompt: z.string().optional(),
  aspect_ratio: z.enum(['1:1', '3:4', '9:16']).default('3:4').optional(),
  resolution: z.enum(['1K', '2K', '4K']).optional(),
});

type ParsedParams = z.infer<typeof paramsSchema>;

// A slide is its text plus whether the user's photo should appear on it.
interface SlideSpec {
  text: string;
  withPhoto: boolean;
}

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
    // Photo is optional: when the user did not upload one, every slide is text-only.
    const personPhoto = parsed.person_photo || readInputUrl(input, '') || undefined;

    const slides = normaliseSlides(parsed.slides);
    if (slides.length === 0) throw new Error('carousel-slides requires at least one slide');

    const model = stringModel(parsed.model, 'nano-banana');
    const aspect = parsed.aspect_ratio ?? '3:4';
    const resolution = parsed.resolution ?? '2K';
    const provider = ctx.getAIProvider();
    const total = slides.length;

    const urls: string[] = [];
    let styleRef: string | undefined;
    for (let index = 0; index < total; index += 1) {
      const from = Math.round((index / total) * 95) + 2;
      const to = Math.round(((index + 1) / total) * 95) + 2;
      // The person appears on a slide only if the user opted in AND actually uploaded a photo.
      const withPerson = slides[index].withPhoto && Boolean(personPhoto);
      const prompt = buildSlidePrompt(parsed.style_prompt, index, total, slides[index].text, styleRef !== undefined, withPerson);
      const result = await provider.imageEdit({
        // Person photo is the primary reference only when this slide includes the person;
        // otherwise the slide is built from text (+ style template) with no person.
        imageUrl: withPerson ? personPhoto : undefined,
        prompt,
        model,
        params: {
          // Slide 1 establishes the template; later slides also get it as a style reference.
          image_urls: styleRef ? [styleRef] : [],
          output_format: 'jpg',
          aspect_ratio: aspect,
          resolution,
          quality: 'high',
        },
        // Уникальный stepId на каждый слайд: иначе все слайды пишутся в один и тот же
        // путь outputs/.../{stepId}/result.jpg и перезаписывают друг друга — юзер получал
        // 5 одинаковых картинок вместо 5 разных слайдов.
        context: scaledContext(ctx.providerContext, ctx.reportProgress, from, to, `${ctx.providerContext.stepId}-slide-${index + 1}`),
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

function normaliseSlides(value: unknown): SlideSpec[] {
  const fromItem = (item: unknown): SlideSpec => {
    if (typeof item === 'string') return { text: item.trim(), withPhoto: true };
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      const record = item as Record<string, unknown>;
      const text = typeof record.text === 'string' ? record.text.trim() : '';
      // Default to including the photo for backward compatibility (legacy slides were string-only).
      const withPhoto = record.withPhoto === undefined ? true : record.withPhoto === true;
      return { text, withPhoto };
    }
    return { text: '', withPhoto: true };
  };
  if (Array.isArray(value)) return value.map(fromItem);
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed.map(fromItem);
    } catch {
      return [{ text: trimmed, withPhoto: true }];
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
  withPerson: boolean,
): string {
  const slideNo = index + 1;
  const trimmed = text.trim();
  const parts = [
    stylePrompt?.trim(),
    `Design slide ${slideNo} of ${total} of ONE cohesive, premium social-media carousel (Instagram / VK style). All slides share an identical design system: same background style, color palette, typography, layout grid, margins${withPerson ? ' and person placement' : ''}, so the whole set looks professionally art-directed as a single brand.`,
    // Layout & background — NOT a framed photo next to text.
    withPerson
      ? 'Layout: a modern editorial / marketing slide. Do NOT make a plain photo with a caption beside it, and do NOT put the person inside a rectangular photo frame, card or border. Build a fully designed background that fills the canvas edge to edge: a tasteful solid brand color or soft gradient with subtle geometric shapes and accent elements behind the content.'
      : 'Layout: a modern editorial / marketing slide with NO people on it. Build a fully designed background that fills the canvas edge to edge: a tasteful solid brand color or soft gradient with subtle geometric shapes and accent elements, with the text as the hero of the slide.',
    // Person as a clean PNG-style cutout on one side (only when this slide includes the person).
    withPerson
      ? 'Person: use the SAME real person from the first reference image and composite them as a clean cut-out, like a transparent-background PNG, placed to one side of the slide (consistent side across all slides). Soft natural cut-out edges — no hard rectangle, no photo frame, no border, no boxed drop shadow. Keep them fully photorealistic, sharp and high resolution, half or full body, with their exact face, hairstyle and clothing preserved and consistent across every slide. They should sit naturally within the design, lightly overlapping the graphic elements, never pasted inside a box.'
      : 'Do NOT add any person, face, portrait or silhouette to this slide — it is a text-only design slide.',
    // Typography.
    trimmed
      ? `Typography: render this exact text as the slide copy with strong modern editorial type — a bold clean sans-serif headline plus lighter readable body text, clear visual hierarchy, generous spacing, accurate kerning, crisp and 100% legible. Keep the original language, do not translate, do not add or invent any words, render only this text verbatim: "${trimmed}".`
      : (withPerson
        ? 'This slide has no caption text; keep it a clean visual slide with only the person and the designed background, no invented text.'
        : 'This slide has no caption text; keep it a clean minimal design slide with only the designed background, no people and no invented text.'),
    hasStyleRef
      ? 'Use the latest reference image ONLY as the style/layout template (palette, fonts, composition, person side and placement). Match it closely, but render this slide\'s own new text and content; never copy its text.'
      : 'This is the first slide: establish the reusable template (background style, palette, fonts, person side, type layout) that every following slide must match exactly.',
    'Ultra high quality, crisp focus, realistic skin and fabric texture, clean professional graphic-design finish, balanced composition, no gibberish text, no extra captions beyond the specified text, no logos, no watermark.',
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
  stepId?: string,
): ProviderRunContext {
  return {
    ...context,
    ...(stepId ? { stepId } : {}),
    reportProgress: async (percent: number) => {
      const safe = Math.max(0, Math.min(100, percent));
      await reportProgress(from + ((to - from) * safe) / 100);
    },
  };
}
