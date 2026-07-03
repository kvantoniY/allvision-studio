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
  subject_type: z.enum(['', 'human', 'animal']).optional(),
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
  // Выбор движка: пользователь на странице услуги указывает, кто на фото.
  //  human  -> Kling Motion 3.0 Pro (точный перенос на человеке; при отказе по кадрированию — фолбэк на Wan);
  //  animal -> Wan Motion (pose-retargeting, сохраняет анатомию животного, не даёт человеческих рук);
  //  не задано -> motion_model услуги (по умолчанию wan-motion как безопасный вариант).
  const motionModel = parsed.subject_type === 'human'
    ? 'kling-motion-3.0-pro'
    : parsed.subject_type === 'animal'
      ? 'wan-motion'
      : stringModel(parsed.motion_model, 'wan-motion');
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

  // Промпт motion-transfer строит сам блок (анатомически-безопасный, без человекоцентризма).
  // Человекоцентричный admin-промпт услуги («person/face») для motion-режима больше не применяется:
  // он ломал не-человеческие субъекты (кот переворачивался/мазался). enhance_identity=true у wan
  // лучше держит облик субъекта.
  const motionPrompt = subjectMotionPrompt(parsed.people_count);
  try {
    const result = await provider.motionTransfer({
      inputImageUrl,
      drivingVideoUrl: parsed.reference_video,
      prompt: motionPrompt,
      durationSec: duration,
      model: motionModel,
      params: {
        ...baseParams,
        input_image: inputImageUrl,
        video_url: parsed.reference_video,
        duration,
        aspect_ratio: parsed.aspect_ratio ?? 'auto',
        resolution: parsed.resolution ?? '720p',
        enhance_identity: true,
        keep_original_sound: true,
      },
      context: scaledContext(ctx.providerContext, ctx.reportProgress, parsed.people_count === 'two' ? 35 : 5, 95),
    });
    await ctx.reportProgress(100);
    return providerResultToOutput(result, 'video');
  } catch (err) {
    // Kling Motion Control (человекоцентричный skeleton) отбивает картинку персонажа по нескольким
    // причинам: не-человек (питомец/объект) — "may require human in image"; кадрирование — "No complete
    // upper body detected" / "Image recognition failed" (input_value_error). Во всех этих случаях
    // прозрачно уходим на Wan Motion — тот же перенос движения, но pose-retargeting толерантен к
    // кадрированию и сохраняет анатомию животных/детей (не требует «верхней части тела»).
    // Успешные motion-control прогоны (человек по пояс) идут прежним путём; фолбэк — только на отказ.
    // (Kling Omni как фолбэк не годится: его text-to-video endpoint не принимает видео-референс →
    //  "Invalid reference @Video. No videos provided".)
    if (!isKlingCharacterImageRejection(err) || motionModel === 'wan-motion') throw err;
    ctx.logger.warn(
      `[trend-video-transfer] Kling Motion Control rejected the character image (${(err as Error)?.message ?? ''}); falling back to Wan Motion`,
    );
    const result = await provider.motionTransfer({
      inputImageUrl,
      drivingVideoUrl: parsed.reference_video,
      prompt: motionPrompt,
      durationSec: duration,
      model: 'wan-motion',
      params: {
        ...baseParams,
        input_image: inputImageUrl,
        video_url: parsed.reference_video,
        duration,
        aspect_ratio: parsed.aspect_ratio ?? 'auto',
        resolution: parsed.resolution ?? '720p',
        enhance_identity: true,
        keep_original_sound: true,
      },
      context: scaledContext(ctx.providerContext, ctx.reportProgress, parsed.people_count === 'two' ? 35 : 5, 95),
    });
    await ctx.reportProgress(100);
    return providerResultToOutput(result, 'video');
  }
}

function isKlingCharacterImageRejection(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err ?? '');
  return /may require human in image|failed to upload character image|no complete upper body detected|upper body|image recognition failed|input_value_error/i.test(message);
}

// Промпт для motion-transfer (wan-motion / kling-motion): БЕЗ @-anchor (движки их не понимают) и
// БЕЗ человекоцентризма («person/face») — иначе на не-человеке (кот, собака) модель гуманизирует
// субъект, переворачивает и мажет. Держим реальную анатомию субъекта, берём только движение.
const MOTION_QUALITY_TAIL = 'Adapt the reference choreography naturally to the subject own body instead of forcing a human skeleton onto it. Keep the subject upright and correctly oriented, no mirror flip, no upside-down, no warping, no melting, no distorted limbs. Sharp, clear, well-lit, stable identity across every frame, minimal blur, no text, no watermark.';
function subjectMotionPrompt(peopleCount: ParsedParams['people_count']): string {
  if (peopleCount === 'two') {
    return `Animate exactly the two subjects from the input image so they perform the movement, rhythm, timing and energy of the reference video, while keeping each subject own real identity, body shape and anatomy exactly as in the input image. If a subject is an animal it MUST stay that animal with correct animal anatomy (four legs and paws or hooves, muzzle, tail, natural fur) and never get human hands, arms, torso or a human face; if a subject is a human keep a normal human body. ${MOTION_QUALITY_TAIL}`;
  }
  return `Animate exactly the single subject from the input image so it performs the movement, rhythm, timing and energy of the reference video, while keeping the subject own real identity, body shape and anatomy exactly as in the input image. If the subject is an animal it MUST stay that animal with correct animal anatomy (four legs and paws or hooves, muzzle, tail, natural fur) and never get human hands, arms, torso or a human face; if the subject is a human keep a normal human body. ${MOTION_QUALITY_TAIL}`;
}

async function runKlingOmni(parsed: ParsedParams, primaryPhoto: string, ctx: BlockContext) {
  const provider = ctx.getAIProvider();
  const model = stringModel(parsed.kling_omni_model, 'kling-3-omni');
  // ВАЖНО: на fal у kling-3-omni эндпоинт `.../v3/pro/text-to-video` — чистый text-to-video БЕЗ
  // полей image_url/video_url. Он физически не принимает ни фото, ни референс-видео. Поэтому для
  // reference-переноса (фото + видео) прозрачно уходим на Seedance 2.0 Omni
  // (`reference-to-video`, принимает image_urls + video_urls) — единственный рабочий omni-reference
  // на fal. Иначе фото/видео молча игнорировались бы и получался бы ролик по одному промпту.
  if (model === 'kling-3-omni' && parsed.reference_video) {
    ctx.logger.warn('[trend-video-transfer] kling-3-omni on fal is text-only (no image/video reference); routing to Seedance 2.0 Omni for reference transfer');
    return runSeedanceOmni(parsed, primaryPhoto, ctx);
  }
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
