import { spawn } from 'node:child_process';
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

const modeSchema = z.enum(['face_swap', 'motion_transfer', 'kling_omni', 'seedance_omni']);

const paramsSchema = z.object({
  mode: modeSchema.optional(),
  default_mode: modeSchema.default('face_swap').optional(),
  people_count: z.enum(['one', 'two']).default('one'),
  reference_video: z.string().min(1),
  primary_photo: z.string().optional(),
  secondary_photo: z.string().optional(),
  duration: z.number().min(1).max(30).optional(),
  duration_from_reference: z.boolean().optional(),
  face_swap_model: z.union([z.string(), tierModelParamsSchema]).optional(),
  motion_model: z.union([z.string(), tierModelParamsSchema]).optional(),
  kling_omni_model: z.union([z.string(), tierModelParamsSchema]).optional(),
  seedance_model: z.union([z.string(), tierModelParamsSchema]).optional(),
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
  enable_audio: z.boolean().optional(),
  keep_original_audio: z.boolean().optional(),
  prefer_multi_shots: z.boolean().optional(),
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
    const mode = parsed.success ? effectiveMode(parsed.data) : undefined;
    const peopleCount = parsed.success ? parsed.data.people_count : undefined;
    if (mode === 'seedance_omni') return peopleCount === 'two' ? 190 : 150;
    if (mode === 'kling_omni') return peopleCount === 'two' ? 200 : 150;
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
    const mode = effectiveMode(parsed);
    if (mode === 'motion_transfer') {
      return runMotionTransfer(parsed, primaryPhoto, ctx);
    }
    if (mode === 'kling_omni') {
      return runKlingOmni(parsed, primaryPhoto, ctx);
    }
    if (mode === 'seedance_omni') {
      return runSeedanceOmni(parsed, primaryPhoto, ctx);
    }
    return runFaceSwap(parsed, primaryPhoto, ctx);
  },
};

type ParsedParams = z.infer<typeof paramsSchema>;

function effectiveMode(parsed: Partial<ParsedParams>) {
  return parsed.mode ?? parsed.default_mode ?? 'face_swap';
}

async function runFaceSwap(parsed: ParsedParams, primaryPhoto: string, ctx: BlockContext) {
  const provider = ctx.getAIProvider();
  const model = stringModel(parsed.face_swap_model, 'qubico-video-toolkit');
  const baseParams = asObject(parsed);
  const duration = await referenceDurationSec(parsed, 10, ctx);
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
  const duration = await referenceDurationSec(parsed, 5, ctx);
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

  try {
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
        keep_original_sound: true,
      },
      context: scaledContext(ctx.providerContext, ctx.reportProgress, parsed.people_count === 'two' ? 35 : 5, 95),
    });
    await ctx.reportProgress(100);
    return providerResultToOutput(result, 'video');
  } catch (err) {
    // Kling Motion Control requires a human in the character image and rejects pets/objects with
    // "Failed to upload character image (may require human in image)". That submit is not billed
    // (consume: 0), so we transparently fall back to the Kling 3.0 Omni reference flow, which accepts
    // any subject (person, pet, character). Humans keep using motion_control; only rejected subjects fall back.
    if (!isNonHumanCharacterError(err)) throw err;
    ctx.logger.warn(
      '[trend-video-transfer] Kling Motion Control rejected the character image (likely a non-human subject); falling back to Kling 3.0 Omni',
    );
    return runKlingOmni({ ...parsed, prompt: neutralKlingOmniPrompt(parsed.people_count) }, primaryPhoto, ctx);
  }
}

function isNonHumanCharacterError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err ?? '');
  return /may require human in image|failed to upload character image/i.test(message);
}

// Subject-neutral omni prompt used when the human-only motion model rejects the image.
// Works for people, pets and characters alike. Critically: it must NOT humanize a non-human
// subject — a dog must keep four legs and paws, not human hands/arms; whatever the subject is,
// keep its OWN real anatomy from the image and only borrow the motion from the reference video.
const ANATOMY_RULE_ONE = [
  'Use @video ONLY as the reference for motion, rhythm, timing, camera and framing — never as an appearance, body or anatomy reference.',
  'Use @image_1 as the appearance and anatomy reference for the single main subject. The subject may be a human, an animal or a non-human creature.',
  'Strictly keep the subject\'s real body and anatomy from @image_1: its own head, limbs, body shape and proportions.',
  'If the subject is an animal, it MUST stay that animal with correct animal anatomy — four legs and paws/hooves, muzzle, tail, fur/feathers/scales exactly as in the image — performing the dance on its own animal body. Never give an animal human hands, human arms, a human torso or a human face.',
  'If the subject is a human, keep a normal human body. If it is some other creature, keep its own anatomy. Never graft human limbs onto a non-human subject, and never graft animal parts onto a human.',
  'Adapt the reference choreography naturally to the subject\'s real body instead of forcing a human skeleton onto it.',
].join(' ');
const ANATOMY_RULE_TWO = [
  'Use @video ONLY as the reference for motion, rhythm, timing, camera and framing — never as an appearance, body or anatomy reference.',
  'Use @image_1 and @image_2 as the appearance and anatomy references for the two main subjects. Each subject may be a human, an animal or a non-human creature.',
  'Strictly keep each subject\'s real body and anatomy from its image: its own head, limbs, body shape and proportions.',
  'If a subject is an animal, it MUST stay that animal with correct animal anatomy — four legs and paws/hooves, muzzle, tail, fur/feathers/scales exactly as in the image. Never give an animal human hands, arms, torso or face; never graft human limbs onto a non-human or animal parts onto a human.',
  'Adapt the reference choreography naturally to each subject\'s real body instead of forcing a human skeleton onto it.',
].join(' ');

function neutralKlingOmniPrompt(peopleCount: ParsedParams['people_count']) {
  if (peopleCount === 'two') {
    return [
      ANATOMY_RULE_TWO,
      'Animate those exact two subjects performing a movement matching @video, adapted to each subject\'s own body.',
      'Keep exactly two subjects, do not add, remove, duplicate or blend subjects, do not copy identity or anatomy from @video.',
      'Photorealistic vertical social video, stable identities and correct anatomy across every frame, natural believable movement and lighting, no text, no watermark.',
    ].join(' ');
  }
  return [
    ANATOMY_RULE_ONE,
    'Animate that exact subject performing a movement matching @video, adapted to the subject\'s own body.',
    'Keep exactly one subject, do not add, duplicate or blend subjects, do not copy identity or anatomy from @video.',
    'Photorealistic vertical social video, stable identity and correct anatomy across every frame, natural believable movement and lighting, no text, no watermark.',
  ].join(' ');
}

async function runKlingOmni(parsed: ParsedParams, primaryPhoto: string, ctx: BlockContext) {
  const provider = ctx.getAIProvider();
  const model = stringModel(parsed.kling_omni_model, 'kling-3-omni');
  const duration = await referenceDurationSec(parsed, 10, ctx);
  const images = parsed.people_count === 'two'
    ? [primaryPhoto, parsed.secondary_photo!]
    : [primaryPhoto];
  const baseParams = asObject(parsed);
  const prompt = parsed.prompt
    ?? (parsed.people_count === 'two' ? defaultDuoKlingOmniPrompt() : defaultSingleKlingOmniPrompt());

  const result = await provider.textToVideo({
    prompt,
    durationSec: duration,
    model,
    params: {
      ...baseParams,
      images,
      video: parsed.reference_video,
      duration,
      aspect_ratio: parsed.aspect_ratio ?? '9:16',
      resolution: parsed.resolution ?? '720p',
      enable_audio: parsed.enable_audio ?? false,
      keep_original_audio: parsed.keep_original_audio ?? true,
      prefer_multi_shots: parsed.prefer_multi_shots ?? false,
    },
    context: scaledContext(ctx.providerContext, ctx.reportProgress, 5, 95),
  });
  await ctx.reportProgress(100);
  return providerResultToOutput(result, 'video');
}

async function runSeedanceOmni(parsed: ParsedParams, primaryPhoto: string, ctx: BlockContext) {
  const provider = ctx.getAIProvider();
  const model = stringModel(parsed.seedance_model, 'seedance-2-omni');
  const duration = await referenceDurationSec(parsed, 10, ctx);
  const imageUrls = parsed.people_count === 'two'
    ? [primaryPhoto, parsed.secondary_photo!]
    : [primaryPhoto];
  const baseParams = asObject(parsed);
  const prompt = parsed.prompt
    ?? (parsed.people_count === 'two' ? defaultDuoSeedanceOmniPrompt() : defaultSingleSeedanceOmniPrompt());

  const result = await provider.textToVideo({
    prompt,
    durationSec: duration,
    model,
    params: {
      ...baseParams,
      mode: 'omni_reference',
      image_urls: imageUrls,
      video_urls: [parsed.reference_video],
      duration,
      aspect_ratio: parsed.aspect_ratio ?? '9:16',
      resolution: parsed.resolution ?? '720p',
    },
    context: scaledContext(ctx.providerContext, ctx.reportProgress, 5, 95),
  });
  await ctx.reportProgress(100);
  return providerResultToOutput(result, 'video');
}

async function referenceDurationSec(parsed: ParsedParams, fallback: number, ctx: BlockContext) {
  if (!parsed.duration_from_reference) return parsed.duration ?? fallback;
  try {
    const duration = await ffprobeVideoDuration(parsed.reference_video);
    if (duration && duration > 0) return Math.max(1, Math.min(15, Math.ceil(duration)));
  } catch (err) {
    ctx.logger.warn('[trend-video-transfer] Failed to probe reference duration; using fallback duration', err);
  }
  return parsed.duration ?? fallback;
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

function defaultSingleKlingOmniPrompt() {
  return [
    'Use @video as the exact motion, timing, camera, background and scene reference.',
    'Use @image_1 as the identity reference for the only main person.',
    'Keep exactly one person in the result. Preserve face shape, eyes, nose, mouth, eyebrows, hair, skin tone and natural expression from @image_1.',
    'Do not copy the identity from @video, do not add people, do not blend identities, no text, no watermark.',
    'Photorealistic vertical social video, stable identity across every frame, natural body movement and lighting.',
  ].join(' ');
}

function defaultDuoKlingOmniPrompt() {
  return [
    'Use @video as the exact motion, timing, camera, background and scene reference.',
    'Use @image_1 as the identity reference for the LEFT person and @image_2 as the identity reference for the RIGHT person.',
    'Keep exactly two people in the result. Do not add, remove, duplicate or merge people.',
    'Preserve each identity separately: face shape, eyes, nose, mouth, eyebrows, hair, skin tone and natural expression.',
    'Do not swap sides, do not blend faces, do not copy identities from @video, no text, no watermark.',
    'Photorealistic vertical social video, stable identities across every frame, natural dance movement and believable lighting.',
  ].join(' ');
}

function defaultSingleSeedanceOmniPrompt() {
  return [
    'Use the uploaded video as the reference for motion, timing, camera rhythm, framing and scene dynamics.',
    'Use @image1 as the identity reference for the only main person and @video1 as the video reference.',
    'Keep exactly one person in the result and preserve the uploaded identity consistently across all frames.',
    'Do not copy the face from the reference video, do not add people, no text, no watermark.',
    'Photorealistic vertical social video, natural movement, stable face, believable lighting.',
  ].join(' ');
}

function defaultDuoSeedanceOmniPrompt() {
  return [
    'Use the uploaded video as the reference for motion, timing, camera rhythm, framing and scene dynamics.',
    'Use @image1 as the identity reference for the LEFT person, @image2 as the identity reference for the RIGHT person and @video1 as the video reference.',
    'Keep exactly two people in the result, matching the two positions from the reference video.',
    'Preserve each identity separately, do not swap sides, do not blend faces, do not copy identities from the video.',
    'Photorealistic vertical social video, stable identities across every frame, natural motion, no text, no watermark.',
  ].join(' ');
}

function ffprobeVideoDuration(url: string): Promise<number | undefined> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    };
    const succeed = (value: number | undefined) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const child = spawn('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'json',
      url,
    ], { windowsHide: true });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      fail(new Error('ffprobe timed out'));
    }, 10_000);
    child.stdout.on('data', (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr.on('data', (chunk) => stderr.push(Buffer.from(chunk)));
    child.on('error', fail);
    child.on('close', (code) => {
      if (code !== 0) {
        fail(new Error(Buffer.concat(stderr).toString('utf8') || 'ffprobe failed'));
        return;
      }
      try {
        const parsed = JSON.parse(Buffer.concat(stdout).toString('utf8')) as { format?: { duration?: string } };
        const duration = Number(parsed.format?.duration);
        succeed(Number.isFinite(duration) ? duration : undefined);
      } catch (err) {
        fail(err as Error);
      }
    });
  });
}
