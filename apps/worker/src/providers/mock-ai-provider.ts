import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  AIProvider,
  AIJobHandle,
  AIJobStatus,
  FairyTaleScript,
  NSFWCheckResult,
  StorageProvider,
} from '@allvision/shared';

type MockService = 'photo-restore' | 'photo-animate' | 'trend' | 'episode-image' | 'episode-video';
type ResultType = 'image' | 'video';

interface MockJobState {
  startedAt: number;
  durationMs: number;
  resultDemoPath: string;
  resultType: ResultType;
  service: MockService;
  cachedResultUrl?: string;
  cachedResultKey?: string;
}

export interface MockAIProviderOptions {
  storageProvider: StorageProvider;
  demoAssetsRoot?: string;
  /** Минимальная задержка задачи (мс). Дефолт 5000. */
  minDurationMs?: number;
  /** Максимальная задержка задачи (мс). Дефолт 15000. */
  maxDurationMs?: number;
}

const SERVICE_DIRS: Record<MockService, string> = {
  'photo-restore': 'photo-restore',
  'photo-animate': 'photo-animate',
  trend: 'trends',
  'episode-image': 'episodes/images',
  'episode-video': 'episodes/videos',
};

const SERVICE_RESULT_TYPE: Record<MockService, ResultType> = {
  'photo-restore': 'image',
  'photo-animate': 'video',
  trend: 'video',
  'episode-image': 'image',
  'episode-video': 'video',
};

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
  return fallback === 'image' ? 'image/jpeg' : 'video/mp4';
}

function listAssets(dir: string, expected: ResultType): string[] {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile())
    .map((e) => path.join(dir, e.name))
    .filter((p) => {
      const ext = path.extname(p).toLowerCase();
      return expected === 'image' ? IMAGE_EXTS.has(ext) : VIDEO_EXTS.has(ext);
    });
}

export class MockAIProvider implements AIProvider {
  name = 'mock';

  private storage: StorageProvider;
  private demoAssetsRoot: string;
  private minDurationMs: number;
  private maxDurationMs: number;
  private jobs = new Map<string, MockJobState>();

  constructor(options: MockAIProviderOptions) {
    this.storage = options.storageProvider;
    this.demoAssetsRoot = path.resolve(
      options.demoAssetsRoot ?? process.env.DEMO_ASSETS_ROOT ?? './apps/api/demo-assets',
    );
    this.minDurationMs = options.minDurationMs ?? 5000;
    this.maxDurationMs = options.maxDurationMs ?? 15000;
  }

  private pickAsset(service: MockService): { filePath: string; resultType: ResultType } {
    const resultType = SERVICE_RESULT_TYPE[service];
    const dir = path.join(this.demoAssetsRoot, SERVICE_DIRS[service]);
    let files = listAssets(dir, resultType);
    if (files.length === 0 && service === 'episode-image') {
      files = listAssets(path.join(this.demoAssetsRoot, SERVICE_DIRS['photo-restore']), resultType);
    }
    if (files.length === 0 && service === 'episode-video') {
      files = listAssets(path.join(this.demoAssetsRoot, SERVICE_DIRS['photo-animate']), resultType);
    }
    if (files.length === 0) {
      throw new Error(
        `DEMO_ASSETS_EMPTY: папка ${dir} пуста или не существует. Запустите: npm run demo:download`,
      );
    }
    const filePath = files[Math.floor(Math.random() * files.length)];
    return { filePath, resultType };
  }

  private createJob(service: MockService): AIJobHandle {
    const { filePath, resultType } = this.pickAsset(service);
    const jobId = crypto.randomUUID();
    const span = this.maxDurationMs - this.minDurationMs;
    const durationMs = this.minDurationMs + Math.floor(Math.random() * Math.max(1, span));
    this.jobs.set(jobId, {
      startedAt: Date.now(),
      durationMs,
      resultDemoPath: filePath,
      resultType,
      service,
    });
    return { providerJobId: jobId };
  }

  async restorePhoto(_params: {
    imageUrl: string;
    config: Record<string, any>;
  }): Promise<AIJobHandle> {
    return this.createJob('photo-restore');
  }

  async animateImage(_params: {
    imageUrl: string;
    config: Record<string, any>;
  }): Promise<AIJobHandle> {
    return this.createJob('photo-animate');
  }

  async generateTrend(_params: {
    imageUrl: string;
    trendPrompt: string;
    model: string;
    config: Record<string, any>;
  }): Promise<AIJobHandle> {
    return this.createJob('trend');
  }

  async generateEpisodeImage(_params: {
    prompt: string;
    characterReferences: string[];
    sceneReference?: string;
    style: string;
    aspectRatio: string;
  }): Promise<AIJobHandle> {
    return this.createJob('episode-image');
  }

  async animateEpisodeVideo(_params: {
    imageUrl: string;
    durationSeconds: number;
    style: string;
  }): Promise<AIJobHandle> {
    return this.createJob('episode-video');
  }

  async generateFairyTaleScript(params: {
    childName: string;
    childAge: number;
    moralLesson: string;
    additionalDetails?: string;
    durationMinutes: number;
  }): Promise<FairyTaleScript> {
    const dir = path.join(this.demoAssetsRoot, 'fairy-tales');
    if (!fs.existsSync(dir)) {
      throw new Error(`DEMO_ASSETS_EMPTY: ${dir}`);
    }
    const templates = fs
      .readdirSync(dir)
      .filter((f) => /^template-.+\.json$/i.test(f));
    if (templates.length === 0) {
      throw new Error(`DEMO_ASSETS_EMPTY: нет JSON-шаблонов сказок в ${dir}`);
    }
    const file = templates[Math.floor(Math.random() * templates.length)];
    const raw = fs.readFileSync(path.join(dir, file), 'utf8');

    const replacements: Record<string, string> = {
      '{{childName}}': params.childName,
      '{{childAge}}': String(params.childAge),
      '{{moralLesson}}': params.moralLesson,
      '{{additionalDetails}}': params.additionalDetails ?? '',
    };

    const replaced = Object.entries(replacements).reduce(
      (s, [from, to]) => s.split(from).join(to),
      raw,
    );

    const parsed = JSON.parse(replaced) as Omit<FairyTaleScript, 'tokensCost'>;
    return {
      ...parsed,
      durationMinutes: params.durationMinutes || parsed.durationMinutes,
      tokensCost: 5,
    };
  }

  async checkNSFW(imageUrl: string): Promise<NSFWCheckResult> {
    const delayMs = 500 + Math.floor(Math.random() * 1000);
    await new Promise((resolve) => setTimeout(resolve, delayMs));

    if (imageUrl.toLowerCase().includes('nsfw')) {
      return { safe: false, score: 0.98, reason: 'EXPLICIT_CONTENT' };
    }

    return { safe: true, score: 0.05 };
  }

  async getJobStatus(handle: AIJobHandle): Promise<AIJobStatus> {
    const state = this.jobs.get(handle.providerJobId);
    if (!state) {
      throw new Error('JOB_NOT_FOUND');
    }

    const elapsed = Date.now() - state.startedAt;

    if (elapsed < state.durationMs) {
      const progress = Math.min(99, Math.round((elapsed / state.durationMs) * 100));
      return { status: 'processing', progress };
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
    const { url } = await this.storage.upload({ key, body: buffer, contentType });

    state.cachedResultUrl = url;
    state.cachedResultKey = key;

    return {
      status: 'completed',
      progress: 100,
      resultUrl: url,
      resultType: state.resultType,
    };
  }
}
