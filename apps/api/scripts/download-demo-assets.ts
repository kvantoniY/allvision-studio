/**
 * Скачивание/генерация демо-ассетов для MockAIProvider.
 * Запуск: npm run demo:download
 *
 * - photo-restore: 10 jpg с picsum.photos (1200x1200)
 * - photo-animate: 6 mp4 (1080x1080), генерируются ffmpeg'ом из picsum-картинок
 * - trends: 8 mp4 (1080x1920, вертикаль 9:16), аналогично
 * - fairy-tales: 3 JSON-шаблона коммитятся в репо, скрипт их не трогает
 *
 * Скрипт идемпотентный: существующие файлы пропускаются.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync, spawnSync } from 'node:child_process';
import https from 'node:https';
import { pipeline } from 'node:stream/promises';

const ROOT = path.resolve(__dirname, '..', 'demo-assets');
const PHOTO_RESTORE_DIR = path.join(ROOT, 'photo-restore');
const PHOTO_ANIMATE_DIR = path.join(ROOT, 'photo-animate');
const TRENDS_DIR = path.join(ROOT, 'trends');

const PHOTO_RESTORE_COUNT = 10;
const PHOTO_ANIMATE_COUNT = 6;
const TRENDS_COUNT = 8;

const c = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

function log(msg: string) {
  console.log(`${c.cyan}[demo]${c.reset} ${msg}`);
}
function ok(msg: string) {
  console.log(`${c.green}[demo]${c.reset} ${msg}`);
}
function skip(msg: string) {
  console.log(`${c.dim}[demo] ${msg}${c.reset}`);
}
function warn(msg: string) {
  console.warn(`${c.yellow}[demo]${c.reset} ${msg}`);
}
function err(msg: string) {
  console.error(`${c.red}[demo]${c.reset} ${msg}`);
}

async function ensureDir(dir: string) {
  await fs.promises.mkdir(dir, { recursive: true });
}

function followGet(url: string, depth = 0): Promise<NodeJS.ReadableStream> {
  if (depth > 5) throw new Error(`Too many redirects: ${url}`);
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          followGet(res.headers.location, depth + 1).then(resolve, reject);
          return;
        }
        if (status !== 200) {
          reject(new Error(`HTTP ${status} for ${url}`));
          return;
        }
        resolve(res);
      })
      .on('error', reject);
  });
}

async function downloadFile(url: string, dest: string) {
  const stream = await followGet(url);
  await pipeline(stream, fs.createWriteStream(dest));
}

function hasFfmpeg(): boolean {
  try {
    const result = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    return result.status === 0;
  } catch {
    return false;
  }
}

async function downloadPhotoRestore() {
  await ensureDir(PHOTO_RESTORE_DIR);
  for (let i = 1; i <= PHOTO_RESTORE_COUNT; i++) {
    const dest = path.join(PHOTO_RESTORE_DIR, `restore-${i}.jpg`);
    if (fs.existsSync(dest)) {
      skip(`photo-restore/restore-${i}.jpg уже существует`);
      continue;
    }
    const url = `https://picsum.photos/seed/restore-${i}/1200/1200`;
    log(`скачиваю ${url}`);
    try {
      await downloadFile(url, dest);
      ok(`photo-restore/restore-${i}.jpg`);
    } catch (e) {
      err(`не удалось скачать ${url}: ${(e as Error).message}`);
    }
  }
}

async function generateVideo(stillUrl: string, dest: string, w: number, h: number) {
  // Скачиваем картинку во временный файл, делаем ken-burns mp4 на 5 секунд.
  const tmp = `${dest}.tmp.jpg`;
  await downloadFile(stillUrl, tmp);
  try {
    execSync(
      `ffmpeg -y -loglevel error -loop 1 -i "${tmp}" -t 5 -r 30 ` +
        `-vf "scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},zoompan=z='zoom+0.0015':d=150:s=${w}x${h}" ` +
        `-c:v libx264 -pix_fmt yuv420p -movflags +faststart "${dest}"`,
      { stdio: 'pipe' },
    );
  } finally {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  }
}

async function generateAnimateVideos(ffmpegAvailable: boolean) {
  await ensureDir(PHOTO_ANIMATE_DIR);
  if (!ffmpegAvailable) {
    warn('ffmpeg не найден — пропускаю генерацию photo-animate видео');
    return;
  }
  for (let i = 1; i <= PHOTO_ANIMATE_COUNT; i++) {
    const dest = path.join(PHOTO_ANIMATE_DIR, `animate-${i}.mp4`);
    if (fs.existsSync(dest)) {
      skip(`photo-animate/animate-${i}.mp4 уже существует`);
      continue;
    }
    const stillUrl = `https://picsum.photos/seed/animate-${i}/1080/1080`;
    log(`генерирую animate-${i}.mp4 из ${stillUrl}`);
    try {
      await generateVideo(stillUrl, dest, 1080, 1080);
      ok(`photo-animate/animate-${i}.mp4`);
    } catch (e) {
      err(`animate-${i}.mp4 не сгенерирован: ${(e as Error).message}`);
    }
  }
}

async function generateTrendVideos(ffmpegAvailable: boolean) {
  await ensureDir(TRENDS_DIR);
  if (!ffmpegAvailable) {
    warn('ffmpeg не найден — пропускаю генерацию trends видео');
    return;
  }
  for (let i = 1; i <= TRENDS_COUNT; i++) {
    const dest = path.join(TRENDS_DIR, `trend-${i}.mp4`);
    if (fs.existsSync(dest)) {
      skip(`trends/trend-${i}.mp4 уже существует`);
      continue;
    }
    const stillUrl = `https://picsum.photos/seed/trend-${i}/1080/1920`;
    log(`генерирую trend-${i}.mp4 из ${stillUrl}`);
    try {
      await generateVideo(stillUrl, dest, 1080, 1920);
      ok(`trends/trend-${i}.mp4`);
    } catch (e) {
      err(`trend-${i}.mp4 не сгенерирован: ${(e as Error).message}`);
    }
  }
}

function printFfmpegWarning() {
  console.log('');
  warn('ffmpeg не установлен — видео-демо нужно положить вручную:');
  console.log(
    `  - apps/api/demo-assets/photo-animate/animate-1.mp4 ... animate-${PHOTO_ANIMATE_COUNT}.mp4 (1080x1080, 5-10 сек)`,
  );
  console.log(
    `  - apps/api/demo-assets/trends/trend-1.mp4 ... trend-${TRENDS_COUNT}.mp4 (1080x1920, 5-10 сек)`,
  );
  console.log('');
  console.log('  Бесплатные источники:');
  console.log('    https://www.pexels.com/search/videos/portrait/');
  console.log('    https://mixkit.co/free-stock-video/');
  console.log('    https://pixabay.com/videos/');
  console.log('');
}

async function main() {
  await ensureDir(ROOT);

  log(`Скачиваю фото в ${PHOTO_RESTORE_DIR}`);
  await downloadPhotoRestore();

  const ffmpegAvailable = hasFfmpeg();
  if (ffmpegAvailable) {
    log('ffmpeg найден — генерирую видео-плейсхолдеры');
  }

  await generateAnimateVideos(ffmpegAvailable);
  await generateTrendVideos(ffmpegAvailable);

  if (!ffmpegAvailable) printFfmpegWarning();

  ok('Готово.');
}

main().catch((e) => {
  err((e as Error).stack ?? (e as Error).message);
  process.exit(1);
});
