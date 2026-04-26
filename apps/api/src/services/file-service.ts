import crypto from 'node:crypto';
import sharp from 'sharp';
import { HttpError } from '../utils/http-error';
import { getStorageProvider } from '../providers';

const MAX_DIMENSION = 4000;

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export interface ProcessedImage {
  buffer: Buffer;
  contentType: string;
  dimensions: { width: number; height: number };
}

export async function validateAndProcessImage(buffer: Buffer): Promise<ProcessedImage> {
  let metadata;
  try {
    metadata = await sharp(buffer).metadata();
  } catch {
    throw new HttpError(400, 'INVALID_IMAGE', 'Файл не является корректным изображением');
  }

  const { width, height, format } = metadata;
  if (!width || !height || !format) {
    throw new HttpError(400, 'INVALID_IMAGE', 'Невозможно прочитать размеры изображения');
  }

  const contentType =
    format === 'jpeg' || format === 'jpg'
      ? 'image/jpeg'
      : format === 'png'
      ? 'image/png'
      : format === 'webp'
      ? 'image/webp'
      : null;

  if (!contentType) {
    throw new HttpError(400, 'UNSUPPORTED_FORMAT', `Формат ${format} не поддерживается`);
  }

  const maxSide = Math.max(width, height);
  if (maxSide > MAX_DIMENSION) {
    const scale = MAX_DIMENSION / maxSide;
    const newW = Math.round(width * scale);
    const newH = Math.round(height * scale);
    const resized = await sharp(buffer)
      .resize(newW, newH, { fit: 'inside' })
      .toBuffer();
    return { buffer: resized, contentType, dimensions: { width: newW, height: newH } };
  }

  return { buffer, contentType, dimensions: { width, height } };
}

function ext(contentType: string): string {
  return MIME_TO_EXT[contentType] ?? 'bin';
}

function yyyymm(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export async function uploadUserImage(
  userId: string,
  buffer: Buffer,
  contentType: string,
): Promise<{ url: string; key: string; dimensions: { width: number; height: number } }> {
  const processed = await validateAndProcessImage(buffer);
  const key = `user-uploads/${userId}/${yyyymm()}/${crypto.randomUUID()}.${ext(processed.contentType)}`;
  const { url } = await getStorageProvider().upload({
    key,
    body: processed.buffer,
    contentType: processed.contentType,
  });
  return { url, key, dimensions: processed.dimensions };
}

export async function uploadResult(
  buffer: Buffer,
  contentType: string,
  projectId: string,
): Promise<{ url: string; key: string }> {
  const e = ext(contentType);
  const key = `results/${projectId}/${crypto.randomUUID()}.${e}`;
  return getStorageProvider().upload({ key, body: buffer, contentType });
}

export async function deleteFile(key: string): Promise<void> {
  await getStorageProvider().delete(key);
}
