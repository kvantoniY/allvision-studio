import { z } from 'zod';
import { getBlockCatalogItem } from '@allvision/shared';
import type { BlockDefinition } from './types';
import {
  anyInputSchema,
  asObject,
  blockOutputSchema,
  estimateFromSupportedModel,
  providerResultToOutput,
  readInputUrl,
  tierModelParamsSchema,
} from './utils';

const catalog = getBlockCatalogItem('text-to-video');
if (!catalog) throw new Error('Block catalog metadata missing: text-to-video');

const paramsSchema = z.object({
  model: z.union([z.string(), tierModelParamsSchema]).optional(),
  prompt: z.string().min(1),
  // Число секунд ИЛИ 'auto' (Seedance 2.0 сама выбирает длительность по промпту).
  duration: z.union([z.number().min(1).max(30), z.literal('auto')]).optional(),
  aspect_ratio: z.enum(['auto', '9:16', '16:9', '1:1', '4:3', '3:4', '21:9', '9:21']).default('auto').optional(),
  mode: z.enum(['text_to_video', 'omni_reference']).optional(),
  resolution: z.string().optional(),
  generate_audio: z.boolean().optional(),
  negative_prompt: z.string().optional(),
  images: z.union([z.string(), z.array(z.string())]).optional(),
  video: z.string().optional(),
  image_urls: z.union([z.string(), z.array(z.string())]).optional(),
  video_urls: z.union([z.string(), z.array(z.string())]).optional(),
  audio_urls: z.union([z.string(), z.array(z.string())]).optional(),
  audio_url: z.string().optional(),
  enable_audio: z.boolean().optional(),
  keep_original_audio: z.boolean().optional(),
  prefer_multi_shots: z.boolean().optional(),
  multi_shots: z.string().optional(),
  seed: z.union([z.string(), z.number()]).optional(),
  expand_prompt: z.boolean().optional(),
  shot_type: z.string().optional(),
  watermark: z.boolean().optional(),
});

function mergeReference(inputUrl: string, existing: string | string[] | undefined): string[] {
  const rest = (Array.isArray(existing) ? existing : existing ? [existing] : [])
    .map((value) => value.trim())
    .filter((value) => value.length > 0 && value !== inputUrl);
  return [inputUrl, ...rest];
}

function refCount(value: unknown): number {
  if (Array.isArray(value)) return value.filter((v) => typeof v === 'string' && v.trim()).length;
  return typeof value === 'string' && value.trim() ? 1 : 0;
}

/**
 * Omni-модели (Kling 3.0 Omni, Seedance 2.0 Omni на fal) используют прикреплённые фото ТОЛЬКО
 * если они адресованы в промпте якорями @Image1, @Image2… Юзер в чате часто пишет «первое фото…»
 * человеческим языком без якорей — тогда модель игнорирует референсы и рисует случайных людей.
 * Если якорей в промпте нет — дописываем инструкцию с @Image1..@ImageN, чтобы идентичность
 * с фото реально применялась. Если якоря уже есть (юзер вставил вручную) — не трогаем.
 */
function ensureImageAnchors(prompt: string, count: number): string {
  if (count <= 0 || /@image/i.test(prompt)) return prompt;
  const anchors = Array.from({ length: count }, (_, i) => `@Image${i + 1}`);
  const binding = count === 1
    ? `Use ${anchors[0]} as the exact identity reference: the main subject must keep the face, appearance and outfit from ${anchors[0]}.`
    : `Use ${anchors.join(', ')} as exact identity references (in this order): preserve each subject's real face, appearance and outfit from the corresponding reference image, do not blend or invent faces.`;
  return `${prompt.trim()}\n\n${binding}`;
}

export const textToVideoBlock: BlockDefinition = {
  ...catalog,
  inputSchema: anyInputSchema,
  outputSchema: blockOutputSchema,
  paramsSchema,
  estimatedCostCoins: (params) =>
    estimateFromSupportedModel(params, 45, catalog.supportedModels),
  async executor(params, input, ctx) {
    const parsed = paramsSchema.parse(params);
    await ctx.reportProgress(5);
    const model = typeof parsed.model === 'string' ? parsed.model : 'seedance-2-fast';
    const providerParams = asObject(parsed);
    // "Вход" шага (например, результат image-edit) для omni-моделей автоматически
    // становится ПЕРВЫМ референсом. Иначе админ, выбравший вход в конструкторе, получал
    // omni_reference без image_urls вообще — PiAPI отвечает на такой запрос HTTP 500.
    const inputUrl = input === undefined || input === null ? '' : readInputUrl(input, '');
    if (inputUrl) {
      const isSeedanceOmni = model.startsWith('seedance')
        && (model.endsWith('-omni') || parsed.mode === 'omni_reference');
      if (isSeedanceOmni) {
        providerParams.image_urls = mergeReference(inputUrl, parsed.image_urls);
      } else if (model === 'kling-3-omni') {
        providerParams.images = mergeReference(inputUrl, parsed.images);
      } else {
        console.warn(`[text-to-video] model ${model} is text-only; step input is ignored`);
      }
    }
    // Для omni-моделей гарантируем @Image-якоря в промпте, иначе фото-референсы игнорируются.
    const isOmni = model === 'kling-3-omni'
      || (model.startsWith('seedance') && (model.endsWith('-omni') || parsed.mode === 'omni_reference'));
    const imageRefCount = Math.max(refCount(providerParams.images), refCount(providerParams.image_urls));
    const finalPrompt = isOmni ? ensureImageAnchors(parsed.prompt, imageRefCount) : parsed.prompt;

    const result = await ctx.getAIProvider().textToVideo({
      // durationSec остаётся числовым (fallback 5); 'auto' передаётся через providerParams.duration
      // и распознаётся в fal-provider для Seedance 2.0.
      durationSec: typeof parsed.duration === 'number' ? parsed.duration : 5,
      prompt: finalPrompt,
      model,
      params: providerParams,
      context: ctx.providerContext,
    });
    const output = providerResultToOutput(result, 'video');
    await ctx.reportProgress(100);
    return output;
  },
};
