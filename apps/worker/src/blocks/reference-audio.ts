import { spawn } from 'node:child_process';
import { createWriteStream, promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { resolveWorkspacePath } from '../utils/paths';
import type { BlockContext } from './types';

const UPLOADS_DIR = resolveWorkspacePath(process.env.UPLOADS_DIR ?? './uploads');

/**
 * Гарантирует, что у сгенерированного видео есть звук: если результат вышел «немым»
 * (DreamActor/Wan Motion/Seedance с generate_audio=false звука не отдают), в него муксится
 * аудиодорожка референс-видео (та самая трендовая музыка). Если у результата уже есть звук
 * (Kling O3 keep_audio, Kling Motion keep_original_sound) — ничего не трогаем.
 * Любая ошибка (сеть, ffmpeg, отсутствие аудио в референсе) НЕ роняет генерацию — возвращается
 * исходный URL без звука.
 */
export async function muxReferenceAudioIfSilent(input: {
  resultUrl: string;
  referenceVideoUrl: string;
  ctx: BlockContext;
}): Promise<string> {
  const { resultUrl, referenceVideoUrl, ctx } = input;
  if (process.env.NODE_ENV === 'test') return resultUrl;
  if (!/^https?:\/\//.test(resultUrl) && !resultUrl.startsWith('/static/')) return resultUrl;
  let tmpRoot: string | undefined;
  try {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'allvision-refaudio-'));
    const resultPath = await materialize(resultUrl, path.join(tmpRoot, 'result.mp4'));
    if (await hasAudioStream(resultPath)) return resultUrl;
    const referencePath = await materialize(referenceVideoUrl, path.join(tmpRoot, 'reference.mp4'));
    if (!(await hasAudioStream(referencePath))) return resultUrl;

    const outputPath = path.join(tmpRoot, 'muxed.mp4');
    await runFfmpeg([
      '-y',
      '-i', resultPath,
      '-i', referencePath,
      '-map', '0:v:0',
      '-map', '1:a:0',
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-shortest',
      '-movflags', '+faststart',
      outputPath,
    ]);
    const buffer = await fs.readFile(outputPath);
    const key = `outputs/${ctx.providerContext.userId ?? 'unknown'}/${ctx.providerContext.projectId}/${ctx.providerContext.stepId}-audio/result.mp4`;
    const { url } = await ctx.storage.upload({ key, body: buffer, contentType: 'video/mp4' });
    ctx.logger.info(`[reference-audio] muxed reference audio into result (${buffer.length}b)`);
    return url;
  } catch (err) {
    ctx.logger.warn('[reference-audio] failed to mux reference audio; keeping silent result', err);
    return resultUrl;
  } finally {
    if (tmpRoot) await fs.rm(tmpRoot, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** Наш /static-URL читается напрямую с диска (loopback на собственный домен из контейнера не работает). */
function localStaticKey(url: string): string | undefined {
  const clean = (k: string) => decodeURIComponent(k.split('?')[0].replace(/^\/+/, ''));
  const base = (process.env.PUBLIC_API_URL ?? '').replace(/\/+$/, '');
  if (url.startsWith('/static/')) return clean(url.slice('/static/'.length));
  if (base && url.startsWith(`${base}/static/`)) return clean(url.slice(base.length + '/static/'.length));
  return undefined;
}

async function materialize(url: string, targetPath: string): Promise<string> {
  const key = localStaticKey(url);
  if (key) {
    await fs.copyFile(path.join(UPLOADS_DIR, ...key.split('/')), targetPath);
    return targetPath;
  }
  const response = await fetch(url);
  if (!response.ok || !response.body) throw new Error(`download failed: ${url} (status ${response.status})`);
  await pipeline(Readable.fromWeb(response.body as never), createWriteStream(targetPath));
  return targetPath;
}

function hasAudioStream(filePath: string): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const child = spawn(
      'ffprobe',
      ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=index', '-of', 'json', filePath],
      { windowsHide: true },
    );
    const stdout: Buffer[] = [];
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      resolve(false);
    }, 10_000);
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    child.stdout.on('data', (chunk) => stdout.push(Buffer.from(chunk)));
    child.on('error', () => finish(false));
    child.on('close', () => {
      try {
        const parsed = JSON.parse(Buffer.concat(stdout).toString('utf8')) as { streams?: unknown[] };
        finish(Array.isArray(parsed.streams) && parsed.streams.length > 0);
      } catch {
        finish(false);
      }
    });
  });
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', args, { windowsHide: true });
    const stderr: Buffer[] = [];
    child.stderr.on('data', (chunk) => stderr.push(Buffer.from(chunk)));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) return resolve();
      reject(new Error(`ffmpeg exited with code ${code}: ${Buffer.concat(stderr).toString('utf8').slice(-1500)}`));
    });
  });
}
