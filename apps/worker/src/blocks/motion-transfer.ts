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

const catalog = getBlockCatalogItem('motion-transfer');
if (!catalog) throw new Error('Block catalog metadata missing: motion-transfer');

const paramsSchema = z.object({
  model: z.union([z.string(), tierModelParamsSchema]).optional(),
  input_image: z.string().optional(),
  driving_video: z.string().min(1),
  prompt: z.string().optional(),
  duration: z.number().min(1).max(30).optional(),
  aspect_ratio: z.enum(['auto', '9:16', '16:9', '1:1']).default('auto').optional(),
  resolution: z.enum(['720p', '1080p']).default('720p').optional(),
});

export const motionTransferBlock: BlockDefinition = {
  ...catalog,
  inputSchema: anyInputSchema,
  outputSchema: blockOutputSchema,
  paramsSchema,
  estimatedCostCoins: (params) =>
    estimateFromSupportedModel(params, 30, catalog.supportedModels),
  async executor(params, input, ctx) {
    const parsed = paramsSchema.parse(params);
    await ctx.reportProgress(5);
    const result = await ctx.getAIProvider().motionTransfer({
      inputImageUrl: parsed.input_image ?? readInputUrl(input),
      drivingVideoUrl: parsed.driving_video,
      prompt: parsed.prompt,
      durationSec: parsed.duration ?? 5,
      model: typeof parsed.model === 'string' ? parsed.model : 'kling-motion-2.6-std',
      params: asObject(parsed),
      context: ctx.providerContext,
    });
    const output = providerResultToOutput(result, 'video');
    await ctx.reportProgress(100);
    return output;
  },
};
