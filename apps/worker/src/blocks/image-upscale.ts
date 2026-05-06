import { z } from 'zod';
import { getBlockCatalogItem } from '@allvision/shared';
import type { BlockDefinition } from './types';
import {
  anyInputSchema,
  asObject,
  blockOutputSchema,
  estimateFromSupportedModel,
  readInputUrl,
  tierModelParamsSchema,
  waitForAIJob,
} from './utils';

const catalog = getBlockCatalogItem('image-upscale');
if (!catalog) throw new Error('Block catalog metadata missing: image-upscale');

const paramsSchema = z.object({
  model: z.union([z.string(), tierModelParamsSchema]).optional(),
  scale: z.number().min(1).max(8).optional(),
});

export const imageUpscaleBlock: BlockDefinition = {
  ...catalog,
  inputSchema: anyInputSchema,
  outputSchema: blockOutputSchema,
  paramsSchema,
  estimatedCostCoins: (params) =>
    estimateFromSupportedModel(params, 2, catalog.supportedModels),
  async executor(params, input, ctx) {
    const parsed = paramsSchema.parse(params);
    await ctx.reportProgress(10);
    const handle = await ctx.getAIProvider().restorePhoto({
      imageUrl: readInputUrl(input),
      config: { ...asObject(parsed), operation: 'upscale' },
    });
    const output = await waitForAIJob({ handle, ctx, expectedType: 'image' });
    await ctx.reportProgress(100);
    return output;
  },
};
