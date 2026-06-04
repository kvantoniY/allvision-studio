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

const catalog = getBlockCatalogItem('scene-transfer');
if (!catalog) throw new Error('Block catalog metadata missing: scene-transfer');

const paramsSchema = z.object({
  model: z.union([z.string(), tierModelParamsSchema]).optional(),
  scene_mode: z.enum(['photo', 'video']).default('photo'),
  scene_image: z.string().optional(),
  scene_video: z.string().optional(),
  primary_photo: z.string().optional(),
  secondary_photo: z.string().optional(),
  people_count: z.enum(['auto', 'one', 'two']).default('auto'),
  stylize_characters: z.boolean().optional(),
  stylize_model: z.union([z.string(), tierModelParamsSchema]).optional(),
  stylize_prompt: z.string().optional(),
  base_prompt: z.string().optional(),
  character_prompt: z.string().optional(),
  user_prompt: z.string().optional(),
  default_user_prompt: z.string().optional(),
  duration: z.number().min(1).max(30).optional(),
  aspect_ratio: z.enum(['auto', '9:16', '16:9', '1:1', '4:3', '3:4']).optional(),
  resolution: z.enum(['720p', '1080p']).optional(),
});

type ParsedParams = z.infer<typeof paramsSchema>;
type Engine = 'kling' | 'seedance';
type PeopleCount = 'one' | 'two';

export const sceneTransferBlock: BlockDefinition = {
  ...catalog,
  inputSchema: anyInputSchema,
  outputSchema: blockOutputSchema,
  paramsSchema,
  estimatedCostCoins: (params) => {
    const parsed = paramsSchema.partial().safeParse(params);
    const data: Partial<ParsedParams> = parsed.success ? parsed.data : {};
    const engine = resolveEngine(stringModel(data.model, 'kling-3-omni'));
    const two = peopleCount(data) === 'two';
    let base = engine === 'seedance' ? (two ? 190 : 150) : (two ? 170 : 130);
    if (data.stylize_characters) base += two ? 20 : 10;
    return base;
  },
  async executor(params, input, ctx) {
    const parsed = paramsSchema.parse(params);
    const primaryPhoto = parsed.primary_photo ?? readInputUrl(input, '');
    if (!primaryPhoto) throw new Error('scene-transfer requires primary_photo');

    const count = peopleCount(parsed);
    if (count === 'two' && !parsed.secondary_photo) {
      throw new Error('scene-transfer requires secondary_photo for two people');
    }
    if (parsed.scene_mode === 'photo' && !parsed.scene_image) {
      throw new Error('scene-transfer requires scene_image in photo mode');
    }
    if (parsed.scene_mode === 'video' && !parsed.scene_video) {
      throw new Error('scene-transfer requires scene_video in video mode');
    }

    await ctx.reportProgress(2);

    // Optional cartoonify of each character via GPT Image 2 before the scene-transfer video step.
    let primaryRef = primaryPhoto;
    let secondaryRef = parsed.secondary_photo;
    let videoFrom = 5;
    if (parsed.stylize_characters) {
      const stylizeModel = stringModel(parsed.stylize_model, 'nano-banana');
      const stylizePrompt = parsed.stylize_prompt?.trim() || defaultStylizePrompt();
      const firstTo = count === 'two' ? 20 : 36;
      primaryRef = (await stylizeCharacter(ctx, stylizeModel, stylizePrompt, primaryRef, parsed, 3, firstTo)).outputUrl;
      if (count === 'two' && secondaryRef) {
        secondaryRef = (await stylizeCharacter(ctx, stylizeModel, stylizePrompt, secondaryRef, parsed, 20, 38)).outputUrl;
      }
      videoFrom = 40;
    }

    const model = stringModel(parsed.model, 'kling-3-omni');
    const engine = resolveEngine(model);
    const duration = await resolveDuration(parsed, ctx);
    const characterRefs = count === 'two' ? [primaryRef, secondaryRef!] : [primaryRef];
    const userPrompt = parsed.user_prompt?.trim() || parsed.default_user_prompt?.trim() || defaultUserPrompt();
    const prompt = buildScenePrompt({
      engine,
      sceneMode: parsed.scene_mode,
      peopleCount: count,
      basePrompt: parsed.base_prompt,
      characterPrompt: parsed.character_prompt,
      userPrompt,
    });

    if (engine === 'seedance') {
      return runSeedance(parsed, model, characterRefs, prompt, duration, ctx, videoFrom);
    }
    return runKling(parsed, model, characterRefs, prompt, duration, ctx, videoFrom);
  },
};

function peopleCount(parsed: Partial<ParsedParams>): PeopleCount {
  if (parsed.people_count === 'one') return 'one';
  if (parsed.people_count === 'two') return 'two';
  return parsed.secondary_photo && parsed.secondary_photo.trim().length > 0 ? 'two' : 'one';
}

function resolveEngine(model: string): Engine {
  return model.toLowerCase().includes('seedance') ? 'seedance' : 'kling';
}

function stringModel(value: string | { standard: string; pro: string } | undefined, fallback: string) {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

async function stylizeCharacter(
  ctx: BlockContext,
  model: string,
  prompt: string,
  imageUrl: string,
  parsed: ParsedParams,
  from: number,
  to: number,
) {
  return ctx.getAIProvider().imageEdit({
    imageUrl,
    prompt,
    model,
    params: {
      output_format: 'jpg',
      aspect_ratio: parsed.aspect_ratio && parsed.aspect_ratio !== 'auto' ? parsed.aspect_ratio : '1:1',
      quality: 'standard',
      resolution: '2K',
    },
    context: scaledContext(ctx.providerContext, ctx.reportProgress, from, to),
  });
}

async function runKling(
  parsed: ParsedParams,
  model: string,
  characterRefs: string[],
  prompt: string,
  duration: number,
  ctx: BlockContext,
  from: number,
) {
  const provider = ctx.getAIProvider();
  const images = parsed.scene_mode === 'photo'
    ? [...characterRefs, parsed.scene_image!]
    : [...characterRefs];
  const baseParams = asObject(parsed);
  const result = await provider.textToVideo({
    prompt,
    durationSec: duration,
    model,
    params: {
      ...baseParams,
      images,
      video: parsed.scene_mode === 'video' ? parsed.scene_video : undefined,
      duration,
      aspect_ratio: parsed.aspect_ratio ?? 'auto',
      resolution: parsed.resolution ?? '720p',
      enable_audio: false,
      keep_original_audio: parsed.scene_mode === 'video',
    },
    context: scaledContext(ctx.providerContext, ctx.reportProgress, from, 95),
  });
  await ctx.reportProgress(100);
  return providerResultToOutput(result, 'video');
}

async function runSeedance(
  parsed: ParsedParams,
  model: string,
  characterRefs: string[],
  prompt: string,
  duration: number,
  ctx: BlockContext,
  from: number,
) {
  const provider = ctx.getAIProvider();
  const imageUrls = parsed.scene_mode === 'photo'
    ? [...characterRefs, parsed.scene_image!]
    : [...characterRefs];
  const baseParams = asObject(parsed);
  const result = await provider.textToVideo({
    prompt,
    durationSec: duration,
    model,
    params: {
      ...baseParams,
      mode: 'omni_reference',
      image_urls: imageUrls,
      video_urls: parsed.scene_mode === 'video' ? [parsed.scene_video] : undefined,
      duration,
      aspect_ratio: parsed.aspect_ratio ?? '9:16',
      resolution: parsed.resolution ?? '720p',
    },
    context: scaledContext(ctx.providerContext, ctx.reportProgress, from, 95),
  });
  await ctx.reportProgress(100);
  return providerResultToOutput(result, 'video');
}

function buildScenePrompt(opts: {
  engine: Engine;
  sceneMode: 'photo' | 'video';
  peopleCount: PeopleCount;
  basePrompt?: string;
  characterPrompt?: string;
  userPrompt: string;
}): string {
  const { engine, sceneMode, peopleCount: count, basePrompt, characterPrompt, userPrompt } = opts;
  const img = (n: number) => (engine === 'seedance' ? `@image${n}` : `@image_${n}`);
  const vid = engine === 'seedance' ? '@video1' : '@video';

  const people = count === 'two'
    ? `Keep exactly two people in the result. ${img(1)} is the identity reference for the first / left person and ${img(2)} is the identity reference for the second / right person. Preserve each identity separately and consistently across every frame: face shape, eyes, nose, mouth, eyebrows, hair, skin tone and natural expression. Do not blend, swap sides, duplicate, merge or invent people.`
    : `Keep exactly one main person in the result. ${img(1)} is the identity reference for that person. Preserve their identity consistently across every frame: face shape, eyes, nose, mouth, eyebrows, hair, skin tone and natural expression. Do not add extra people or copy any identity from the scene reference.`;

  const sceneAnchor = sceneMode === 'video'
    ? `Use ${vid} as the exact location, environment, camera, framing, lighting, atmosphere and motion reference for the scene.`
    : `Use ${img(count === 'two' ? 3 : 2)} as the exact location, environment, framing, lighting, color palette and atmosphere reference for the scene.`;

  const placement = count === 'two'
    ? 'Realistically place both referenced people into that scene as if they truly belong there, with consistent perspective, scale, contact shadows and matching lighting.'
    : 'Realistically place the referenced person into that scene as if they truly belong there, with consistent perspective, scale, contact shadows and matching lighting.';

  const parts = [
    basePrompt?.trim(),
    sceneAnchor,
    people,
    characterPrompt?.trim(),
    placement,
    userPrompt.trim(),
    'High quality, coherent and stable identities across every frame, believable motion, no text, no watermark, no extra people.',
  ].filter((part): part is string => Boolean(part && part.length > 0));

  return parts.join(' ');
}

function defaultUserPrompt() {
  return 'Bring the scene to life with natural, subtle, believable motion and coherent action.';
}

function defaultStylizePrompt() {
  return [
    'Redraw this person as a friendly 2D animated cartoon character while keeping their recognizable face features, hairstyle and skin tone.',
    'Flat bright colors, clean hand-drawn animation style, family-friendly, single character on a clean neutral background, no text, no watermark.',
  ].join(' ');
}

// Photo scene: user picks the duration (max 15s). Video scene: the result length matches the
// reference video, so we probe its duration with ffprobe (clamped to the model's 3-15s range).
async function resolveDuration(parsed: ParsedParams, ctx: BlockContext): Promise<number> {
  if (parsed.scene_mode === 'video' && parsed.scene_video && process.env.NODE_ENV !== 'test') {
    try {
      const probed = await ffprobeVideoDuration(parsed.scene_video);
      if (probed && probed > 0) return Math.max(3, Math.min(15, Math.ceil(probed)));
    } catch (err) {
      ctx.logger.warn('[scene-transfer] failed to probe scene_video duration; using fallback', err);
    }
    return Math.max(3, Math.min(15, parsed.duration ?? 10));
  }
  return Math.max(1, Math.min(15, parsed.duration ?? 5));
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
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'json',
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
