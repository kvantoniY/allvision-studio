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

const catalog = getBlockCatalogItem('talking-avatar');
if (!catalog) throw new Error('Block catalog metadata missing: talking-avatar');

const paramsSchema = z.object({
  model: z.union([z.string(), tierModelParamsSchema]).optional(),
  audio_url: z.string().optional(),
  prompt: z.string().optional(),
  fast_mode: z.boolean().optional(),
  mode: z.enum(['std', 'pro']).optional(),
  duration: z.union([z.number(), z.string()]).optional(),
  aspect_ratio: z.string().optional(),
  estimatedSeconds: z.number().optional(),
});

// Talking-avatar / lip-sync: character image (step input) + audio file (params.audio_url) ->
// video where the character speaks that audio. Models: OmniHuman 1.5, Kling lip-sync.
export const talkingAvatarBlock: BlockDefinition = {
  ...catalog,
  inputSchema: anyInputSchema,
  outputSchema: blockOutputSchema,
  paramsSchema,
  estimatedCostCoins: (params) => estimateFromSupportedModel(params, 130, catalog.supportedModels),
  async executor(params, input, ctx) {
    const parsed = paramsSchema.parse(params);
    const imageUrl = readInputUrl(input, '') || undefined;
    if (!imageUrl) throw new Error('talking-avatar requires a character image input');
    const audioUrl = parsed.audio_url?.trim();
    if (!audioUrl) throw new Error('talking-avatar requires audio_url (voice file)');
    const model = typeof parsed.model === 'string' && parsed.model.length > 0 ? parsed.model : 'omnihuman-1.5';

    await ctx.reportProgress(5);
    const result = await ctx.getAIProvider().talkingAvatar({
      imageUrl,
      audioUrl,
      prompt: parsed.prompt,
      model,
      params: asObject(parsed),
      context: ctx.providerContext,
    });
    const output = providerResultToOutput(result, 'video');
    await ctx.reportProgress(100);
    return output;
  },
};
