import path from 'node:path';
import fs from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import type {
  AIProvider as LegacyAIProvider,
  StorageProvider,
  RuntimeProviderMode,
} from '@allvision/shared';
import { resolveRuntimeProviderMode } from '@allvision/shared';
import { MockAIProvider } from './mock-ai-provider';
import type { AIProvider as WorkerAIProvider } from './ai-provider';
import { PiAPIProvider } from './piapi-provider';
import { R2TemporaryPublisher } from './r2-temporary-publisher';
import { LocalPublicPublisher } from './local-public-publisher';
import { NoopPublisher } from './noop-publisher';
import type { FilePublisher } from './file-publisher';
import { StubAIProvider } from './stub-ai-provider';
import { resolveWorkspacePath } from '../utils/paths';
import { logger } from '../utils/logger';

export type PipelineProviderMode = 'production' | 'test-run';
export type StoragePublisherMode = 'local' | 'r2' | 'noop';

let storageSingleton: StorageProvider | undefined;
let storageRootDir: string | undefined;
let mockSingleton: MockAIProvider | undefined;
let stubSingleton: StubAIProvider | undefined;
let piapiSingleton: PiAPIProvider | undefined;
let publisherSingleton: FilePublisher | undefined;

const MOCK_ONLY_BLOCKS = new Set(['image-restore', 'image-upscale']);
const PIAPI_BLOCKS = new Set(['image-to-video', 'face-swap-video', 'image-edit', 'text-to-video', 'motion-transfer', 'trend-video-transfer', 'scene-transfer', 'carousel-slides', 'product-card', 'photo-2017', 'video-effect', 'video-watermark-remove', 'video-upscale']);

/**
 * Worker использует тот же LocalFileStorage что и API — но мы не импортируем класс
 * из @allvision/api (это apps/* пакет, не shared). Делаем отдельный класс с той же
 * логикой; файлы пишутся в общую UPLOADS_DIR, поэтому /static-роут API их раздаёт.
 */
class WorkerLocalFileStorage implements StorageProvider {
  constructor(private rootDir: string, private publicBaseUrl: string) {
    this.rootDir = path.resolve(rootDir);
    this.publicBaseUrl = publicBaseUrl.replace(/\/+$/, '');
  }

  private resolveKey(key: string): string {
    const safeKey = key.replace(/^\/+/, '');
    const target = path.resolve(this.rootDir, safeKey);
    if (!target.startsWith(this.rootDir + path.sep) && target !== this.rootDir) {
      throw new Error(`INVALID_KEY: ${key}`);
    }
    return target;
  }

  private buildUrl(key: string): string {
    return `${this.publicBaseUrl}/${key.replace(/^\/+/, '').split(path.sep).join('/')}`;
  }

  async upload(params: { key: string; body: Buffer | Readable; contentType: string }) {
    const target = this.resolveKey(params.key);
    await fs.promises.mkdir(path.dirname(target), { recursive: true });
    if (Buffer.isBuffer(params.body)) {
      await fs.promises.writeFile(target, params.body);
    } else {
      await pipeline(params.body, fs.createWriteStream(target));
    }
    return { url: this.buildUrl(params.key), key: params.key };
  }

  async getSignedUrl(key: string) {
    return this.buildUrl(key);
  }

  async delete(key: string) {
    try {
      await fs.promises.unlink(this.resolveKey(key));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }
}

export function getStorageProvider(): StorageProvider {
  if (storageSingleton) return storageSingleton;
  const provider = process.env.STORAGE_PROVIDER ?? 'local';
  if (provider === 'local') {
    storageRootDir = resolveWorkspacePath(process.env.UPLOADS_DIR ?? './uploads');
    const publicBaseUrl = `${process.env.PUBLIC_API_URL ?? 'http://localhost:4000'}/static`;
    storageSingleton = new WorkerLocalFileStorage(storageRootDir, publicBaseUrl);
    return storageSingleton;
  }
  throw new Error(`Unknown storage provider: ${provider}`);
}

export function getLegacyAIProvider(): LegacyAIProvider {
  return getMockProvider();
}

export function getAIProvider(
  blockSlug?: string,
  options: { mode?: PipelineProviderMode } = {},
): WorkerAIProvider {
  if (process.env.NODE_ENV === 'test') return getStubProvider();
  if (options.mode === 'test-run') return getMockProvider();

  const providerMode = getRuntimeProviderMode();
  if (providerMode === 'mock') return getMockProvider();
  if (providerMode === 'piapi') {
    if (!blockSlug || MOCK_ONLY_BLOCKS.has(blockSlug)) return getMockProvider();
    if (PIAPI_BLOCKS.has(blockSlug)) return getPiAPIProvider();
    return getMockProvider();
  }

  return getStubProvider();
}

export async function initialiseWorkerProviders() {
  if (process.env.NODE_ENV === 'test') return;
  getStorageProvider();
  getMockProvider();
  const providerMode = getRuntimeProviderMode();
  if (providerMode === 'piapi') {
    await getPiAPIProvider().initialise();
  }
}

export function getRuntimeProviderMode(): RuntimeProviderMode {
  return resolveRuntimeProviderMode(process.env.PROVIDER_MODE, process.env.NODE_ENV);
}

function getMockProvider(): MockAIProvider {
  if (mockSingleton) return mockSingleton;
  mockSingleton = new MockAIProvider({
    storageProvider: getStorageProvider(),
    demoAssetsRoot: resolveWorkspacePath(process.env.DEMO_ASSETS_ROOT ?? './apps/api/demo-assets'),
    minDurationMs: process.env.MOCK_AI_MIN_DURATION_MS ? Number(process.env.MOCK_AI_MIN_DURATION_MS) : undefined,
    maxDurationMs: process.env.MOCK_AI_MAX_DURATION_MS ? Number(process.env.MOCK_AI_MAX_DURATION_MS) : undefined,
  });
  return mockSingleton;
}

function getStubProvider(): StubAIProvider {
  if (stubSingleton) return stubSingleton;
  stubSingleton = new StubAIProvider();
  return stubSingleton;
}

function getPiAPIProvider(): PiAPIProvider {
  if (piapiSingleton) return piapiSingleton;
  piapiSingleton = new PiAPIProvider({
    apiKey: requireEnv('PIAPI_API_KEY'),
    baseUrl: process.env.PIAPI_BASE_URL ?? 'https://api.piapi.ai',
    dailyCapUsd: Number(process.env.PIAPI_DAILY_CAP_USD ?? '5'),
    balanceMinUsd: Number(process.env.PIAPI_BALANCE_MIN_USD ?? '2'),
    storage: getStorageProvider(),
    publisher: getFilePublisher(),
    logger,
  });
  return piapiSingleton;
}

function getFilePublisher(): FilePublisher {
  if (publisherSingleton) return publisherSingleton;
  const mode = getStoragePublisherMode();
  const rootDir = storageRootDir ?? resolveWorkspacePath(process.env.UPLOADS_DIR ?? './uploads');
  if (mode === 'local') {
    publisherSingleton = new LocalPublicPublisher({
      rootDir,
      publicBaseUrl: process.env.PUBLIC_API_URL ?? 'http://localhost:4000',
    });
    return publisherSingleton;
  }
  if (mode === 'r2') {
    publisherSingleton = new R2TemporaryPublisher({
      endpoint: requireEnv('R2_ENDPOINT'),
      accessKeyId: requireEnv('R2_ACCESS_KEY_ID'),
      secretAccessKey: requireEnv('R2_SECRET_ACCESS_KEY'),
      bucket: requireEnv('R2_BUCKET'),
      publicBaseUrl: requireEnv('R2_PUBLIC_BASE_URL'),
      rootDir,
      prefix: process.env.R2_TEMP_PREFIX ?? 'piapi-temp',
    });
    return publisherSingleton;
  }
  publisherSingleton = new NoopPublisher();
  return publisherSingleton;
}

function getStoragePublisherMode(): StoragePublisherMode {
  const mode = process.env.STORAGE_PUBLISHER ?? 'local';
  if (mode === 'local' || mode === 'r2' || mode === 'noop') return mode;
  throw new Error(`Unknown STORAGE_PUBLISHER: ${mode}`);
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for PiAPI worker`);
  return value;
}

export function _resetWorkerProvidersForTests() {
  storageSingleton = undefined;
  storageRootDir = undefined;
  mockSingleton = undefined;
  stubSingleton = undefined;
  piapiSingleton = undefined;
  publisherSingleton = undefined;
}

export { MockAIProvider } from './mock-ai-provider';
export { PiAPIProvider } from './piapi-provider';
export { StubAIProvider } from './stub-ai-provider';
export type { WorkerAIProvider };
