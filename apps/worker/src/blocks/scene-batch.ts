import { z } from 'zod';
import { getBlockCatalogItem } from '@allvision/shared';
import type { ProviderRunContext } from '../providers/ai-provider';
import type { BlockContext, BlockDefinition, BlockOutput } from './types';
import { anyInputSchema, blockOutputSchema } from './utils';

const catalog = getBlockCatalogItem('scene-batch');
if (!catalog) throw new Error('Block catalog metadata missing: scene-batch');

/**
 * Пакетная генерация сцен.
 *
 * Шаблон поздравления — это одна и та же операция, повторённая для каждой загруженной
 * фотографии. Класть в пайплайн десять одинаковых шагов нельзя: число снимков выбирает
 * пользователь. Поэтому цикл живёт внутри блока — так же, как в carousel-slides.
 */

const paramsSchema = z.object({
  photos: z.unknown().optional(),
  mode: z.enum(['animate', 'stylize-animate', 'stylize']).optional(),
  model: z.union([z.string(), z.object({ standard: z.string(), pro: z.string() })]).optional(),
  prompt: z.string().optional(),
  stylize_model: z.string().optional(),
  stylize_prompt: z.string().optional(),
  duration: z.coerce.number().min(3).max(15).optional(),
  aspect_ratio: z.string().optional(),
  max_scenes: z.coerce.number().int().min(1).max(30).optional(),
});

type BatchParams = z.infer<typeof paramsSchema>;

const DEFAULT_VIDEO_MODEL = 'kling-3-std';
const DEFAULT_STYLIZE_MODEL = 'gpt-image-2';
const DEFAULT_DURATION = 5;

/** Плейсхолдеры отдают то массив URL, то один URL, то результат шага — приводим к списку. */
function photoUrls(value: unknown): string[] {
  const list = Array.isArray(value) ? value : [value];
  const urls: string[] = [];
  for (const item of list) {
    if (typeof item === 'string' && item.trim().length > 0 && !item.includes('{{')) {
      urls.push(item.trim());
      continue;
    }
    if (item && typeof item === 'object') {
      const record = item as Record<string, unknown>;
      const url = record.url ?? record.publicUrl ?? record.resultImage;
      if (typeof url === 'string' && url.trim().length > 0) urls.push(url.trim());
    }
  }
  return urls;
}

function resolveModel(model: BatchParams['model']): string {
  if (typeof model === 'string' && model.trim().length > 0) return model.trim();
  // Tier-объект сюда доезжает только если runner не смог его развернуть; берём Standard.
  if (model && typeof model === 'object') return model.standard;
  return DEFAULT_VIDEO_MODEL;
}

/**
 * Контекст одной сцены. Уникальный stepId обязателен: без него все клипы пишутся
 * в один путь outputs/.../{stepId}/result.mp4 и перезаписывают друг друга —
 * ровно этот баг был в карусели (P9.8).
 */
function sceneContext(ctx: BlockContext, index: number, from: number, to: number): ProviderRunContext {
  return {
    ...ctx.providerContext,
    stepId: `${ctx.providerContext.stepId}-scene-${index + 1}`,
    reportProgress: async (percent: number) => {
      const safe = Math.max(0, Math.min(100, percent));
      await ctx.reportProgress(Math.round(from + ((to - from) * safe) / 100));
    },
  };
}

async function stylizePhoto(input: {
  photoUrl: string;
  params: BatchParams;
  ctx: BlockContext;
  index: number;
}): Promise<string> {
  const { photoUrl, params, ctx, index } = input;
  const prompt = (params.stylize_prompt ?? '').trim();
  if (!prompt) return photoUrl;
  const result = await ctx.getAIProvider().imageEdit({
    imageUrl: photoUrl,
    prompt,
    model: params.stylize_model ?? DEFAULT_STYLIZE_MODEL,
    context: {
      ...ctx.providerContext,
      stepId: `${ctx.providerContext.stepId}-style-${index + 1}`,
    },
  });
  return result.outputUrl;
}

export const sceneBatchBlock: BlockDefinition = {
  ...catalog,
  inputSchema: anyInputSchema,
  outputSchema: blockOutputSchema,
  paramsSchema,
  estimatedCostCoins: () => catalog.supportedModels[0]?.estimatedCostCoins ?? 0,
  async executor(rawParams, input, ctx) {
    const params = paramsSchema.parse(rawParams ?? {});
    const maxScenes = params.max_scenes ?? 12;
    const photos = photoUrls(params.photos ?? input).slice(0, maxScenes);
    if (photos.length === 0) {
      throw new Error('SCENE_BATCH_NO_PHOTOS: не переданы фотографии для сцен');
    }

    const mode = params.mode ?? 'animate';
    const model = resolveModel(params.model);
    const durationSec = params.duration ?? DEFAULT_DURATION;
    const provider = ctx.getAIProvider();

    const clips: Array<{ url: string; sourceUrl: string; index: number }> = [];
    const failures: Array<{ index: number; message: string }> = [];

    for (const [index, photoUrl] of photos.entries()) {
      // Ролик из десяти сцен собирается минутами, поэтому пользователю важно видеть,
      // что процесс живой и на каком он кадре.
      await ctx.providerContext.reportStage?.(`Сцена ${index + 1} из ${photos.length}`);
      try {
        const base = mode === 'animate' ? photoUrl : await stylizePhoto({ photoUrl, params, ctx, index });

        if (mode === 'stylize') {
          clips.push({ url: base, sourceUrl: photoUrl, index });
        } else {
          const from = (index / photos.length) * 100;
          const to = ((index + 1) / photos.length) * 100;
          const result = await provider.imageToVideo({
            imageUrl: base,
            prompt: params.prompt,
            durationSec,
            model,
            params: params.aspect_ratio ? { aspect_ratio: params.aspect_ratio } : {},
            context: sceneContext(ctx, index, from, to),
          });
          clips.push({ url: result.outputUrl, sourceUrl: photoUrl, index });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        ctx.logger.warn(`[scene-batch] сцена ${index + 1} не удалась: ${message}`);
        failures.push({ index, message });
      }
      await ctx.reportProgress(Math.round(((index + 1) / photos.length) * 100));
    }

    // Одна-две сорвавшиеся сцены не должны стоить пользователю всего ролика: подарок
    // с девятью сценами вместо десяти он не заметит, а полный отказ заметит обязательно.
    // Но если развалилась пятая часть — собирать нечего, честнее упасть и вернуть коины.
    const required = Math.max(2, Math.ceil(photos.length * 0.8));
    if (clips.length < Math.min(required, photos.length)) {
      throw new Error(
        `SCENE_BATCH_FAILED: удалось собрать только ${clips.length} сцен из ${photos.length}. ${failures[0]?.message ?? ''}`.trim(),
      );
    }

    return {
      type: mode === 'stylize' ? 'image' : 'video',
      url: clips[0].url,
      metadata: {
        clips: clips.map((clip) => clip.url),
        sceneCount: clips.length,
        requestedCount: photos.length,
        failedCount: failures.length,
        model,
        mode,
        durationSec,
      },
    } satisfies BlockOutput;
  },
};
