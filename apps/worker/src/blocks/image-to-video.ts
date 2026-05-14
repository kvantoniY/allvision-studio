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

const catalog = getBlockCatalogItem('image-to-video');
if (!catalog) throw new Error('Block catalog metadata missing: image-to-video');

const paramsSchema = z.object({
  model: z.union([z.string(), tierModelParamsSchema]).optional(),
  duration: z.number().min(1).max(30).optional(),
  prompt: z.string().optional(),
  aspect_ratio: z.enum(['auto', '9:16', '16:9', '1:1']).default('auto').optional(),
  resolution: z.string().optional(),
  enable_audio: z.boolean().optional(),
  expand_prompt: z.boolean().optional(),
});

export const imageToVideoBlock: BlockDefinition = {
  ...catalog,
  inputSchema: anyInputSchema,
  outputSchema: blockOutputSchema,
  paramsSchema,
  estimatedCostCoins: (params) =>
    estimateFromSupportedModel(params, 20, catalog.supportedModels),
  async executor(params, input, ctx) {
    const parsed = paramsSchema.parse(params);
    await ctx.reportProgress(5);
    const result = await ctx.getAIProvider().imageToVideo({
      imageUrl: readInputUrl(input),
      prompt: parsed.prompt,
      durationSec: parsed.duration ?? 5,
      model: typeof parsed.model === 'string' ? parsed.model : 'kling-std',
      params: asObject(parsed),
      context: ctx.providerContext,
    });
    const output = providerResultToOutput(result, 'video');
    await ctx.reportProgress(100);
    return output;
  },
};
