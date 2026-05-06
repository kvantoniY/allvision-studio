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
};

const ALLOWED_TREND_VIDEO_MIME = new Set(['video/mp4', 'video/webm', 'video/quicktime']);
const ALLOWED_TREND_IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_TREND_PREVIEW_SIZE = 50 * 1024 * 1024;
const MAX_TREND_THUMBNAIL_SIZE = 5 * 1024 * 1024;
const ALLOWED_V3_IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_V3_VIDEO_MIME = new Set(['video/mp4', 'video/webm', 'video/quicktime']);
const MAX_CHARACTER_REFERENCE_SIZE = 10 * 1024 * 1024;
const MAX_SCENE_REFERENCE_SIZE = 10 * 1024 * 1024;
const MAX_TEMPLATE_PREVIEW_SIZE = 50 * 1024 * 1024;
const MAX_TEMPLATE_IMAGE_SIZE = 5 * 1024 * 1024;
const MAX_SERVICE_PREVIEW_VIDEO_SIZE = 50 * 1024 * 1024;
const MAX_SERVICE_PREVIEW_IMAGE_SIZE = 5 * 1024 * 1024;

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

export async function uploadTrendPreview(
  buffer: Buffer,
  contentType: string,
): Promise<{ url: string; key: string }> {
  if (buffer.length > MAX_TREND_PREVIEW_SIZE) {
    throw new HttpError(413, 'FILE_TOO_LARGE', 'Р¤Р°Р№Р» СЃР»РёС€РєРѕРј Р±РѕР»СЊС€РѕР№');
  }
  if (!ALLOWED_TREND_VIDEO_MIME.has(contentType)) {
    throw new HttpError(400, 'UNSUPPORTED_FORMAT', 'РќРµРїРѕРґРґРµСЂР¶РёРІР°РµРјС‹Р№ С„РѕСЂРјР°С‚ С„Р°Р№Р»Р°');
  }

  const key = `trend-assets/previews/${crypto.randomUUID()}.${ext(contentType)}`;
  return getStorageProvider().upload({ key, body: buffer, contentType });
}

export async function uploadTrendThumbnail(
  buffer: Buffer,
  contentType: string,
): Promise<{ url: string; key: string }> {
  if (buffer.length > MAX_TREND_THUMBNAIL_SIZE) {
    throw new HttpError(413, 'FILE_TOO_LARGE', 'Р¤Р°Р№Р» СЃР»РёС€РєРѕРј Р±РѕР»СЊС€РѕР№');
  }
  if (!ALLOWED_TREND_IMAGE_MIME.has(contentType)) {
    throw new HttpError(400, 'UNSUPPORTED_FORMAT', 'РќРµРїРѕРґРґРµСЂР¶РёРІР°РµРјС‹Р№ С„РѕСЂРјР°С‚ С„Р°Р№Р»Р°');
  }

  const processed = await validateAndProcessImage(buffer);
  const key = `trend-assets/thumbnails/${crypto.randomUUID()}.${ext(processed.contentType)}`;
  return getStorageProvider().upload({
    key,
    body: processed.buffer,
    contentType: processed.contentType,
  });
}

export async function uploadCharacterReference(
  userId: string,
  buffer: Buffer,
  contentType: string,
): Promise<{ url: string; key: string; dimensions: { width: number; height: number } }> {
  if (buffer.length > MAX_CHARACTER_REFERENCE_SIZE) {
    throw new HttpError(413, 'FILE_TOO_LARGE', 'File is too large');
  }
  if (!ALLOWED_V3_IMAGE_MIME.has(contentType)) {
    throw new HttpError(400, 'UNSUPPORTED_FORMAT', 'Unsupported file format');
  }

  const processed = await validateAndProcessImage(buffer);
  const key = `character-references/${userId}/${crypto.randomUUID()}.${ext(processed.contentType)}`;
  const { url } = await getStorageProvider().upload({
    key,
    body: processed.buffer,
    contentType: processed.contentType,
  });
  return { url, key, dimensions: processed.dimensions };
}

export async function uploadSceneReference(
  userId: string,
  buffer: Buffer,
  contentType: string,
): Promise<{ url: string; key: string; dimensions: { width: number; height: number } }> {
  if (buffer.length > MAX_SCENE_REFERENCE_SIZE) {
    throw new HttpError(413, 'FILE_TOO_LARGE', 'File is too large');
  }
  if (!ALLOWED_V3_IMAGE_MIME.has(contentType)) {
    throw new HttpError(400, 'UNSUPPORTED_FORMAT', 'Unsupported file format');
  }

  const processed = await validateAndProcessImage(buffer);
  const key = `scene-references/${userId}/${crypto.randomUUID()}.${ext(processed.contentType)}`;
  const { url } = await getStorageProvider().upload({
    key,
    body: processed.buffer,
    contentType: processed.contentType,
  });
  return { url, key, dimensions: processed.dimensions };
}

export async function uploadTemplatePreview(
  buffer: Buffer,
  contentType: string,
): Promise<{ url: string; key: string }> {
  if (buffer.length > MAX_TEMPLATE_PREVIEW_SIZE) {
    throw new HttpError(413, 'FILE_TOO_LARGE', 'File is too large');
  }
  if (!ALLOWED_V3_VIDEO_MIME.has(contentType)) {
    throw new HttpError(400, 'UNSUPPORTED_FORMAT', 'Unsupported file format');
  }

  const key = `template-assets/previews/${crypto.randomUUID()}.${ext(contentType)}`;
  return getStorageProvider().upload({ key, body: buffer, contentType });
}

export async function uploadTemplateImage(
  buffer: Buffer,
  contentType: string,
): Promise<{ url: string; key: string }> {
  if (buffer.length > MAX_TEMPLATE_IMAGE_SIZE) {
    throw new HttpError(413, 'FILE_TOO_LARGE', 'File is too large');
  }
  if (!ALLOWED_V3_IMAGE_MIME.has(contentType)) {
    throw new HttpError(400, 'UNSUPPORTED_FORMAT', 'Unsupported file format');
  }

  const processed = await validateAndProcessImage(buffer);
  const key = `template-assets/images/${crypto.randomUUID()}.${ext(processed.contentType)}`;
  return getStorageProvider().upload({
    key,
    body: processed.buffer,
    contentType: processed.contentType,
  });
}

export async function uploadServicePreview(
  buffer: Buffer,
  contentType: string,
  kind: 'image' | 'video',
): Promise<{ url: string; key: string }> {
  if (kind === 'video') {
    if (buffer.length > MAX_SERVICE_PREVIEW_VIDEO_SIZE) {
      throw new HttpError(413, 'FILE_TOO_LARGE', 'File is too large');
    }
    if (!ALLOWED_V3_VIDEO_MIME.has(contentType)) {
      throw new HttpError(400, 'UNSUPPORTED_FORMAT', 'Unsupported file format');
    }

    const key = `service-assets/videos/${crypto.randomUUID()}.${ext(contentType)}`;
    return getStorageProvider().upload({ key, body: buffer, contentType });
  }

  if (buffer.length > MAX_SERVICE_PREVIEW_IMAGE_SIZE) {
    throw new HttpError(413, 'FILE_TOO_LARGE', 'File is too large');
  }
  if (!ALLOWED_V3_IMAGE_MIME.has(contentType)) {
    throw new HttpError(400, 'UNSUPPORTED_FORMAT', 'Unsupported file format');
  }

  const processed = await validateAndProcessImage(buffer);
  const key = `service-assets/images/${crypto.randomUUID()}.${ext(processed.contentType)}`;
  return getStorageProvider().upload({
    key,
    body: processed.buffer,
    contentType: processed.contentType,
  });
}

export async function deleteFile(key: string): Promise<void> {
  await getStorageProvider().delete(key);
}
