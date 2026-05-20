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

const catalog = getBlockCatalogItem('face-swap-video');
if (!catalog) throw new Error('Block catalog metadata missing: face-swap-video');

const paramsSchema = z.object({
  model: z.union([z.string(), tierModelParamsSchema]).optional(),
  target_video: z.string().optional(),
  templateVideo: z.string().optional(),
  prompt: z.string().optional(),
  duration: z.number().min(1).max(60).optional(),
  estimatedFrames: z.number().int().min(1).optional(),
  swap_faces_index: z.string().optional(),
  target_faces_index: z.string().optional(),
  aspect_ratio: z.enum(['auto', '9:16', '16:9', '1:1']).default('auto').optional(),
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
    const targetVideoUrl = parsed.target_video ?? parsed.templateVideo;
    if (!targetVideoUrl) throw new Error('face-swap-video requires target_video');
    await ctx.reportProgress(5);
    const result = await ctx.getAIProvider().faceSwapVideo({
      swapImageUrl: readInputUrl(input),
      targetVideoUrl,
      model: typeof parsed.model === 'string' ? parsed.model : 'qubico-video-toolkit',
      params: asObject(parsed),
      context: ctx.providerContext,
    });
    const output = providerResultToOutput(result, 'video');
    await ctx.reportProgress(100);
    return output;
  },
};
