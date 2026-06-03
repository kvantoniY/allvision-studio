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

const catalog = getBlockCatalogItem('image-edit');
if (!catalog) throw new Error('Block catalog metadata missing: image-edit');

const paramsSchema = z.object({
  model: z.union([z.string(), tierModelParamsSchema]).optional(),
  prompt: z.string().min(1),
  negative_prompt: z.string().optional(),
  strength: z.number().min(0).max(1).optional(),
  output_format: z.enum(['jpg', 'png', 'webp']).optional(),
  aspect_ratio: z.enum(['auto', 'input', '1:1', '16:9', '9:16', '4:3', '3:4', '21:9', '9:21']).default('auto').optional(),
  resolution: z.enum(['1K', '2K', '4K']).optional(),
  image_urls: z.union([z.string(), z.array(z.string())]).optional(),
});

export const imageEditBlock: BlockDefinition = {
  ...catalog,
  inputSchema: anyInputSchema,
  outputSchema: blockOutputSchema,
  paramsSchema,
  estimatedCostCoins: (params) =>
    estimateFromSupportedModel(params, 6, catalog.supportedModels),
  async executor(params, input, ctx) {
    const parsed = paramsSchema.parse(params);
    await ctx.reportProgress(5);
    const imageUrl = input === undefined || input === null ? undefined : readInputUrl(input, '');
    const result = await ctx.getAIProvider().imageEdit({
      imageUrl: imageUrl || undefined,
      prompt: parsed.prompt,
      negativePrompt: parsed.negative_prompt,
      strength: parsed.strength,
      model: typeof parsed.model === 'string' ? parsed.model : 'nano-banana',
      params: asObject(parsed),
      context: ctx.providerContext,
    });
    const output = providerResultToOutput(result, 'image');
    await ctx.reportProgress(100);
    return output;
  },
};
