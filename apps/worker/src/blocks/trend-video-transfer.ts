import { z } from 'zod';
import { getBlockCatalogItem } from '@allvision/shared';
import type { ProviderRunContext } from '../providers/ai-provider';
import type { BlockContext, BlockDefinition } from './types';
import {
  anyInputSchema,
  asObject,
  blockOutputSchema,
  providerResultToOutput,
  readInputUrl,
  tierModelParamsSchema,
} from './utils';

const catalog = getBlockCatalogItem('trend-video-transfer');
if (!catalog) throw new Error('Block catalog metadata missing: trend-video-transfer');

const paramsSchema = z.object({
  mode: z.enum(['face_swap', 'motion_transfer']).default('face_swap'),
  people_count: z.enum(['one', 'two']).default('one'),
  reference_video: z.string().min(1),
  primary_photo: z.string().optional(),
  secondary_photo: z.string().optional(),
  duration: z.number().min(1).max(30).optional(),
  face_swap_model: z.union([z.string(), tierModelParamsSchema]).optional(),
  motion_model: z.union([z.string(), tierModelParamsSchema]).optional(),
  portrait_model: z.union([z.string(), tierModelParamsSchema]).optional(),
  estimatedFrames: z.number().int().min(1).optional(),
  swap_faces_index: z.string().optional(),
  swap_faces_index_left: z.string().optional(),
  swap_faces_index_right: z.string().optional(),
  target_faces_index: z.string().optional(),
  target_faces_index_left: z.string().optional(),
  target_faces_index_right: z.string().optional(),
  aspect_ratio: z.enum(['auto', '9:16', '16:9', '1:1']).default('auto').optional(),
  resolution: z.enum(['720p', '1080p']).default('720p').optional(),
  prompt: z.string().optional(),
  duo_prompt: z.string().optional(),
});

export const trendVideoTransferBlock: BlockDefinition = {
  ...catalog,
  inputSchema: anyInputSchema,
  outputSchema: blockOutputSchema,
  paramsSchema,
  estimatedCostCoins: (params) => {
    const parsed = paramsSchema.partial().safeParse(params);
    const mode = parsed.success ? parsed.data.mode : undefined;
    const peopleCount = parsed.success ? parsed.data.people_count : undefined;
    if (mode === 'motion_transfer') return peopleCount === 'two' ? 120 : 100;
    return peopleCount === 'two' ? 160 : 90;
  },
  async executor(params, input, ctx) {
    const parsed = paramsSchema.parse(params);
    const primaryPhoto = parsed.primary_photo ?? readInputUrl(input, '');
    if (!primaryPhoto) throw new Error('trend-video-transfer requires primary_photo');
    if (parsed.people_count === 'two' && !parsed.secondary_photo) {
      throw new Error('trend-video-transfer requires secondary_photo for two people');
    }

    await ctx.reportProgress(3);
    if (parsed.mode === 'motion_transfer') {
      return runMotionTransfer(parsed, primaryPhoto, ctx);
    }
    return runFaceSwap(parsed, primaryPhoto, ctx);
  },
};

type ParsedParams = z.infer<typeof paramsSchema>;

async function runFaceSwap(parsed: ParsedParams, primaryPhoto: string, ctx: BlockContext) {
  const provider = ctx.getAIProvider();
  const model = stringModel(parsed.face_swap_model, 'qubico-video-toolkit');
  const baseParams = asObject(parsed);
  const duration = parsed.duration ?? 10;
  const estimatedFrames = parsed.estimatedFrames ?? Math.max(1, Math.ceil(duration * 24));

  if (parsed.people_count === 'two') {
    const first = await provider.faceSwapVideo({
      swapImageUrl: primaryPhoto,
      targetVideoUrl: parsed.reference_video,
      model,
      params: {
        ...baseParams,
        duration,
        estimatedFrames,
        swap_faces_index: parsed.swap_faces_index_left ?? parsed.swap_faces_index ?? '0',
        target_faces_index: parsed.target_faces_index_left ?? parsed.target_faces_index ?? '0',
      },
      context: scaledContext(ctx.providerContext, ctx.reportProgress, 5, 45),
    });
    const second = await provider.faceSwapVideo({
      swapImageUrl: parsed.secondary_photo!,
      targetVideoUrl: first.outputUrl,
      model,
      params: {
        ...baseParams,
        duration,
        estimatedFrames,
        swap_faces_index: parsed.swap_faces_index_right ?? parsed.swap_faces_index ?? '0',
        target_faces_index: parsed.target_faces_index_right ?? '1',
      },
      context: scaledContext(ctx.providerContext, ctx.reportProgress, 45, 95),
    });
    await ctx.reportProgress(100);
    return providerResultToOutput(second, 'video');
  }

  const result = await provider.faceSwapVideo({
    swapImageUrl: primaryPhoto,
    targetVideoUrl: parsed.reference_video,
    model,
    params: {
      ...baseParams,
      duration,
      estimatedFrames,
      swap_faces_index: parsed.swap_faces_index ?? '0',
      target_faces_index: parsed.target_faces_index ?? '0',
    },
    context: scaledContext(ctx.providerContext, ctx.reportProgress, 5, 95),
  });
  await ctx.reportProgress(100);
  return providerResultToOutput(result, 'video');
}

async function runMotionTransfer(parsed: ParsedParams, primaryPhoto: string, ctx: BlockContext) {
  const provider = ctx.getAIProvider();
  const motionModel = stringModel(parsed.motion_model, 'kling-motion-3.0-std');
  const duration = parsed.duration ?? 5;
  const baseParams = asObject(parsed);
  let inputImageUrl = primaryPhoto;

  if (parsed.people_count === 'two') {
    const duo = await provider.imageEdit({
      imageUrl: primaryPhoto,
      prompt: parsed.duo_prompt ?? defaultDuoPrompt(),
      model: stringModel(parsed.portrait_model, 'nano-banana'),
      params: {
        image_urls: [parsed.secondary_photo],
        output_format: 'jpg',
        aspect_ratio: parsed.aspect_ratio === '16:9' ? '16:9' : '9:16',
        resolution: '2K',
      },
      context: scaledContext(ctx.providerContext, ctx.reportProgress, 5, 35),
    });
    inputImageUrl = duo.outputUrl;
  }

  const result = await provider.motionTransfer({
    inputImageUrl,
    drivingVideoUrl: parsed.reference_video,
    prompt: parsed.prompt,
    durationSec: duration,
    model: motionModel,
    params: {
      ...baseParams,
      input_image: inputImageUrl,
      video_url: parsed.reference_video,
      duration,
      aspect_ratio: parsed.aspect_ratio ?? 'auto',
      resolution: parsed.resolution ?? '720p',
      keep_original_sound: false,
    },
    context: scaledContext(ctx.providerContext, ctx.reportProgress, parsed.people_count === 'two' ? 35 : 5, 95),
  });
  await ctx.reportProgress(100);
  return providerResultToOutput(result, 'video');
}

function stringModel(value: string | { standard: string; pro: string } | undefined, fallback: string) {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function scaledContext(
  context: ProviderRunContext,
  reportProgress: (percent: number) => Promise<void>,
  from: number,
  to: number,
): ProviderRunContext {
  return {
    ...context,
    reportProgress: async (percent: number) => {
      const safe = Math.max(0, Math.min(100, percent));
      await reportProgress(from + ((to - from) * safe) / 100);
    },
  };
}

function defaultDuoPrompt() {
  return [
    'Create one photorealistic vertical full-body or waist-up source image of exactly two adults for motion transfer.',
    '@image_1 is the person on the left, @image_2 is the person on the right.',
    'Preserve both identities clearly: face shape, eyes, nose, mouth, hair, skin tone and natural expression.',
    'Keep them as two separate people, do not blend faces, do not add extra people.',
    'Natural casual dance-ready clothing, neutral background, realistic proportions, clean sharp faces, no text, no watermark.',
  ].join(' ');
}
