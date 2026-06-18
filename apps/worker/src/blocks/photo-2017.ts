import { z } from 'zod';
import { getBlockCatalogItem } from '@allvision/shared';
import type { ProviderRunContext } from '../providers/ai-provider';
import type { BlockDefinition, BlockOutput } from './types';
import {
  anyInputSchema,
  blockOutputSchema,
  estimateFromSupportedModel,
  providerResultToOutput,
  readInputUrl,
  tierModelParamsSchema,
} from './utils';

const catalog = getBlockCatalogItem('photo-2017');
if (!catalog) throw new Error('Block catalog metadata missing: photo-2017');

const paramsSchema = z.object({
  model: z.union([z.string(), tierModelParamsSchema]).optional(),
  image_urls: z.union([z.array(z.string()), z.string()]).optional(),
  prompt_one: z.string().optional(),
  prompt_two: z.string().optional(),
  output_format: z.string().optional(),
  aspect_ratio: z.string().optional(),
  resolution: z.string().optional(),
  quality: z.string().optional(),
  animate: z.union([z.boolean(), z.string()]).optional(),
  animation_prompt: z.string().optional(),
  video_model: z.union([z.string(), tierModelParamsSchema]).optional(),
  duration: z.union([z.number(), z.string()]).optional(),
});

export const photo2017Block: BlockDefinition = {
  ...catalog,
  inputSchema: anyInputSchema,
  outputSchema: blockOutputSchema,
  paramsSchema,
  estimatedCostCoins: (params) => estimateFromSupportedModel(params, 40, catalog.supportedModels),
  async executor(params, input, ctx) {
    const parsed = paramsSchema.parse(params);
    const primary = readInputUrl(input, '') || undefined;
    if (!primary) throw new Error('photo-2017 requires the primary person photo');

    // Дополнительные референсы (второй человек). Пустые/неразрешённые отсекаются runner'ом,
    // но на всякий случай фильтруем ещё раз.
    const extras = normaliseRefs(parsed.image_urls);
    const peopleCount = 1 + extras.length; // 1 или 2

    // По числу референсов выбираем отдельный промпт (для 1 или для 2 человек).
    const prompt = (peopleCount >= 2 ? parsed.prompt_two : parsed.prompt_one) ?? parsed.prompt_one ?? '';
    if (!prompt) throw new Error('photo-2017 requires prompt_one (and prompt_two for 2 people)');

    const imageModel = stringModel(parsed.model, 'gpt-image-2');
    const animate = parsed.animate === true || parsed.animate === 'true';
    const provider = ctx.getAIProvider();

    // Шаг 1: фото в стиле 2к17. Если без анимации — это весь прогресс (2..100), иначе 2..55.
    const imageTo = animate ? 55 : 100;
    const imageResult = await provider.imageEdit({
      imageUrl: primary,
      prompt,
      model: imageModel,
      params: {
        image_urls: extras,
        output_format: parsed.output_format ?? 'jpg',
        aspect_ratio: parsed.aspect_ratio,
        resolution: parsed.resolution,
        quality: parsed.quality,
      },
      context: scaledContext(ctx.providerContext, ctx.reportProgress, 2, imageTo, `${ctx.providerContext.stepId}-photo`),
    });

    if (!animate) {
      await ctx.reportProgress(100);
      const output: BlockOutput = {
        type: 'image',
        url: imageResult.outputUrl,
        metadata: { provider: 'piapi', model: imageModel, peopleCount },
      };
      return output;
    }

    // Шаг 2 (опционально): оживляем готовое фото через image-to-video (Kling 3.0).
    const videoModel = stringModel(parsed.video_model, 'kling-3-pro');
    const duration = Number(parsed.duration) > 0 ? Number(parsed.duration) : 5;
    const videoResult = await provider.imageToVideo({
      imageUrl: imageResult.outputUrl,
      prompt: parsed.animation_prompt,
      durationSec: duration,
      model: videoModel,
      params: { aspect_ratio: parsed.aspect_ratio },
      context: scaledContext(ctx.providerContext, ctx.reportProgress, 55, 100, `${ctx.providerContext.stepId}-animate`),
    });

    await ctx.reportProgress(100);
    return providerResultToOutput(videoResult, 'video');
  },
};

function normaliseRefs(value: unknown): string[] {
  const list = Array.isArray(value)
    ? value
    : typeof value === 'string' && value.trim()
      ? safeParseArray(value.trim())
      : [];
  return list
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > 0);
}

function safeParseArray(value: string): unknown[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [value];
  } catch {
    return [value];
  }
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
