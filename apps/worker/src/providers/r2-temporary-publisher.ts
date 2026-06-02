import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import { ProviderError } from './provider-errors';
import type { FilePublisher } from './file-publisher';
import { expiresAt } from './file-publisher';

export interface R2TemporaryPublisherOptions {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBaseUrl: string;
  rootDir: string;
  prefix?: string;
}

export class R2TemporaryPublisher implements FilePublisher {
  private client: S3Client;
  private bucket: string;
  private publicBaseUrl: string;
  private rootDir: string;
  private prefix: string;

  constructor(options: R2TemporaryPublisherOptions) {
    this.bucket = options.bucket;
    this.publicBaseUrl = options.publicBaseUrl.replace(/\/+$/, '');
    this.rootDir = path.resolve(options.rootDir);
    this.prefix = (options.prefix ?? 'piapi-temp').replace(/^\/+|\/+$/g, '');
    this.client = new S3Client({
      region: 'auto',
      endpoint: options.endpoint,
      credentials: {
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
      },
    });
  }

  async publishImageUrl(
    imageUrl: string,
    ttlHours: number,
  ): Promise<{ publicUrl: string; expiresAt: Date; key?: string }> {
    if (isProbablyPublicUrl(imageUrl) && !this.isLocalStaticUrl(imageUrl)) {
      return { publicUrl: imageUrl, expiresAt: expiresAt(ttlHours) };
    }

    const localPath = this.localPathFromStaticUrl(imageUrl);
    const source = await fs.promises.readFile(localPath);
    const body = await sharp(source)
      .rotate()
      .resize(2048, 2048, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 90 })
      .toBuffer();
    const key = `${this.prefix}/${datePath()}/${crypto.randomUUID()}.jpg`;

    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: body,
      ContentType: 'image/jpeg',
    }));

    return {
      publicUrl: `${this.publicBaseUrl}/${key}`,
      expiresAt: expiresAt(ttlHours),
      key,
    };
  }

  async publishFileUrl(
    fileUrl: string,
    ttlHours: number,
    contentType?: string,
  ): Promise<{ publicUrl: string; expiresAt: Date; key?: string }> {
    if (isProbablyPublicUrl(fileUrl) && !this.isLocalStaticUrl(fileUrl)) {
      return { publicUrl: fileUrl, expiresAt: expiresAt(ttlHours) };
    }

    const localPath = this.localPathFromStaticUrl(fileUrl);
    const body = await fs.promises.readFile(localPath);
    const resolvedContentType = contentType ?? contentTypeForPath(localPath);
    const key = `${this.prefix}/${datePath()}/${crypto.randomUUID()}.${extensionForContentType(resolvedContentType, localPath)}`;

    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: body,
      ContentType: resolvedContentType,
    }));

    return {
      publicUrl: `${this.publicBaseUrl}/${key}`,
      expiresAt: expiresAt(ttlHours),
      key,
    };
  }

  private isLocalStaticUrl(value: string) {
    return value.startsWith('/static/') || value.includes('/static/');
  }

  private localPathFromStaticUrl(value: string) {
    const marker = '/static/';
    const key = value.startsWith('/static/')
      ? value.slice('/static/'.length)
      : value.includes(marker)
        ? value.slice(value.indexOf(marker) + marker.length)
        : value;
    const decoded = decodeURIComponent(key).replace(/^\/+/, '');
    const target = path.resolve(this.rootDir, decoded);
    if (!target.startsWith(this.rootDir + path.sep) && target !== this.rootDir) {
      throw new ProviderError('INVALID_LOCAL_FILE_URL', `Invalid local file URL: ${value}`);
    }
    return target;
  }
}

function isProbablyPublicUrl(value: string) {
  return value.startsWith('https://') || value.startsWith('http://');
}

function datePath() {
  const now = new Date();
  return [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, '0'),
    String(now.getUTCDate()).padStart(2, '0'),
  ].join('/');
}

function contentTypeForPath(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.mp4') return 'video/mp4';
  if (ext === '.webm') return 'video/webm';
  if (ext === '.mov') return 'video/quicktime';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.mp3') return 'audio/mpeg';
  if (ext === '.wav') return 'audio/wav';
  if (ext === '.ogg') return 'audio/ogg';
  return 'application/octet-stream';
}

function extensionForContentType(contentType: string, filePath: string) {
  const map: Record<string, string> = {
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/quicktime': 'mov',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'audio/mpeg': 'mp3',
    'audio/mp3': 'mp3',
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
    'audio/ogg': 'ogg',
  };
  return map[contentType] ?? (path.extname(filePath).replace(/^\./, '') || 'bin');
}
