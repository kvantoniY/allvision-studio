import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import type { StorageProvider } from '@allvision/shared';

export interface LocalFileStorageOptions {
  rootDir: string;
  publicBaseUrl: string;
}

export class LocalFileStorage implements StorageProvider {
  private rootDir: string;
  private publicBaseUrl: string;

  constructor(options: LocalFileStorageOptions) {
    this.rootDir = path.resolve(options.rootDir);
    this.publicBaseUrl = options.publicBaseUrl.replace(/\/+$/, '');
  }

  private resolveKey(key: string): string {
    const safeKey = key.replace(/^\/+/, '');
    const target = path.resolve(this.rootDir, safeKey);
    // Защита от path traversal: ключ должен оставаться внутри rootDir.
    if (!target.startsWith(this.rootDir + path.sep) && target !== this.rootDir) {
      throw new Error(`INVALID_KEY: ${key}`);
    }
    return target;
  }

  private buildUrl(key: string): string {
    return `${this.publicBaseUrl}/${key.replace(/^\/+/, '').split(path.sep).join('/')}`;
  }

  async upload(params: {
    key: string;
    body: Buffer | Readable;
    contentType: string;
  }): Promise<{ url: string; key: string }> {
    const target = this.resolveKey(params.key);
    await fs.promises.mkdir(path.dirname(target), { recursive: true });

    if (Buffer.isBuffer(params.body)) {
      await fs.promises.writeFile(target, params.body);
    } else {
      const out = fs.createWriteStream(target);
      await pipeline(params.body, out);
    }

    return { url: this.buildUrl(params.key), key: params.key };
  }

  async getSignedUrl(key: string, _expiresInSec: number): Promise<string> {
    return this.buildUrl(key);
  }

  async delete(key: string): Promise<void> {
    const target = this.resolveKey(key);
    try {
      await fs.promises.unlink(target);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }

  async has(key: string): Promise<boolean> {
    const target = this.resolveKey(key);
    try {
      await fs.promises.access(target);
      return true;
    } catch {
      return false;
    }
  }

  getRootDir(): string {
    return this.rootDir;
  }
}
