import { z } from 'zod';
import { getBlockCatalogItem } from '@allvision/shared';
import type { BlockDefinition, BlockOutput } from './types';
import { anyInputSchema, blockOutputSchema } from './utils';
import { getLumeanProvider } from '../providers';

const catalog = getBlockCatalogItem('text-to-speech');
if (!catalog) throw new Error('Block catalog metadata missing: text-to-speech');

const paramsSchema = z.object({
  model: z.string().optional(),
  text: z.string().optional(),
  voice: z.string().optional(),
  speed: z.number().min(0.5).max(2).optional(),
  emotion: z.string().optional(),
  language: z.string().optional(),
  // Тонкие настройки голоса Lumean: у ElevenLabs это отдельные ручки характера речи.
  stability: z.number().min(0).max(1).optional(),
  similarity_boost: z.number().min(0).max(1).optional(),
  style: z.number().min(0).max(1).optional(),
  use_speaker_boost: z.boolean().optional(),
});

/** Голоса Lumean живут отдельным сервисом со своим балансом — отсюда отдельная ветка. */
function isLumeanModel(model: string): boolean {
  return model.startsWith('lumean');
}

const DEFAULT_MODEL = 'minimax-speech';

function textFromInput(input: unknown): string | undefined {
  if (typeof input === 'string') return input;
  if (input && typeof input === 'object') {
    const record = input as Record<string, unknown>;
    if (typeof record.text === 'string') return record.text;
  }
  return undefined;
}

export const textToSpeechBlock: BlockDefinition = {
  ...catalog,
  inputSchema: anyInputSchema,
  outputSchema: blockOutputSchema,
  paramsSchema,
  estimatedCostCoins: () => catalog.supportedModels[0]?.estimatedCostCoins ?? 0,
  async executor(rawParams, input, ctx) {
    const params = paramsSchema.parse(rawParams ?? {});
    // Текст поздравления обычно приходит из формы услуги, но может прилететь
    // и как результат предыдущего шага — тогда берём его из входа.
    const text = (params.text ?? textFromInput(input) ?? '').trim();
    if (!text) {
      throw new Error('TTS_TEXT_REQUIRED: не задан текст для озвучки');
    }

    const model = params.model ?? DEFAULT_MODEL;
    await ctx.reportProgress(10);

    const result = isLumeanModel(model)
      ? await getLumeanProvider().textToSpeech({
        text,
        voice: params.voice,
        speed: params.speed,
        language: params.language,
        params: {
          stability: params.stability,
          similarity_boost: params.similarity_boost,
          style: params.style,
          use_speaker_boost: params.use_speaker_boost,
          // Slug вида lumean-eleven_multilingual_v2 несёт модель ElevenLabs после дефиса.
          model_id: model.replace(/^lumean-?/, '') || undefined,
        },
        context: ctx.providerContext,
      })
      : await ctx.getAIProvider().textToSpeech({
        text,
        model,
        voice: params.voice,
        speed: params.speed,
        emotion: params.emotion,
        language: params.language,
        context: ctx.providerContext,
      });
    await ctx.reportProgress(100);

    return {
      // Аудио — служебный вход для монтажа и lip-sync, а не самостоятельный результат,
      // поэтому отдаём его как файл-видео-подобный выход с явным mediaKind в metadata.
      type: 'video',
      url: result.outputUrl,
      metadata: {
        mediaKind: 'audio',
        model,
        voice: params.voice ?? null,
        characters: text.length,
        providerCostUsd: result.costUsd,
        ...(result.meta ?? {}),
      },
    } satisfies BlockOutput;
  },
};
