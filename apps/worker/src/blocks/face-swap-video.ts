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

const catalog = getBlockCatalogItem('face-swap-video');
if (!catalog) throw new Error('Block catalog metadata missing: face-swap-video');

const paramsSchema = z.object({
  model: z.union([z.string(), tierModelParamsSchema]).optional(),
  templateVideo: z.string().optional(),
  prompt: z.string().optional(),
});

export const faceSwapVideoBlock: BlockDefinition = {
  ...catalog,
  inputSchema: anyInputSchema,
  outputSchema: blockOutputSchema,
  paramsSchema,
  estimatedCostCoins: (params) =>
    estimateFromSupportedModel(params, 18, catalog.supportedModels),
  async executor(params, input, ctx) {
    const parsed = paramsSchema.parse(params);
    await ctx.reportProgress(5);
    const handle = await ctx.getAIProvider().generateTrend({
      imageUrl: readInputUrl(input),
      trendPrompt: parsed.prompt ?? 'Mock face swap video',
      model: typeof parsed.model === 'string' ? parsed.model : 'faceswap-lite',
      config: asObject(parsed),
    });
    const output = await waitForAIJob({ handle, ctx, expectedType: 'video' });
    await ctx.reportProgress(100);
    return output;
  },
};
