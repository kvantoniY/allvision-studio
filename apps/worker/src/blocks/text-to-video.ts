import { z } from 'zod';
import { getBlockCatalogItem } from '@allvision/shared';
import type { BlockDefinition } from './types';
import {
  anyInputSchema,
  asObject,
  blockOutputSchema,
  estimateFromSupportedModel,
  tierModelParamsSchema,
  waitForAIJob,
} from './utils';

const catalog = getBlockCatalogItem('text-to-video');
if (!catalog) throw new Error('Block catalog metadata missing: text-to-video');

const paramsSchema = z.object({
  model: z.union([z.string(), tierModelParamsSchema]).optional(),
  prompt: z.string().min(1),
  duration: z.number().min(1).max(30).optional(),
});

export const textToVideoBlock: BlockDefinition = {
  ...catalog,
  inputSchema: anyInputSchema,
  outputSchema: blockOutputSchema,
  paramsSchema,
  estimatedCostCoins: (params) =>
    estimateFromSupportedModel(params, 45, catalog.supportedModels),
  async executor(params, _input, ctx) {
    const parsed = paramsSchema.parse(params);
    await ctx.reportProgress(5);
    const handle = await ctx.getAIProvider().generateTrend({
      imageUrl: 'mock://text-to-video/seed.jpg',
      trendPrompt: parsed.prompt,
      model: typeof parsed.model === 'string' ? parsed.model : 'veo-3.1',
      config: asObject(parsed),
    });
    const output = await waitForAIJob({ handle, ctx, expectedType: 'video' });
    await ctx.reportProgress(100);
    return output;
  },
};
