import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  AIJobHandle,
  AIJobStatus,
  AIProvider,
  GenerationKind,
  NSFWCheckResult,
  StorageProvider,
} from '@allvision/shared';

type ResultType = 'text' | 'audio' | 'image' | 'video';

interface MockJobState {
  startedAt: number;
  durationMs: number;
  kind: GenerationKind;
  mode: string;
  resultType: ResultType;
  resultDemoPath?: string;
  cachedResultUrl?: string;
}

export interface MockAIProviderOptions {
  storageProvider: StorageProvider;
  demoAssetsRoot?: string;
  minDurationMs?: number;
  maxDurationMs?: number;
}

const VIDEO_EXTS = new Set(['.mp4', '.webm', '.mov']);
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

function inferContentType(ext: string, fallback: ResultType): string {
  const e = ext.toLowerCase();
  if (e === '.jpg' || e === '.jpeg') return 'image/jpeg';
  if (e === '.png') return 'image/png';
  if (e === '.webp') return 'image/webp';
  if (e === '.mp4') return 'video/mp4';
  if (e === '.webm') return 'video/webm';
  if (e === '.mov') return 'video/quicktime';
  return fallback === 'image' ? 'image/jpeg' : fallback === 'audio' ? 'audio/mpeg' : 'video/mp4';
}

function listAssets(dir: string, expected: ResultType): string[] {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(dir, entry.name))
    .filter((filePath) => {
      const ext = path.extname(filePath).toLowerCase();
      return expected === 'image' ? IMAGE_EXTS.has(ext) : VIDEO_EXTS.has(ext);
    });
}

function resultTypeForKind(kind: GenerationKind): ResultType {
  if (kind === 'TEXT') return 'text';
  if (kind === 'AUDIO') return 'audio';
  if (kind === 'IMAGE') return 'image';
  return 'video';
}

export class MockAIProvider implements AIProvider {
  name = 'mock';

  private jobs = new Map<string, MockJobState>();
  private demoAssetsRoot: string;
  private minDurationMs: number;
  private maxDurationMs: number;

  constructor(private options: MockAIProviderOptions) {
    this.demoAssetsRoot = path.resolve(
      options.demoAssetsRoot ?? process.env.DEMO_ASSETS_ROOT ?? './apps/api/demo-assets',
    );
    this.minDurationMs = options.minDurationMs ?? 5000;
    this.maxDurationMs = options.maxDurationMs ?? 15000;
  }

  async createGeneration(params: {
    generationId: string;
    kind: GenerationKind;
    mode: string;
  }): Promise<AIJobHandle> {
    const providerJobId = crypto.randomUUID();
    const span = this.maxDurationMs - this.minDurationMs;
    const durationMs = this.minDurationMs + Math.floor(Math.random() * Math.max(1, span));
    const resultType = resultTypeForKind(params.kind);
    const resultDemoPath = this.pickDemoAsset(params.mode, resultType);

    this.jobs.set(providerJobId, {
      startedAt: Date.now(),
      durationMs,
      kind: params.kind,
      mode: params.mode,
      resultType,
      resultDemoPath,
    });

    return { providerJobId, metadata: { generationId: params.generationId } };
  }

  private pickDemoAsset(mode: string, resultType: ResultType): string | undefined {
    if (resultType !== 'image' && resultType !== 'video') return undefined;

    const candidates =
      resultType === 'image'
        ? ['photo-restore']
        : mode.includes('animate')
          ? ['photo-animate', 'trends']
          : ['trends', 'photo-animate'];

    for (const dir of candidates) {
      const files = listAssets(path.join(this.demoAssetsRoot, dir), resultType);
      if (files.length > 0) return files[Math.floor(Math.random() * files.length)];
    }

    return undefined;
  }

  async checkNSFW(inputUrl: string): Promise<NSFWCheckResult> {
    if (inputUrl.toLowerCase().includes('nsfw')) {
      return { safe: false, score: 0.98, reason: 'EXPLICIT_CONTENT' };
    }
    return { safe: true, score: 0.05 };
  }

  async getJobStatus(handle: AIJobHandle): Promise<AIJobStatus> {
    const state = this.jobs.get(handle.providerJobId);
    if (!state) throw new Error('JOB_NOT_FOUND');

    const elapsed = Date.now() - state.startedAt;
    if (elapsed < state.durationMs) {
      return {
        status: 'processing',
        progress: Math.min(99, Math.round((elapsed / state.durationMs) * 100)),
      };
    }

    if (state.resultType === 'text') {
      return {
        status: 'completed',
        progress: 100,
        resultText: 'Mock text generation result.',
        resultType: 'text',
      };
    }

    if (!state.resultDemoPath) {
      return {
        status: 'completed',
        progress: 100,
        resultUrl: '/static/placeholders/preset-default.jpg',
        resultType: state.resultType,
      };
    }

    if (state.cachedResultUrl) {
      return {
        status: 'completed',
        progress: 100,
        resultUrl: state.cachedResultUrl,
        resultType: state.resultType,
      };
    }

    const ext = path.extname(state.resultDemoPath) || (state.resultType === 'image' ? '.jpg' : '.mp4');
    const buffer = await fs.promises.readFile(state.resultDemoPath);
    const key = `results/mock/${handle.providerJobId}${ext}`;
    const contentType = inferContentType(ext, state.resultType);
    const { url } = await this.options.storageProvider.upload({ key, body: buffer, contentType });

    state.cachedResultUrl = url;

    return {
      status: 'completed',
      progress: 100,
      resultUrl: url,
      resultType: state.resultType,
    };
  }
}
