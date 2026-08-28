import crypto from 'node:crypto';
import path from 'node:path';
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
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/ogg': 'ogg',
  'audio/webm': 'weba',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
  'application/pdf': 'pdf',
  'text/plain': 'txt',
  'text/csv': 'csv',
  'application/zip': 'zip',
  'application/x-zip-compressed': 'zip',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
};

const ALLOWED_TREND_VIDEO_MIME = new Set(['video/mp4', 'video/webm', 'video/quicktime']);
const ALLOWED_TREND_IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_TREND_PREVIEW_SIZE = 50 * 1024 * 1024;
const MAX_TREND_THUMBNAIL_SIZE = 5 * 1024 * 1024;
const ALLOWED_V3_IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_V3_VIDEO_MIME = new Set(['video/mp4', 'video/webm', 'video/quicktime']);
const ALLOWED_CHAT_VIDEO_MIME = new Set(['video/mp4', 'video/quicktime']);
const ALLOWED_CHAT_AUDIO_MIME = new Set([
  'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/ogg',
  // webm/mp4 приходят не из файлового диалога, а с микрофона: MediaRecorder пишет в webm
  // (Chrome) или в mp4 (Safari), и без них запись голоса отбивалась как «не аудиофайл».
  'audio/webm', 'audio/mp4', 'audio/x-m4a', 'audio/aac',
]);
const MAX_CHARACTER_REFERENCE_SIZE = 10 * 1024 * 1024;
const MAX_SCENE_REFERENCE_SIZE = 10 * 1024 * 1024;
const MAX_TEMPLATE_PREVIEW_SIZE = 50 * 1024 * 1024;
const MAX_TEMPLATE_IMAGE_SIZE = 5 * 1024 * 1024;
const MAX_SERVICE_PREVIEW_VIDEO_SIZE = 50 * 1024 * 1024;
// Covers are re-encoded/downscaled by sharp before storage, so accept generously-sized originals.
const MAX_SERVICE_PREVIEW_IMAGE_SIZE = 25 * 1024 * 1024;
const MAX_USER_INPUT_FILE_SIZE = 50 * 1024 * 1024;
const MAX_CHAT_INPUT_SIZE = 25 * 1024 * 1024;
const MAX_SUPPORT_ATTACHMENT_SIZE = 25 * 1024 * 1024;
const ALLOWED_SUPPORT_FILE_MIME = new Set([
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/zip',
  'application/x-zip-compressed',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

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
  const needsResize = maxSide > MAX_DIMENSION;
  // Фото с телефона хранят поворот в EXIF (orientation 6/8), а не в пикселях. Раньше при ресайзе
  // sharp резал EXIF БЕЗ применения поворота -> фото ложилось набок («повёрнуто на 90°»). Теперь
  // всегда применяем EXIF-ориентацию (.rotate()) и запекаем её в пиксели.
  const hasOrientation = (metadata.orientation ?? 1) > 1;
  if (!needsResize && !hasOrientation) {
    return { buffer, contentType, dimensions: { width, height } };
  }

  let pipeline = sharp(buffer).rotate(); // авто-ориентация по EXIF + снятие тега
  if (needsResize) {
    const scale = MAX_DIMENSION / maxSide;
    pipeline = pipeline.resize(Math.round(width * scale), Math.round(height * scale), { fit: 'inside' });
  }
  if (contentType === 'image/png') pipeline = pipeline.png();
  else if (contentType === 'image/webp') pipeline = pipeline.webp({ quality: 92 });
  else pipeline = pipeline.jpeg({ quality: 92 });
  const out = await pipeline.toBuffer();
  const outMeta = await sharp(out).metadata();
  return { buffer: out, contentType, dimensions: { width: outMeta.width ?? width, height: outMeta.height ?? height } };
}

function ext(contentType: string): string {
  return MIME_TO_EXT[contentType] ?? 'bin';
}

function safeFileName(value: string) {
  const fallback = 'attachment';
  const parsed = path.basename(value || fallback).replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim();
  return parsed || fallback;
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

export async function uploadProfileAvatar(
  userId: string,
  buffer: Buffer,
  contentType: string,
): Promise<{ url: string; key: string; dimensions: { width: number; height: number } }> {
  const processed = await validateAndProcessImage(buffer);
  const key = `user-uploads/profile/${userId}/${crypto.randomUUID()}.${ext(processed.contentType)}`;
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

export async function uploadUserInput(
  userId: string,
  projectId: string,
  fieldId: string,
  buffer: Buffer,
  contentType: string,
): Promise<{ url: string; key: string; dimensions?: { width: number; height: number } }> {
  if (buffer.length > MAX_USER_INPUT_FILE_SIZE) {
    throw new HttpError(413, 'FILE_TOO_LARGE', 'File is too large');
  }
  const safeFieldId = fieldId.replace(/[^a-zA-Z0-9_-]/g, '_');

  if (ALLOWED_V3_IMAGE_MIME.has(contentType)) {
    const processed = await validateAndProcessImage(buffer);
    const key = `user-inputs/${userId}/${projectId}/${safeFieldId}-${crypto.randomUUID()}.${ext(processed.contentType)}`;
    const { url } = await getStorageProvider().upload({
      key,
      body: processed.buffer,
      contentType: processed.contentType,
    });
    return { url, key, dimensions: processed.dimensions };
  }

  if (ALLOWED_V3_VIDEO_MIME.has(contentType) || ALLOWED_CHAT_AUDIO_MIME.has(contentType)) {
    const key = `user-inputs/${userId}/${projectId}/${safeFieldId}-${crypto.randomUUID()}.${ext(contentType)}`;
    return getStorageProvider().upload({ key, body: buffer, contentType });
  }

  throw new HttpError(400, 'UNSUPPORTED_FORMAT', `${fieldId}: unsupported mime ${contentType || 'unknown'}`);
}

export async function uploadChatInput(
  userId: string,
  file: Express.Multer.File,
): Promise<{ url: string; key: string; ref: string; mediaKind: 'image' | 'video' | 'audio'; dimensions?: { width: number; height: number } }> {
  if (file.size > MAX_CHAT_INPUT_SIZE) {
    throw new HttpError(413, 'FILE_TOO_LARGE', 'Файл должен быть не тяжелее 25 МБ');
  }

  const now = Date.now();
  const safeName = `${now}-${crypto.randomUUID()}`;
  if (ALLOWED_V3_IMAGE_MIME.has(file.mimetype)) {
    const processed = await validateAndProcessImage(file.buffer);
    const key = `user-uploads/chat/${userId}/${safeName}.${ext(processed.contentType)}`;
    const { url } = await getStorageProvider().upload({
      key,
      body: processed.buffer,
      contentType: processed.contentType,
    });
    return { url, key, ref: `chat:${key}`, mediaKind: 'image', dimensions: processed.dimensions };
  }

  if (ALLOWED_CHAT_VIDEO_MIME.has(file.mimetype)) {
    const key = `user-uploads/chat/${userId}/${safeName}.${ext(file.mimetype)}`;
    const { url } = await getStorageProvider().upload({
      key,
      body: file.buffer,
      contentType: file.mimetype,
    });
    return { url, key, ref: `chat:${key}`, mediaKind: 'video' };
  }

  if (ALLOWED_CHAT_AUDIO_MIME.has(file.mimetype)) {
    const key = `user-uploads/chat/${userId}/${safeName}.${ext(file.mimetype)}`;
    const { url } = await getStorageProvider().upload({
      key,
      body: file.buffer,
      contentType: file.mimetype,
    });
    return { url, key, ref: `chat:${key}`, mediaKind: 'audio' };
  }

  throw new HttpError(400, 'UNSUPPORTED_FORMAT', 'Поддерживаются JPEG, PNG, WebP, MP4, MOV и audio');
}

/**
 * Материал сцены редактора. Живёт в папке своего ролика, чтобы файлы одного
 * проекта было видно вместе и их можно было чистить целиком.
 */
export async function uploadEditorMedia(
  userId: string,
  videoProjectId: string,
  file: Express.Multer.File,
): Promise<{ url: string; key: string; mediaKind: 'image' | 'video' | 'audio'; dimensions?: { width: number; height: number } }> {
  const safeName = `${Date.now()}-${crypto.randomUUID()}`;
  const folder = `user-uploads/editor/${userId}/${videoProjectId}`;

  if (ALLOWED_V3_IMAGE_MIME.has(file.mimetype)) {
    const processed = await validateAndProcessImage(file.buffer);
    const key = `${folder}/${safeName}.${ext(processed.contentType)}`;
    const { url } = await getStorageProvider().upload({ key, body: processed.buffer, contentType: processed.contentType });
    return { url, key, mediaKind: 'image', dimensions: processed.dimensions };
  }

  if (ALLOWED_CHAT_VIDEO_MIME.has(file.mimetype)) {
    const key = `${folder}/${safeName}.${ext(file.mimetype)}`;
    const { url } = await getStorageProvider().upload({ key, body: file.buffer, contentType: file.mimetype });
    return { url, key, mediaKind: 'video' };
  }

  if (ALLOWED_CHAT_AUDIO_MIME.has(file.mimetype)) {
    const key = `${folder}/${safeName}.${ext(file.mimetype)}`;
    const { url } = await getStorageProvider().upload({ key, body: file.buffer, contentType: file.mimetype });
    return { url, key, mediaKind: 'audio' };
  }

  throw new HttpError(400, 'UNSUPPORTED_FORMAT', 'Поддерживаются JPEG, PNG, WebP, MP4, MOV и аудио');
}

/**
 * Вложение к заявке на заказ: исходные фото и референсы.
 *
 * Кладём в отдельную папку пользователя, а не рядом с генерациями: у заявки другой срок
 * жизни — она живёт, пока идёт работа с менеджером, и не подпадает под чистку результатов.
 */
export async function uploadOrderAttachment(
  userId: string,
  file: Express.Multer.File,
): Promise<{ url: string; key: string }> {
  const safeName = `${Date.now()}-${crypto.randomUUID()}`;
  const folder = `user-uploads/orders/${userId}`;

  if (ALLOWED_V3_IMAGE_MIME.has(file.mimetype)) {
    const processed = await validateAndProcessImage(file.buffer);
    const key = `${folder}/${safeName}.${ext(processed.contentType)}`;
    const { url } = await getStorageProvider().upload({ key, body: processed.buffer, contentType: processed.contentType });
    return { url, key };
  }
  if (ALLOWED_CHAT_VIDEO_MIME.has(file.mimetype)) {
    const key = `${folder}/${safeName}.${ext(file.mimetype)}`;
    const { url } = await getStorageProvider().upload({ key, body: file.buffer, contentType: file.mimetype });
    return { url, key };
  }

  throw new HttpError(400, 'UNSUPPORTED_FORMAT', 'Поддерживаются JPEG, PNG, WebP и видео MP4/MOV');
}

export async function uploadSupportAttachment(
  userId: string,
  ticketId: string,
  file: Express.Multer.File,
): Promise<{ url: string; key: string; fileName: string; mimeType: string; fileSize: number; kind: 'IMAGE' | 'FILE' }> {
  if (file.size > MAX_SUPPORT_ATTACHMENT_SIZE) {
    throw new HttpError(413, 'FILE_TOO_LARGE', 'Файл должен быть не тяжелее 25 МБ');
  }

  const fileName = safeFileName(file.originalname);
  const safeTicketId = ticketId.replace(/[^a-zA-Z0-9_-]/g, '_');

  if (ALLOWED_V3_IMAGE_MIME.has(file.mimetype)) {
    const processed = await validateAndProcessImage(file.buffer);
    const key = `support/${userId}/${safeTicketId}/${crypto.randomUUID()}.${ext(processed.contentType)}`;
    const { url } = await getStorageProvider().upload({
      key,
      body: processed.buffer,
      contentType: processed.contentType,
    });
    return {
      url,
      key,
      fileName,
      mimeType: processed.contentType,
      fileSize: processed.buffer.length,
      kind: 'IMAGE',
    };
  }

  if (ALLOWED_SUPPORT_FILE_MIME.has(file.mimetype)) {
    const key = `support/${userId}/${safeTicketId}/${crypto.randomUUID()}.${ext(file.mimetype)}`;
    const { url } = await getStorageProvider().upload({
      key,
      body: file.buffer,
      contentType: file.mimetype,
    });
    return { url, key, fileName, mimeType: file.mimetype, fileSize: file.size, kind: 'FILE' };
  }

  throw new HttpError(400, 'UNSUPPORTED_FORMAT', 'Поддерживаются изображения, PDF, TXT, CSV, DOCX, XLSX и ZIP');
}

export async function deleteFile(key: string): Promise<void> {
  await getStorageProvider().delete(key);
}
