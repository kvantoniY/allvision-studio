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

const catalog = getBlockCatalogItem('video-watermark-remove');
if (!catalog) throw new Error('Block catalog metadata missing: video-watermark-remove');

const paramsSchema = z.object({
  model: z.union([z.string(), tierModelParamsSchema]).optional(),
  video_url: z.string().optional(),
  duration: z.number().min(1).max(600).optional(),
});

export const videoWatermarkRemoveBlock: BlockDefinition = {
  ...catalog,
  inputSchema: anyInputSchema,
  outputSchema: blockOutputSchema,
  paramsSchema,
  estimatedCostCoins: (params) =>
    estimateFromSupportedModel(params, 20, catalog.supportedModels),
  async executor(params, input, ctx) {
    const parsed = paramsSchema.parse(params);
    const videoUrl = parsed.video_url ?? readInputUrl(input);
    if (!videoUrl) throw new Error('video-watermark-remove requires video_url');
    await ctx.reportProgress(5);
    const result = await ctx.getAIProvider().removeWatermark({
      videoUrl,
      durationSec: parsed.duration,
      model: typeof parsed.model === 'string' ? parsed.model : 'remove-watermark',
      params: asObject(parsed),
      context: ctx.providerContext,
    });
    const output = providerResultToOutput(result, 'video');
    await ctx.reportProgress(100);
    return output;
  },
};
