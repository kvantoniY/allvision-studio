import { z } from 'zod';
import { getBlockCatalogItem } from '@allvision/shared';
import type { BlockDefinition, BlockOutput } from './types';
import { anyInputSchema, blockOutputSchema } from './utils';

const catalog = getBlockCatalogItem('video-compose');
if (!catalog) throw new Error('Block catalog metadata missing: video-compose');

const paramsSchema = z.object({
  watermark: z.boolean().optional(),
  title: z.string().optional(),
  music: z.string().optional(),
});

function videoOutputFromInput(input: unknown): BlockOutput {
  if (input && typeof input === 'object') {
    const value = input as Record<string, unknown>;
    if (value.type === 'video' && typeof value.url === 'string') {
      return {
        type: 'video',
        url: value.url,
        metadata: {
          ...(typeof value.metadata === 'object' && value.metadata ? value.metadata : {}),
          composed: true,
        },
      };
    }
    if (typeof value.resultVideo === 'string') {
      return { type: 'video', url: value.resultVideo, metadata: { composed: true } };
    }
  }
  return {
    type: 'video',
    url: 'mock://video-compose/output.mp4',
    metadata: { composed: true, mockFallback: true },
  };
}

export const videoComposeBlock: BlockDefinition = {
  ...catalog,
  inputSchema: anyInputSchema,
  outputSchema: blockOutputSchema,
  paramsSchema,
  estimatedCostCoins: () => catalog.supportedModels[0]?.estimatedCostCoins ?? 1,
  async executor(params, input, ctx) {
    paramsSchema.parse(params);
    await ctx.reportProgress(25);
    await ctx.reportProgress(60);
    const output = videoOutputFromInput(input);
    await ctx.reportProgress(100);
    return output;
  },
};
