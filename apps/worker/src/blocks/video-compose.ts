import { spawn } from 'node:child_process';
import { createWriteStream, promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
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
  audio_source: z.string().optional(),
  audio_volume: z.number().min(0).max(4).optional(),
  audio_offset_sec: z.number().min(0).max(120).optional(),
  audio_fade_in_sec: z.number().min(0).max(30).optional(),
  audio_fade_out_sec: z.number().min(0).max(30).optional(),
  audio_loop: z.boolean().optional(),
  keep_original_audio: z.boolean().optional(),
});

type ComposeParams = z.infer<typeof paramsSchema>;

function videoUrlFromInput(input: unknown): string | undefined {
  if (typeof input === 'string') return input;
  if (input && typeof input === 'object') {
    const value = input as Record<string, unknown>;
    if (typeof value.url === 'string') return value.url;
    if (typeof value.resultVideo === 'string') return value.resultVideo;
  }
  return undefined;
}

function fallbackOutput(input: unknown): BlockOutput {
  if (input && typeof input === 'object') {
    const value = input as Record<string, unknown>;
    if (value.type === 'video' && typeof value.url === 'string') {
      return {
        type: 'video',
        url: value.url,
        metadata: {
          ...(typeof value.metadata === 'object' && value.metadata ? value.metadata : {}),
          composed: true,
          composeSkipped: true,
        },
      };
    }
    if (typeof value.resultVideo === 'string') {
      return { type: 'video', url: value.resultVideo, metadata: { composed: true, composeSkipped: true } };
    }
  }
  return {
    type: 'video',
    url: 'mock://video-compose/output.mp4',
    metadata: { composed: true, mockFallback: true },
  };
}

function pickAudioUrl(params: ComposeParams): string | undefined {
  if (typeof params.audio_source === 'string' && /^https?:\/\//.test(params.audio_source.trim())) {
    return params.audio_source.trim();
  }
  if (typeof params.music === 'string' && /^https?:\/\//.test(params.music.trim())) {
    return params.music.trim();
  }
  return undefined;
}

async function downloadToTemp(url: string, suggestedExt: string, logger: { warn: (msg: string, meta?: unknown) => void }): Promise<string> {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'allvision-compose-'));
  const ext = suggestedExt || path.extname(new URL(url).pathname) || '.bin';
  const filePath = path.join(tmpRoot, `download${ext}`);
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    logger.warn(`[video-compose] download failed: ${url} (status ${response.status})`);
    throw new Error(`COMPOSE_DOWNLOAD_FAILED: ${url}`);
  }
  await pipeline(Readable.fromWeb(response.body as never), createWriteStream(filePath));
  return filePath;
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', args, { windowsHide: true });
    const stderr: Buffer[] = [];
    child.stderr.on('data', (chunk) => stderr.push(Buffer.from(chunk)));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) return resolve();
      const error = new Error(`ffmpeg exited with code ${code}: ${Buffer.concat(stderr).toString('utf8').slice(-2000)}`);
      reject(error);
    });
  });
}

function buildAudioFilter(params: ComposeParams): string {
  const volume = typeof params.audio_volume === 'number' ? params.audio_volume : 0.7;
  const offset = typeof params.audio_offset_sec === 'number' ? Math.max(0, params.audio_offset_sec) : 0;
  const fadeIn = typeof params.audio_fade_in_sec === 'number' ? Math.max(0, params.audio_fade_in_sec) : 1;
  const fadeOut = typeof params.audio_fade_out_sec === 'number' ? Math.max(0, params.audio_fade_out_sec) : 1;
  const loop = params.audio_loop !== false;

  const stages: string[] = [];
  if (loop) {
    stages.push('aloop=loop=-1:size=2e9');
  }
  if (offset > 0) {
    const delayMs = Math.round(offset * 1000);
    stages.push(`adelay=${delayMs}|${delayMs}`);
  }
  if (volume !== 1) {
    stages.push(`volume=${volume.toFixed(3)}`);
  }
  if (fadeIn > 0) {
    stages.push(`afade=t=in:st=${offset.toFixed(3)}:d=${fadeIn.toFixed(3)}`);
  }
  if (fadeOut > 0) {
    stages.push(`afade=t=out:st=videoEndMinusFade:d=${fadeOut.toFixed(3)}`);
  }
  return stages.join(',');
}

async function probeDurationSec(filePath: string): Promise<number | undefined> {
  return new Promise((resolve) => {
    let settled = false;
    const child = spawn(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', filePath],
      { windowsHide: true },
    );
    const stdout: Buffer[] = [];
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      resolve(undefined);
    }, 5_000);
    child.stdout.on('data', (chunk) => stdout.push(Buffer.from(chunk)));
    child.on('error', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(undefined);
    });
    child.on('close', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        const parsed = JSON.parse(Buffer.concat(stdout).toString('utf8')) as { format?: { duration?: string } };
        const value = Number(parsed.format?.duration);
        resolve(Number.isFinite(value) ? value : undefined);
      } catch {
        resolve(undefined);
      }
    });
  });
}

async function composeWithAudio(input: {
  videoPath: string;
  audioPath: string;
  params: ComposeParams;
  outputPath: string;
}): Promise<void> {
  const videoDurationSec = await probeDurationSec(input.videoPath);
  const fadeOut = typeof input.params.audio_fade_out_sec === 'number' ? Math.max(0, input.params.audio_fade_out_sec) : 1;
  const filterRaw = buildAudioFilter(input.params);
  const filterResolved = videoDurationSec !== undefined && fadeOut > 0
    ? filterRaw.replace('videoEndMinusFade', Math.max(0, videoDurationSec - fadeOut).toFixed(3))
    : filterRaw.replace(/,?afade=t=out:[^,]*/, '');
  const keepOriginal = input.params.keep_original_audio === true;

  const filterComplex = keepOriginal
    ? `[1:a]${filterResolved}[bg];[0:a][bg]amix=inputs=2:duration=first:dropout_transition=2[aout]`
    : `[1:a]${filterResolved}[aout]`;

  const args = [
    '-y',
    '-i', input.videoPath,
    '-i', input.audioPath,
    '-filter_complex', filterComplex,
    '-map', '0:v',
    '-map', '[aout]',
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-shortest',
    '-movflags', '+faststart',
    input.outputPath,
  ];

  await runFfmpeg(args);
}

export const videoComposeBlock: BlockDefinition = {
  ...catalog,
  inputSchema: anyInputSchema,
  outputSchema: blockOutputSchema,
  paramsSchema,
  estimatedCostCoins: () => catalog.supportedModels[0]?.estimatedCostCoins ?? 0,
  async executor(rawParams, input, ctx) {
    const params = paramsSchema.parse(rawParams ?? {});
    await ctx.reportProgress(10);

    const videoUrl = videoUrlFromInput(input);
    const audioUrl = pickAudioUrl(params);

    if (!videoUrl || !audioUrl) {
      await ctx.reportProgress(100);
      return fallbackOutput(input);
    }

    let videoPath: string | undefined;
    let audioPath: string | undefined;
    let outputDir: string | undefined;
    try {
      await ctx.reportProgress(25);
      videoPath = await downloadToTemp(videoUrl, '.mp4', ctx.logger);
      audioPath = await downloadToTemp(audioUrl, '.mp3', ctx.logger);
      await ctx.reportProgress(50);

      outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'allvision-compose-out-'));
      const outputPath = path.join(outputDir, 'result.mp4');
      await composeWithAudio({ videoPath, audioPath, params, outputPath });
      await ctx.reportProgress(80);

      const buffer = await fs.readFile(outputPath);
      const key = `outputs/${ctx.providerContext.userId ?? 'unknown'}/${ctx.providerContext.projectId}/${ctx.providerContext.stepId}/result.mp4`;
      const { url } = await ctx.storage.upload({ key, body: buffer, contentType: 'video/mp4' });
      await ctx.reportProgress(100);

      return {
        type: 'video',
        url,
        metadata: {
          composed: true,
          audioOverlay: true,
          audioVolume: params.audio_volume ?? 0.7,
          audioOffsetSec: params.audio_offset_sec ?? 0,
          audioFadeInSec: params.audio_fade_in_sec ?? 1,
          audioFadeOutSec: params.audio_fade_out_sec ?? 1,
          audioLoop: params.audio_loop !== false,
          keepOriginalAudio: params.keep_original_audio === true,
        },
      } satisfies BlockOutput;
    } catch (err) {
      ctx.logger.error('[video-compose] audio overlay failed; returning original video', err);
      await ctx.reportProgress(100);
      return fallbackOutput(input);
    } finally {
      const cleanups: Array<Promise<unknown>> = [];
      if (videoPath) cleanups.push(fs.rm(path.dirname(videoPath), { recursive: true, force: true }));
      if (audioPath && audioPath !== videoPath) {
        cleanups.push(fs.rm(path.dirname(audioPath), { recursive: true, force: true }));
      }
      if (outputDir) cleanups.push(fs.rm(outputDir, { recursive: true, force: true }));
      await Promise.allSettled(cleanups);
    }
  },
};

