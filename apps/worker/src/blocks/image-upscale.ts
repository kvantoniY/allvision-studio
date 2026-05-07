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
    const result = await ctx.getAIProvider().imageRestore({
      imageUrl: readInputUrl(input),
      model: typeof parsed.model === 'string' ? parsed.model : 'upscale-x2',
      params: { ...asObject(parsed), operation: 'upscale' },
      context: ctx.providerContext,
    });
    const output = providerResultToOutput(result, 'image');
    await ctx.reportProgress(100);
    return output;
  },
};
