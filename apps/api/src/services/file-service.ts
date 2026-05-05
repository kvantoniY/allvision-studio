import crypto from 'node:crypto';
import sharp from 'sharp';
import { HttpError } from '../utils/http-error';
import { getStorageProvider } from '../providers';

const MAX_DIMENSION = 4000;

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/webm': 'webm',
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
    throw new HttpError(400, 'INVALID_IMAGE', 'File is not a valid image');
  }

  const { width, height, format } = metadata;
  if (!width || !height || !format) {
    throw new HttpError(400, 'INVALID_IMAGE', 'Unable to read image dimensions');
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
    throw new HttpError(400, 'UNSUPPORTED_FORMAT', `Unsupported image format: ${format}`);
  }

  const maxSide = Math.max(width, height);
  if (maxSide > MAX_DIMENSION) {
    const scale = MAX_DIMENSION / maxSide;
    const newW = Math.round(width * scale);
    const newH = Math.round(height * scale);
    const resized = await sharp(buffer).resize(newW, newH, { fit: 'inside' }).toBuffer();
    return { buffer: resized, contentType, dimensions: { width: newW, height: newH } };
  }

  return { buffer, contentType, dimensions: { width, height } };
}

function ext(contentType: string): string {
  return MIME_TO_EXT[contentType] ?? 'bin';
}

export async function uploadBuffer(params: {
  keyPrefix: string;
  buffer: Buffer;
  contentType: string;
}): Promise<{ url: string; key: string }> {
  const keyPrefix = params.keyPrefix.replace(/^\/+|\/+$/g, '');
  const key = `${keyPrefix}/${crypto.randomUUID()}.${ext(params.contentType)}`;
  return getStorageProvider().upload({
    key,
    body: params.buffer,
    contentType: params.contentType,
  });
}

export async function deleteFile(key: string): Promise<void> {
  await getStorageProvider().delete(key);
}
