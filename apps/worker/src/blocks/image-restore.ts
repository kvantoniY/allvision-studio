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

const catalog = getBlockCatalogItem('image-restore');
if (!catalog) throw new Error('Block catalog metadata missing: image-restore');

const paramsSchema = z.object({
  model: z.union([z.string(), tierModelParamsSchema]).optional(),
  strength: z.number().min(0).max(1).optional(),
});

export const imageRestoreBlock: BlockDefinition = {
  ...catalog,
  inputSchema: anyInputSchema,
  outputSchema: blockOutputSchema,
  paramsSchema,
  estimatedCostCoins: (params) =>
    estimateFromSupportedModel(params, 3, catalog.supportedModels),
  async executor(params, input, ctx) {
    const parsed = paramsSchema.parse(params);
    await ctx.reportProgress(5);
    const handle = await ctx.getAIProvider().restorePhoto({
      imageUrl: readInputUrl(input),
      config: asObject(parsed),
    });
    const output = await waitForAIJob({ handle, ctx, expectedType: 'image' });
    await ctx.reportProgress(100);
    return output;
  },
};
