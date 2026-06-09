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

const catalog = getBlockCatalogItem('video-upscale');
if (!catalog) throw new Error('Block catalog metadata missing: video-upscale');

const paramsSchema = z.object({
  model: z.union([z.string(), tierModelParamsSchema]).optional(),
  video_url: z.string().optional(),
  duration: z.number().min(1).max(15).optional(),
  estimatedFrames: z.number().min(10).max(240).optional(),
  postprocess: z.boolean().optional(),
  postprocess_profile: z.enum(['natural', 'strong', 'max', 'custom', 'off']).optional(),
  sharpness: z.number().min(0).max(100).optional(),
  contrast: z.number().min(0).max(50).optional(),
  clarity: z.number().min(0).max(100).optional(),
});

export const videoUpscaleBlock: BlockDefinition = {
  ...catalog,
  inputSchema: anyInputSchema,
  outputSchema: blockOutputSchema,
  paramsSchema,
  estimatedCostCoins: (params) =>
    estimateFromSupportedModel(params, 8, catalog.supportedModels),
  async executor(params, input, ctx) {
    const parsed = paramsSchema.parse(params);
    const videoUrl = parsed.video_url ?? readInputUrl(input, '');
    if (!videoUrl) throw new Error('video-upscale requires video_url');
    await ctx.reportProgress(5);
    const result = await ctx.getAIProvider().videoUpscale({
      videoUrl,
      durationSec: parsed.duration,
      model: typeof parsed.model === 'string' ? parsed.model : 'video-upscale-2x',
      params: asObject(parsed),
      context: ctx.providerContext,
    });
    const output = providerResultToOutput(result, 'video');
    await ctx.reportProgress(100);
    return output;
  },
};
