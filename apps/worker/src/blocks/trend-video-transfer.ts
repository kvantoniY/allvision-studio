import { spawn } from 'node:child_process';
import { z } from 'zod';
import { getBlockCatalogItem } from '@allvision/shared';
import type { ProviderRunContext } from '../providers/ai-provider';
import { muxReferenceAudioIfSilent } from './reference-audio';
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
  human_motion_model: z.union([z.string(), tierModelParamsSchema]).optional(),
  animal_motion_model: z.union([z.string(), tierModelParamsSchema]).optional(),
  animal_pose_enabled: z.boolean().optional(),
  animal_pose_model: z.union([z.string(), tierModelParamsSchema]).optional(),
  animal_pose_prompt: z.string().optional(),
  animal_prompt: z.string().optional(),
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
  //  human  -> human_motion_model (default Kling Motion 3.0 Pro);
  //  animal -> animal_motion_model (default Wan 2.7 Reference-to-Video) с промежуточным шагом позы;
  //  не задано -> motion_model услуги (по умолчанию wan-motion).
  // НИКАКИХ фолбэков на другую модель: выбранная модель либо отрабатывает, либо генерация падает
  // с честной ошибкой и refund'ом (раньше тихий фолбэк на Wan 2.2 маскировал отказ выбранной модели).
  const isAnimal = parsed.subject_type === 'animal';
  const motionModel = parsed.subject_type === 'human'
    ? stringModel(parsed.human_motion_model, 'kling-motion-3.0-pro')
    : isAnimal
      ? stringModel(parsed.animal_motion_model, 'wan-2.7-reference')
      : stringModel(parsed.motion_model, 'wan-motion');
  const duration = await referenceDurationSec(parsed, 5, ctx);
  const baseParams = asObject(parsed);
  let inputImageUrl = primaryPhoto;
  let motionStartProgress = 5;

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
      context: scaledContext(ctx.providerContext, ctx.reportProgress, 5, 25),
    });
    inputImageUrl = duo.outputUrl;
    motionStartProgress = 25;
  }

  // Промежуточный шаг для животных: GPT Image ставит питомца в полный рост (вертикально, всё тело
  // в кадре) — motion-модели переносят танец на такую позу существенно лучше, чем на лежащего/
  // обрезанного кота. Управляется admin-параметрами animal_pose_enabled/animal_pose_model/prompt.
  if (isAnimal && parsed.animal_pose_enabled !== false) {
    const poseFrom = motionStartProgress;
    const pose = await provider.imageEdit({
      imageUrl: inputImageUrl,
      prompt: parsed.animal_pose_prompt ?? defaultAnimalPosePrompt(),
      model: stringModel(parsed.animal_pose_model, 'gpt-image-2'),
      params: {
        output_format: 'jpg',
        quality: 'high',
        aspect_ratio: parsed.aspect_ratio === '16:9' ? '16:9' : '9:16',
      },
      context: scaledContext(ctx.providerContext, ctx.reportProgress, poseFrom, poseFrom + 20),
    });
    inputImageUrl = pose.outputUrl;
    motionStartProgress = poseFrom + 20;
  }

  const result = await provider.motionTransfer({
    inputImageUrl,
    drivingVideoUrl: parsed.reference_video,
    // Только admin-промпт; встроенного «анатомического» промпта больше нет: его хвост
    // («...minimal blur...») Wan понимал как указание ДОБАВИТЬ размытие. Ветка животных использует
    // ОТДЕЛЬНЫЙ animal_prompt: общий prompt услуг человеко-центричен («person identity, stable
    // face») и портит нелюдей. Пусто -> без текстовой подсказки (у Wan 2.7 нейтральный дефолт
    // задаёт провайдер).
    prompt: isAnimal ? parsed.animal_prompt : parsed.prompt,
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
    context: scaledContext(ctx.providerContext, ctx.reportProgress, motionStartProgress, 95),
  });
  // Если движок вернул «немое» видео — подкладываем оригинальную дорожку референса (трендовую музыку).
  if (parsed.keep_original_audio !== false) {
    result.outputUrl = await muxReferenceAudioIfSilent({
      resultUrl: result.outputUrl,
      referenceVideoUrl: parsed.reference_video,
      ctx,
    });
  }
  await ctx.reportProgress(100);
  return providerResultToOutput(result, 'video');
}

// Позитивная формулировка без негаций и слов про blur: «minimal blur» в старом промпте Wan
// трактовал как «добавь размытие».
function defaultAnimalPosePrompt() {
  return [
    'Show the exact same animal from the photo standing upright on its hind legs, full body visible from head to feet, centered in a vertical frame.',
    'Keep the same species, breed, fur pattern, colors, markings, face and eyes as in the original photo.',
    'Natural relaxed stance ready to dance, paws down at its sides, looking at the camera.',
    'Photorealistic, sharp focus, even soft lighting, clean simple studio background.',
  ].join(' ');
}

async function runKlingOmni(parsed: ParsedParams, primaryPhoto: string, ctx: BlockContext) {
  const provider = ctx.getAIProvider();
  const requested = stringModel(parsed.kling_omni_model, 'kling-3-omni');
  // На fal у легаси-слага kling-3-omni эндпоинт `.../v3/pro/text-to-video` — чистый text-to-video БЕЗ
  // полей image_url/video_url. Для reference-переноса (фото + референс-видео) используем Kling O3
  // Reference V2V (`o3/{pro,standard}/video-to-video/reference`): принимает video_url (@Video1),
  // image_urls (@Image1..) и промпт; keep_audio=true сохраняет ОРИГИНАЛЬНЫЙ звук референса.
  const model = parsed.reference_video && requested === 'kling-3-omni' ? 'kling-o3-omni' : requested;
  if (model !== requested) {
    ctx.logger.info('[trend-video-transfer] kling-3-omni is text-only on fal; using Kling O3 Reference V2V for reference transfer');
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
      aspect_ratio: parsed.aspect_ratio ?? 'auto',
      resolution: parsed.resolution ?? '720p',
      // Kling O3 Reference V2V: keep_audio (default true) — оригинальная дорожка референса.
      keep_audio: parsed.keep_original_audio ?? true,
      enable_audio: parsed.enable_audio ?? false,
      keep_original_audio: parsed.keep_original_audio ?? true,
      prefer_multi_shots: parsed.prefer_multi_shots ?? false,
    },
    context: scaledContext(ctx.providerContext, ctx.reportProgress, 5, 95),
  });
  if (parsed.keep_original_audio !== false) {
    result.outputUrl = await muxReferenceAudioIfSilent({
      resultUrl: result.outputUrl,
      referenceVideoUrl: parsed.reference_video,
      ctx,
    });
  }
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
      aspect_ratio: parsed.aspect_ratio ?? 'auto',
      resolution: parsed.resolution ?? '720p',
    },
    context: scaledContext(ctx.providerContext, ctx.reportProgress, 5, 95),
  });
  // Seedance генерит с generate_audio=false (иначе сочиняет свою музыку) — муксим дорожку референса.
  if (parsed.keep_original_audio !== false) {
    result.outputUrl = await muxReferenceAudioIfSilent({
      resultUrl: result.outputUrl,
      referenceVideoUrl: parsed.reference_video,
      ctx,
    });
  }
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

// Kling O3 Reference V2V: референс-видео адресуется как @Video1, фото-референсы — @Image1, @Image2
// (из описания полей в схеме fal). Субъект описан нейтрально («subject», не «person»), чтобы промпт
// одинаково работал для человека и животного.
function defaultSingleKlingOmniPrompt() {
  return [
    'Use @Video1 as the exact motion, timing, camera, background, music and scene reference.',
    'Replace the main subject of @Video1 with the subject from @Image1, keeping the identity from @Image1.',
    'Keep exactly one main subject in the result. Preserve its real identity, face, body shape and anatomy from @Image1: an animal stays that exact animal with natural animal anatomy, a human keeps their face and body.',
    'Do not copy the identity from @Video1, do not add subjects, do not blend identities, no text, no watermark.',
    'Photorealistic social video, stable identity across every frame, natural movement and lighting.',
  ].join(' ');
}

function defaultDuoKlingOmniPrompt() {
  return [
    'Use @Video1 as the exact motion, timing, camera, background, music and scene reference.',
    'Use @Image1 as the identity reference for the LEFT subject and @Image2 as the identity reference for the RIGHT subject.',
    'Keep exactly two subjects in the result. Do not add, remove, duplicate or merge subjects.',
    'Preserve each identity separately: face, body shape and anatomy exactly as in the reference images.',
    'Do not swap sides, do not blend identities, do not copy identities from @Video1, no text, no watermark.',
    'Photorealistic social video, stable identities across every frame, natural dance movement and believable lighting.',
  ].join(' ');
}

// Seedance 2.0 reference-to-video: якоря по схеме fal — @Image1..@Image9, @Video1..@Video3.
function defaultSingleSeedanceOmniPrompt() {
  return [
    'Use @Video1 as the reference for motion, choreography, timing, camera rhythm, framing and scene dynamics.',
    'Use @Image1 as the identity reference for the only main subject: recreate the movement from @Video1 performed by the subject from @Image1.',
    'Keep exactly one main subject in the result and preserve the identity from @Image1 consistently across all frames: an animal stays that exact animal with natural animal anatomy, a human keeps their face and body.',
    'Do not copy the identity from @Video1, do not add subjects, no text, no watermark.',
    'Photorealistic social video, natural movement, stable identity, believable lighting.',
  ].join(' ');
}

function defaultDuoSeedanceOmniPrompt() {
  return [
    'Use @Video1 as the reference for motion, choreography, timing, camera rhythm, framing and scene dynamics.',
    'Use @Image1 as the identity reference for the LEFT subject and @Image2 as the identity reference for the RIGHT subject.',
    'Keep exactly two subjects in the result, matching the two positions from @Video1.',
    'Preserve each identity separately, do not swap sides, do not blend identities, do not copy identities from @Video1.',
    'Photorealistic social video, stable identities across every frame, natural motion, no text, no watermark.',
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
