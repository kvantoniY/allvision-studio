import path from 'node:path';
import { ProviderError } from './provider-errors';
import type { FilePublisher } from './file-publisher';
import { expiresAt } from './file-publisher';

export interface LocalPublicPublisherOptions {
  rootDir: string;
  publicBaseUrl: string;
}

export class LocalPublicPublisher implements FilePublisher {
  private rootDir: string;
  private publicBaseUrl: string;

  constructor(options: LocalPublicPublisherOptions) {
    this.rootDir = path.resolve(options.rootDir);
    this.publicBaseUrl = options.publicBaseUrl.replace(/\/+$/, '');
  }

  async publishImageUrl(
    imageUrl: string,
    ttlHours: number,
  ): Promise<{ publicUrl: string; expiresAt: Date; key?: string }> {
    return this.publishFileUrl(imageUrl, ttlHours);
  }

  async publishFileUrl(
    fileUrl: string,
    ttlHours: number,
  ): Promise<{ publicUrl: string; expiresAt: Date; key?: string }> {
    if (isProbablyPublicUrl(fileUrl) && !this.isLocalStaticUrl(fileUrl)) {
      return { publicUrl: fileUrl, expiresAt: expiresAt(ttlHours) };
    }

    const relativePath = this.relativePathFromLocalValue(fileUrl);
    return {
      publicUrl: `${this.publicBaseUrl}/static/${relativePath}`,
      expiresAt: expiresAt(ttlHours),
      key: relativePath,
    };
  }

  private isLocalStaticUrl(value: string) {
    return value.startsWith('/static/') || value.includes('/static/');
  }

  private relativePathFromLocalValue(value: string) {
    if (this.isLocalStaticUrl(value)) {
      const marker = '/static/';
      const key = value.startsWith('/static/')
        ? value.slice('/static/'.length)
        : value.slice(value.indexOf(marker) + marker.length);
      return safeRelativePath(key);
    }

    const target = path.resolve(value);
    if (!target.startsWith(this.rootDir + path.sep) && target !== this.rootDir) {
      throw new ProviderError('INVALID_LOCAL_FILE_URL', `Invalid local file path: ${value}`);
    }
    return target
      .slice(this.rootDir.length)
      .replace(/^[/\\]+/, '')
      .split(path.sep)
      .join('/');
  }
}

function safeRelativePath(value: string) {
  const decoded = decodeURIComponent(value).replace(/^\/+/, '');
  const normalised = path.posix.normalize(decoded.replace(/\\/g, '/'));
  if (normalised.startsWith('../') || normalised === '..' || path.posix.isAbsolute(normalised)) {
    throw new ProviderError('INVALID_LOCAL_FILE_URL', `Invalid local file URL: ${value}`);
  }
  return normalised;
}

function isProbablyPublicUrl(value: string) {
  return value.startsWith('https://') || value.startsWith('http://');
}
