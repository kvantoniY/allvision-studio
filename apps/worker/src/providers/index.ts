import path from 'node:path';
import fs from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import type { AIProvider, StorageProvider } from '@allvision/shared';
import { MockAIProvider } from './mock-ai-provider';

let storageSingleton: StorageProvider | undefined;
let aiSingleton: AIProvider | undefined;

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
    const rootDir = path.resolve(process.cwd(), process.env.UPLOADS_DIR ?? './uploads');
    const publicBaseUrl = `${process.env.PUBLIC_API_URL ?? 'http://localhost:4000'}/static`;
    storageSingleton = new WorkerLocalFileStorage(rootDir, publicBaseUrl);
    return storageSingleton;
  }
  throw new Error(`Unknown storage provider: ${provider}`);
}

export function getAIProvider(): AIProvider {
  if (aiSingleton) return aiSingleton;
  const provider = process.env.AI_PROVIDER ?? 'mock';
  if (provider === 'mock') {
    aiSingleton = new MockAIProvider({
      storageProvider: getStorageProvider(),
      demoAssetsRoot: process.env.DEMO_ASSETS_ROOT,
    });
    return aiSingleton;
  }
  if (provider === 'fal' || provider === 'replicate') {
    throw new Error(`AI_PROVIDER ${provider} пока не реализован`);
  }
  throw new Error(`Unknown AI provider: ${provider}`);
}

export function _resetWorkerProvidersForTests() {
  storageSingleton = undefined;
  aiSingleton = undefined;
}

export { MockAIProvider } from './mock-ai-provider';
