import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import sharp from 'sharp';
import { getStorageProvider } from '../providers';
import { HttpError } from '../utils/http-error';

const IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const VIDEO_MIME = new Set(['video/mp4', 'video/webm', 'video/quicktime']);
const AUDIO_MIME = new Set(['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/ogg']);

const MAX_VIDEO_DURATION_SEC = 10;
const MAX_VIDEO_FILE_SIZE = 15 * 1024 * 1024;
const MAX_IMAGE_FILE_SIZE = 10 * 1024 * 1024;
const MAX_AUDIO_FILE_SIZE = 20 * 1024 * 1024;
export const VIDEO_TRANSCODE_FILTER = 'scale=w=1280:h=720:force_original_aspect_ratio=decrease:force_divisible_by=2';

export type ProcessedMediaAsset = {
  storageKey: string;
  publicUrl: string;
  thumbnailKey?: string;
  durationSec?: number;
  width?: number;
  height?: number;
  frameCount?: number;
  fileSize: number;
  mimeType: string;
};

type ProbeResult = {
  durationSec?: number;
  width?: number;
  height?: number;
  frameCount?: number;
};

export async function processAndUploadMediaAsset(params: {
  kind: string;
  file: Express.Multer.File;
}): Promise<ProcessedMediaAsset> {
  const { file, kind } = params;
  if (VIDEO_MIME.has(file.mimetype)) return processVideo(kind, file);
  if (IMAGE_MIME.has(file.mimetype)) return processImage(kind, file);
  if (AUDIO_MIME.has(file.mimetype)) return processAudio(kind, file);
  throw new HttpError(400, 'UNSUPPORTED_FORMAT', 'Unsupported media asset format');
}

function extFor(contentType: string) {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/quicktime': 'mov',
    'audio/mpeg': 'mp3',
    'audio/mp3': 'mp3',
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
    'audio/ogg': 'ogg',
  };
  return map[contentType] ?? 'bin';
}

async function processImage(kind: string, file: Express.Multer.File): Promise<ProcessedMediaAsset> {
  if (file.size > MAX_IMAGE_FILE_SIZE) {
    throw new HttpError(413, 'FILE_TOO_LARGE', 'Image must be no larger than 10 MB');
  }
  const metadata = await sharp(file.buffer).metadata().catch(() => undefined);
  if (!metadata?.width || !metadata.height) {
    throw new HttpError(400, 'INVALID_IMAGE', 'Image file is invalid');
  }
  const processed = await sharp(file.buffer)
    .rotate()
    .resize(2048, 2048, { fit: 'inside', withoutEnlargement: true })
    .toBuffer();
  const key = `media-assets/${safeKind(kind)}/${crypto.randomUUID()}.${extFor(file.mimetype)}`;
  const uploaded = await getStorageProvider().upload({ key, body: processed, contentType: file.mimetype });
  return {
    storageKey: uploaded.key,
    publicUrl: uploaded.url,
    width: metadata.width,
    height: metadata.height,
    fileSize: processed.length,
    mimeType: file.mimetype,
  };
}

async function processAudio(kind: string, file: Express.Multer.File): Promise<ProcessedMediaAsset> {
  if (file.size > MAX_AUDIO_FILE_SIZE) {
    throw new HttpError(413, 'FILE_TOO_LARGE', 'Audio file is too large');
  }
  const key = `media-assets/${safeKind(kind)}/${crypto.randomUUID()}.${extFor(file.mimetype)}`;
  const uploaded = await getStorageProvider().upload({ key, body: file.buffer, contentType: file.mimetype });
  return {
    storageKey: uploaded.key,
    publicUrl: uploaded.url,
    fileSize: file.size,
    mimeType: file.mimetype,
  };
}

async function processVideo(kind: string, file: Express.Multer.File): Promise<ProcessedMediaAsset> {
  if (file.size > MAX_VIDEO_FILE_SIZE) {
    throw new HttpError(413, 'FILE_TOO_LARGE', 'Видео должно быть не длиннее 10 секунд и не тяжелее 15 МБ');
  }

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'allvision-media-'));
  const inputPath = path.join(dir, `input.${extFor(file.mimetype)}`);
  const outputPath = path.join(dir, 'output.mp4');
  const thumbPath = path.join(dir, 'thumbnail.jpg');

  try {
    await fs.writeFile(inputPath, file.buffer);
    const probe = await ffprobe(inputPath);
    if (!probe.durationSec || probe.durationSec > MAX_VIDEO_DURATION_SEC) {
      throw new HttpError(400, 'VIDEO_TOO_LONG', 'Видео должно быть не длиннее 10 секунд');
    }

    await runCommand('ffmpeg', [
      '-y',
      '-i',
      inputPath,
      '-t',
      String(MAX_VIDEO_DURATION_SEC),
      '-vf',
      VIDEO_TRANSCODE_FILTER,
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      outputPath,
    ]);

    const output = await fs.readFile(outputPath);
    if (output.length > MAX_VIDEO_FILE_SIZE) {
      throw new HttpError(413, 'FILE_TOO_LARGE', 'Видео после обработки должно быть не тяжелее 15 МБ');
    }

    const midpoint = Math.max(0.1, (probe.durationSec ?? 1) / 2);
    await runCommand('ffmpeg', [
      '-y',
      '-ss',
      String(midpoint),
      '-i',
      inputPath,
      '-frames:v',
      '1',
      '-vf',
      'scale=w=480:h=270:force_original_aspect_ratio=decrease,pad=480:270:(ow-iw)/2:(oh-ih)/2:black',
      '-q:v',
      '3',
      thumbPath,
    ]);

    const thumbnail = await fs.readFile(thumbPath);
    const videoKey = `media-assets/${safeKind(kind)}/${crypto.randomUUID()}.mp4`;
    const thumbKey = `media-assets/thumbnails/${crypto.randomUUID()}.jpg`;
    const [videoUpload, thumbUpload] = await Promise.all([
      getStorageProvider().upload({ key: videoKey, body: output, contentType: 'video/mp4' }),
      getStorageProvider().upload({ key: thumbKey, body: thumbnail, contentType: 'image/jpeg' }),
    ]);

    return {
      storageKey: videoUpload.key,
      publicUrl: videoUpload.url,
      thumbnailKey: thumbUpload.key,
      durationSec: probe.durationSec,
      width: probe.width,
      height: probe.height,
      frameCount: probe.frameCount,
      fileSize: output.length,
      mimeType: 'video/mp4',
    };
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function ffprobe(filePath: string): Promise<ProbeResult> {
  const output = await runCommand('ffprobe', [
    '-v',
    'error',
    '-print_format',
    'json',
    '-show_format',
    '-show_streams',
    '-count_frames',
    filePath,
  ]);
  const parsed = JSON.parse(output) as {
    format?: { duration?: string };
    streams?: Array<Record<string, unknown>>;
  };
  const video = parsed.streams?.find((stream) => stream.codec_type === 'video');
  const duration = Number(parsed.format?.duration ?? video?.duration);
  const width = typeof video?.width === 'number' ? video.width : undefined;
  const height = typeof video?.height === 'number' ? video.height : undefined;
  const frameCountRaw = video?.nb_read_frames ?? video?.nb_frames;
  const frameCount = typeof frameCountRaw === 'string' && Number.isFinite(Number(frameCountRaw))
    ? Number(frameCountRaw)
    : undefined;
  return {
    durationSec: Number.isFinite(duration) ? duration : undefined,
    width,
    height,
    frameCount,
  };
}

function runCommand(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on('data', (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr.on('data', (chunk) => stderr.push(Buffer.from(chunk)));
    child.on('error', () => reject(new HttpError(503, 'FFMPEG_UNAVAILABLE', 'FFmpeg is not available on this server')));
    child.on('close', (code) => {
      if (code === 0) {
        resolve(Buffer.concat(stdout).toString('utf8'));
        return;
      }
      reject(new HttpError(400, 'MEDIA_PROCESSING_FAILED', Buffer.concat(stderr).toString('utf8') || 'Media processing failed'));
    });
  });
}

function safeKind(kind: string) {
  return kind.replace(/[^a-zA-Z0-9_-]/g, '_') || 'asset';
}
