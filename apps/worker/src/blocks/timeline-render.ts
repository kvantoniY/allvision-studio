import { spawn } from 'node:child_process';
import { createWriteStream, promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import sharp from 'sharp';
import { z } from 'zod';
import {
  TIMELINE_LIMITS,
  getBlockCatalogItem,
  parseTimeline,
  renderOverlaySvg,
  sceneDurationSec,
  timelineTimings,
  validateTimeline,
  type Timeline,
  type TimelineScene,
} from '@allvision/shared';
import { resolveWorkspacePath } from '../utils/paths';
import type { BlockContext, BlockDefinition, BlockOutput } from './types';
import { anyInputSchema, blockOutputSchema } from './utils';
import {
  planFinal,
  planScene,
  timelineRenderShape,
  type EncodeQuality,
  type ScenePlanInput,
  type SceneOverlayFile,
} from './timeline-plan';

const catalog = getBlockCatalogItem('timeline-render');
if (!catalog) throw new Error('Block catalog metadata missing: timeline-render');

const UPLOADS_DIR = resolveWorkspacePath(process.env.UPLOADS_DIR ?? './uploads');

const paramsSchema = z.object({
  timeline: z.unknown(),
  clips: z.unknown().optional(),
  voiceover: z.unknown().optional(),
  music: z.unknown().optional(),
  photo_motion: z.boolean().optional(),
  quality: z.enum(['fast', 'balanced', 'high']).optional(),
  max_scenes: z.number().int().min(1).max(TIMELINE_LIMITS.maxScenes).optional(),
});

/**
 * Плейсхолдеры вида {{step_1.output}} раскрываются в объект результата шага, а не в строку.
 * Ссылка на файл сцены при этом приезжает как { type, url }, поэтому разворачиваем её здесь —
 * иначе автору шаблона пришлось бы помнить про `.url` в каждой сцене.
 */
function unwrapUrl(value: unknown): unknown {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    if (typeof record.url === 'string') return record.url;
    if (typeof record.resultVideo === 'string') return record.resultVideo;
    if (typeof record.resultImage === 'string') return record.resultImage;
  }
  return value;
}

/**
 * Разворачивает служебную сцену-пачку в обычные сцены.
 *
 * Шаблон не может перечислить сцены заранее: их столько, сколько фотографий загрузил
 * пользователь. Поэтому автор шаблона пишет одну сцену вида
 * { source: { kind: 'batch', urls: '{{step_1.output.metadata.clips}}' } }, а её оформление
 * (переход, длительность, титр) наследуют все развёрнутые сцены.
 */
function expandBatchScenes(scenes: unknown[], clips?: unknown): unknown[] {
  const result: unknown[] = [];
  for (const scene of scenes) {
    if (!scene || typeof scene !== 'object') continue;
    const record = scene as Record<string, unknown>;
    const source = record.source as Record<string, unknown> | undefined;
    if (!source || source.kind !== 'batch') {
      result.push(scene);
      continue;
    }
    const raw = source.urls ?? source.url ?? clips;
    const urls = (Array.isArray(raw) ? raw : [])
      .map((item) => unwrapUrl(item))
      .filter((item): item is string => typeof item === 'string' && item.length > 0 && !item.includes('{{'));
    urls.forEach((url, index) => {
      result.push({
        ...record,
        id: `${record.id ?? 'batch'}-${index + 1}`,
        source: { kind: source.itemKind === 'image' ? 'image' : 'video', url },
      });
    });
  }
  return result;
}

/** Текст, который пользователь не заполнил (или неразрешённый плейсхолдер). */
function isBlankText(value: unknown): boolean {
  return typeof value !== 'string' || value.trim().length === 0 || value.includes('{{');
}

/**
 * Титры с незаполненным текстом выбрасываются.
 *
 * В шаблоне поля заголовка необязательные: пользователь может ничего не вписать, и тогда
 * в JSON приезжает пустая строка. Схема требует непустой текст, так что без этой чистки
 * незаполненный заголовок ронял бы весь ролик, а не просто исчезал бы с экрана.
 */
function cleanOverlays(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  const result: Record<string, unknown>[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const overlay = item as Record<string, unknown>;
    if (isBlankText(overlay.text)) continue;
    const subtext = isBlankText(overlay.subtext) ? undefined : overlay.subtext;
    result.push({ ...overlay, ...(subtext ? { subtext } : { subtext: undefined }) });
  }
  return result;
}

/** Дорожка без файла (пользователь не выбрал музыку) не должна ронять разбор таймлайна. */
function usableTrack(track: unknown, fallbackUrl?: unknown): unknown {
  const url = typeof fallbackUrl === 'string' && fallbackUrl.trim().length > 0
    ? fallbackUrl.trim()
    : track && typeof track === 'object'
      ? (track as Record<string, unknown>).url
      : undefined;
  if (typeof url !== 'string' || url.trim().length === 0 || url.includes('{{')) return undefined;
  const base = track && typeof track === 'object' ? (track as Record<string, unknown>) : {};
  return { ...base, url: url.trim() };
}

export function normaliseTimelineInput(raw: unknown, params: { clips?: unknown; music?: unknown; voiceover?: unknown } = {}): unknown {
  const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!value || typeof value !== 'object') return value;
  const timeline = value as Record<string, unknown>;
  const scenes = expandBatchScenes(Array.isArray(timeline.scenes) ? timeline.scenes : [], params.clips);
  const music = usableTrack(timeline.music, params.music);
  const voiceover = usableTrack(timeline.voiceover, params.voiceover);
  return {
    ...timeline,
    ...(music ? { music } : { music: undefined }),
    ...(voiceover ? { voiceover } : { voiceover: undefined }),
    scenes: scenes
      .map((scene) => {
        if (!scene || typeof scene !== 'object') return scene;
        const record = scene as Record<string, unknown>;
        const source = record.source && typeof record.source === 'object'
          ? { ...(record.source as Record<string, unknown>), url: unwrapUrl((record.source as Record<string, unknown>).url) }
          : record.source;
        return { ...record, source, overlays: cleanOverlays(record.overlays) };
      })
      // Шаблон может содержать условные сцены: если шаг не выполнялся, плейсхолдер
      // остаётся неразрешённым. Такую сцену тихо пропускаем, а не роняем весь ролик.
      .filter((scene) => {
        if (!scene || typeof scene !== 'object') return false;
        const record = scene as Record<string, unknown>;
        const source = record.source as Record<string, unknown> | undefined;
        if (!source) return false;
        if (source.kind === 'color') {
          // Заливка без титра — просто чёрный кадр; показывать его незачем.
          return Array.isArray(record.overlays) && record.overlays.length > 0;
        }
        const url = source.url;
        return typeof url === 'string' && url.length > 0 && !url.includes('{{');
      }),
  };
}

/** Наш /static-URL читается с диска: loopback на собственный домен из контейнера не работает. */
function localStaticKey(url: string): string | undefined {
  const clean = (key: string) => decodeURIComponent(key.split('?')[0].replace(/^\/+/, ''));
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
  if (!response.ok || !response.body) {
    throw new Error(`TIMELINE_SOURCE_DOWNLOAD_FAILED: ${url} (status ${response.status})`);
  }
  await pipeline(Readable.fromWeb(response.body as never), createWriteStream(targetPath));
  return targetPath;
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', args, { windowsHide: true });
    const stderr: Buffer[] = [];
    child.stderr.on('data', (chunk) => stderr.push(Buffer.from(chunk)));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) return resolve();
      reject(new Error(`ffmpeg exited with code ${code}: ${Buffer.concat(stderr).toString('utf8').slice(-2000)}`));
    });
  });
}

type ProbeResult = { durationSec?: number; hasAudio: boolean };

function probe(filePath: string): Promise<ProbeResult> {
  return new Promise((resolve) => {
    let settled = false;
    const child = spawn(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type', '-of', 'json', filePath],
      { windowsHide: true },
    );
    const stdout: Buffer[] = [];
    const finish = (value: ProbeResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish({ hasAudio: false });
    }, 15_000);
    child.stdout.on('data', (chunk) => stdout.push(Buffer.from(chunk)));
    child.on('error', () => finish({ hasAudio: false }));
    child.on('close', () => {
      try {
        const parsed = JSON.parse(Buffer.concat(stdout).toString('utf8')) as {
          format?: { duration?: string };
          streams?: Array<{ codec_type?: string }>;
        };
        const duration = Number(parsed.format?.duration);
        finish({
          durationSec: Number.isFinite(duration) ? duration : undefined,
          hasAudio: (parsed.streams ?? []).some((stream) => stream.codec_type === 'audio'),
        });
      } catch {
        finish({ hasAudio: false });
      }
    });
  });
}

/**
 * Видео-сцена без явной обрезки должна длиться столько, сколько длится файл.
 * Без этого шага сцена схлопнулась бы до длительности по умолчанию, и от готового
 * ролика Kling осталось бы четыре секунды из десяти.
 */
function withProbedDuration(scene: TimelineScene, probed: ProbeResult | undefined): TimelineScene {
  if (scene.source.kind !== 'video' || !probed?.durationSec) return scene;
  const hasExplicitTrim = typeof scene.trimEndSec === 'number' && scene.trimEndSec > (scene.trimStartSec ?? 0);
  if (hasExplicitTrim || typeof scene.durationSec === 'number') return scene;
  const available = Math.max(0, probed.durationSec - (scene.trimStartSec ?? 0));
  return {
    ...scene,
    durationSec: Math.min(TIMELINE_LIMITS.maxSceneDurationSec, Math.max(TIMELINE_LIMITS.minSceneDurationSec, available)),
  };
}

async function renderOverlayFiles(input: {
  timeline: Timeline;
  width: number;
  height: number;
  dir: string;
  logger: BlockContext['logger'];
}): Promise<Map<number, SceneOverlayFile[]>> {
  const { timeline, width, height, dir, logger } = input;
  const byScene = new Map<number, SceneOverlayFile[]>();
  const timings = timelineTimings(timeline);

  for (const timing of timings) {
    const files: SceneOverlayFile[] = [];
    for (const [overlayIndex, overlay] of timing.scene.overlays.entries()) {
      const start = Math.max(0, overlay.startSec ?? 0);
      const end = Math.min(timing.durationSec, overlay.endSec ?? timing.durationSec);
      if (end <= start) continue;
      const filePath = path.join(dir, `overlay-${timing.index}-${overlayIndex}.png`);
      try {
        const svg = renderOverlaySvg(overlay, { width, height });
        await sharp(Buffer.from(svg)).png().toFile(filePath);
        files.push({ path: filePath, startSec: start, endSec: end });
      } catch (err) {
        // Титр — украшение. Потерять его неприятно, потерять оплаченный ролик — хуже.
        logger.warn(`[timeline-render] overlay render failed (scene ${timing.scene.id})`, err);
      }
    }
    byScene.set(timing.index, files);
  }
  return byScene;
}

export const timelineRenderBlock: BlockDefinition = {
  ...catalog,
  inputSchema: anyInputSchema,
  outputSchema: blockOutputSchema,
  paramsSchema,
  estimatedCostCoins: () => 0,
  async executor(rawParams, _input, ctx) {
    const params = paramsSchema.parse(rawParams ?? {});
    const timeline = parseTimeline(normaliseTimelineInput(params.timeline, {
      clips: params.clips,
      music: params.music,
      voiceover: params.voiceover,
    }));

    const issues = validateTimeline(timeline, { maxScenes: params.max_scenes });
    if (issues.length > 0) {
      throw new Error(`TIMELINE_INVALID: ${issues.map((issue) => issue.message).join(' ')}`);
    }

    await ctx.reportProgress(3);

    const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'allvision-timeline-'));
    try {
      // 1. Складываем исходники на диск и уточняем длительности.
      const sources: ScenePlanInput[] = [];
      const scenes: TimelineScene[] = [];
      for (const [index, scene] of timeline.scenes.entries()) {
        if (scene.source.kind === 'color') {
          sources.push({ kind: 'color', color: scene.source.color ?? '#000000' });
          scenes.push(scene);
          continue;
        }
        const url = scene.source.url as string;
        const ext = path.extname(new URL(url, 'https://placeholder.local').pathname) || (scene.source.kind === 'video' ? '.mp4' : '.jpg');
        const filePath = await materialize(url, path.join(workDir, `source-${index}${ext}`));
        if (scene.source.kind === 'video') {
          const probed = await probe(filePath);
          scenes.push(withProbedDuration(scene, probed));
          sources.push({ kind: 'video', path: filePath, trimStartSec: scene.trimStartSec ?? 0, hasAudio: probed.hasAudio });
        } else {
          scenes.push(scene);
          sources.push({ kind: 'image', path: filePath });
        }
      }

      const resolved: Timeline = { ...timeline, scenes };
      const { width, height, totalDurationSec } = timelineRenderShape(resolved);
      await ctx.reportProgress(10);

      // 2. Титры в PNG — одним и тем же SVG, что рисует предпросмотр.
      const overlaysByScene = await renderOverlayFiles({ timeline: resolved, width, height, dir: workDir, logger: ctx.logger });
      await ctx.reportProgress(15);

      // 3. Нормализуем каждую сцену: приводим кадр, обрезаем, выжигаем титры.
      const quality: EncodeQuality = params.quality ?? 'balanced';
      const photoMotion = params.photo_motion !== false;
      const scenePaths: string[] = [];
      for (const [index, scene] of resolved.scenes.entries()) {
        const outputName = path.join(workDir, `scene-${index}.mp4`);
        const plan = planScene({
          scene,
          source: sources[index],
          overlays: overlaysByScene.get(index) ?? [],
          width,
          height,
          index,
          outputName,
          photoMotion,
          quality,
        });
        await ctx.providerContext.reportStage?.(`Готовим сцену ${index + 1} из ${resolved.scenes.length}`);
        await runFfmpeg(plan.args);
        scenePaths.push(outputName);
        // 15..75% — самая долгая часть, поэтому прогресс идёт по сценам.
        await ctx.reportProgress(15 + Math.round(((index + 1) / resolved.scenes.length) * 60));
      }

      // 4. Музыка и озвучка.
      const musicPath = resolved.music
        ? await materialize(resolved.music.url, path.join(workDir, 'music.audio'))
        : undefined;
      const voiceoverPath = resolved.voiceover
        ? await materialize(resolved.voiceover.url, path.join(workDir, 'voiceover.audio'))
        : undefined;
      await ctx.reportProgress(80);

      // 5. Склейка с переходами и миксом звука.
      const outputPath = path.join(workDir, 'result.mp4');
      await ctx.providerContext.reportStage?.('Склеиваем ролик');
      const final = planFinal({ timeline: resolved, scenePaths, musicPath, voiceoverPath, outputPath, quality });
      await runFfmpeg(final.args);
      await ctx.reportProgress(92);

      const buffer = await fs.readFile(outputPath);
      const key = `outputs/${ctx.providerContext.userId ?? 'unknown'}/${ctx.providerContext.projectId}/${ctx.providerContext.stepId}/result.mp4`;
      const { url } = await ctx.storage.upload({ key, body: buffer, contentType: 'video/mp4' });
      await ctx.reportProgress(100);

      ctx.logger.info(
        `[timeline-render] rendered ${resolved.scenes.length} scenes, ${totalDurationSec.toFixed(1)}s, ${buffer.length}b`,
      );

      return {
        type: 'video',
        url,
        metadata: {
          composed: true,
          sceneCount: resolved.scenes.length,
          durationSec: totalDurationSec,
          aspect: resolved.aspect,
          width,
          height,
          hasMusic: Boolean(musicPath),
          hasVoiceover: Boolean(voiceoverPath),
          // Каждая сцена доступна отдельным файлом: пользователь может забрать
          // понравившийся кусок, не пересобирая ролик.
          scenes: resolved.scenes.map((scene, index) => ({
            id: scene.id,
            durationSec: sceneDurationSec(scene),
            sourceUrl: scene.source.url ?? null,
            index,
          })),
        },
      } satisfies BlockOutput;
    } finally {
      await fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
  },
};
