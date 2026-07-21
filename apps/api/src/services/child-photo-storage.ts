import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';

/**
 * Закрытое хранилище исходных фотографий детей (Academy A1).
 *
 * Файлы намеренно лежат ВНЕ каталога uploads, который nginx раздаёт как /static:
 * доступ к фото — только через авторизованный API-эндпоинт, публичных URL нет.
 */

function rootDir(): string {
  const dir = process.env.CHILD_PHOTOS_DIR ?? './private-uploads/child-photos';
  return path.resolve(process.cwd(), dir);
}

function extensionFor(mimeType: string): string {
  if (mimeType.includes('png')) return 'png';
  if (mimeType.includes('webp')) return 'webp';
  return 'jpg';
}

function resolveSafe(storageKey: string): string {
  const root = rootDir();
  const target = path.resolve(root, storageKey.replace(/^[/\\]+/, ''));
  if (!target.startsWith(root + path.sep) && target !== root) {
    throw new Error(`INVALID_CHILD_PHOTO_KEY: ${storageKey}`);
  }
  return target;
}

export async function saveChildPhoto(params: {
  parentId: string;
  childId: string;
  buffer: Buffer;
  mimeType: string;
}): Promise<string> {
  const storageKey = path.posix.join(
    params.parentId,
    params.childId,
    `${crypto.randomUUID()}.${extensionFor(params.mimeType)}`,
  );
  const target = resolveSafe(storageKey);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, params.buffer);
  return storageKey;
}

export async function readChildPhoto(storageKey: string): Promise<Buffer> {
  return fs.readFile(resolveSafe(storageKey));
}

export async function deleteChildPhoto(storageKey: string): Promise<void> {
  await fs.unlink(resolveSafe(storageKey)).catch(() => undefined);
}

/** Каскадная зачистка всех файлов ребёнка (при удалении профиля/аккаунта). */
export async function deleteChildPhotoDir(parentId: string, childId: string): Promise<void> {
  const dir = resolveSafe(path.posix.join(parentId, childId));
  await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
}

// === Референсы AI-персонажа (A2) — то же закрытое хранилище, свой корень ===

function characterRefsRoot(): string {
  const dir = process.env.CHARACTER_REFS_DIR ?? './private-uploads/character-refs';
  return path.resolve(process.cwd(), dir);
}

function resolveCharacterRefSafe(storageKey: string): string {
  const root = characterRefsRoot();
  const target = path.resolve(root, storageKey.replace(/^[/\\]+/, ''));
  if (!target.startsWith(root + path.sep) && target !== root) {
    throw new Error(`INVALID_CHARACTER_REF_KEY: ${storageKey}`);
  }
  return target;
}

export async function readCharacterRef(storageKey: string): Promise<Buffer> {
  return fs.readFile(resolveCharacterRefSafe(storageKey));
}

export async function deleteCharacterRefFile(storageKey: string): Promise<void> {
  await fs.unlink(resolveCharacterRefSafe(storageKey)).catch(() => undefined);
}

export async function deleteCharacterRefDir(parentId: string, childId: string): Promise<void> {
  const dir = resolveCharacterRefSafe(path.posix.join(parentId, childId));
  await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
}
