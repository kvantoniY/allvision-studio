import path from 'node:path';
import fs from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import type {
  AIProvider as LegacyAIProvider,
  StorageProvider,
} from '@allvision/shared';
import { MockAIProvider } from './mock-ai-provider';
import type { AIProvider as WorkerAIProvider } from './ai-provider';
import { PiAPIProvider } from './piapi-provider';
import { R2TemporaryPublisher } from './r2-temporary-publisher';
import { StubAIProvider } from './stub-ai-provider';
import { resolveWorkspacePath } from '../utils/paths';
import { logger } from '../utils/logger';

export type ProviderMode = 'production' | 'test-run';

let storageSingleton: StorageProvider | undefined;
let storageRootDir: string | undefined;
let mockSingleton: MockAIProvider | undefined;
let stubSingleton: StubAIProvider | undefined;
let piapiSingleton: PiAPIProvider | undefined;
let r2PublisherSingleton: R2TemporaryPublisher | undefined;

const MOCK_ONLY_BLOCKS = new Set(['image-restore', 'image-upscale', 'text-to-video']);
const PIAPI_BLOCKS = new Set(['image-to-video', 'face-swap-video']);

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
  options: { mode?: ProviderMode } = {},
): WorkerAIProvider {
  if (process.env.NODE_ENV === 'test') return getStubProvider();
  if (options.mode === 'test-run') return getMockProvider();
  if (!blockSlug || MOCK_ONLY_BLOCKS.has(blockSlug)) return getMockProvider();
  if (PIAPI_BLOCKS.has(blockSlug)) return getPiAPIProvider();
  return getMockProvider();
}

export async function initialiseWorkerProviders() {
  if (process.env.NODE_ENV === 'test') return;
  getStorageProvider();
  getMockProvider();
  await getPiAPIProvider().initialise();
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
    publisher: getR2Publisher(),
    logger,
  });
  return piapiSingleton;
}

function getR2Publisher(): R2TemporaryPublisher {
  if (r2PublisherSingleton) return r2PublisherSingleton;
  const rootDir = storageRootDir ?? resolveWorkspacePath(process.env.UPLOADS_DIR ?? './uploads');
  r2PublisherSingleton = new R2TemporaryPublisher({
    endpoint: requireEnv('R2_ENDPOINT'),
    accessKeyId: requireEnv('R2_ACCESS_KEY_ID'),
    secretAccessKey: requireEnv('R2_SECRET_ACCESS_KEY'),
    bucket: requireEnv('R2_BUCKET'),
    publicBaseUrl: requireEnv('R2_PUBLIC_BASE_URL'),
    rootDir,
    prefix: process.env.R2_TEMP_PREFIX ?? 'piapi-temp',
  });
  return r2PublisherSingleton;
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
  r2PublisherSingleton = undefined;
}

export { MockAIProvider } from './mock-ai-provider';
export { PiAPIProvider } from './piapi-provider';
export { StubAIProvider } from './stub-ai-provider';
export type { WorkerAIProvider };
