import { promises as fs } from 'fs';
import path from 'path';
import { resolveWorkspacePath } from './paths';

/**
 * Закрытые хранилища Academy (детские данные). Файлы лежат ВНЕ uploads/ и не
 * раздаются nginx как /static — доступ только через авторизованные API-эндпоинты.
 * Worker имеет тот же bind mount, что и api (/app/private-uploads на проде).
 */

export function childPhotosRoot(): string {
  return resolveWorkspacePath(process.env.CHILD_PHOTOS_DIR ?? './private-uploads/child-photos');
}

export function characterRefsRoot(): string {
  return resolveWorkspacePath(process.env.CHARACTER_REFS_DIR ?? './private-uploads/character-refs');
}

export function childAssetsRoot(): string {
  return resolveWorkspacePath(process.env.CHILD_ASSETS_DIR ?? './private-uploads/child-assets');
}

export function academyMessagesRoot(): string {
  return resolveWorkspacePath(process.env.ACADEMY_MESSAGES_DIR ?? './private-uploads/academy-messages');
}

function resolveSafe(root: string, storageKey: string): string {
  const target = path.resolve(root, storageKey.replace(/^[/\\]+/, ''));
  if (!target.startsWith(root + path.sep) && target !== root) {
    throw new Error(`INVALID_PRIVATE_KEY: ${storageKey}`);
  }
  return target;
}

export async function readChildPhoto(storageKey: string): Promise<Buffer> {
  return fs.readFile(resolveSafe(childPhotosRoot(), storageKey));
}

export async function writeCharacterRef(storageKey: string, buffer: Buffer): Promise<void> {
  const target = resolveSafe(characterRefsRoot(), storageKey);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, buffer);
}

export async function readCharacterRef(storageKey: string): Promise<Buffer> {
  return fs.readFile(resolveSafe(characterRefsRoot(), storageKey));
}

export async function deleteCharacterRef(storageKey: string): Promise<void> {
  await fs.unlink(resolveSafe(characterRefsRoot(), storageKey)).catch(() => undefined);
}

export async function writeChildAsset(storageKey: string, buffer: Buffer): Promise<void> {
  const target = resolveSafe(childAssetsRoot(), storageKey);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, buffer);
}

export async function deleteChildAsset(storageKey: string): Promise<void> {
  await fs.unlink(resolveSafe(childAssetsRoot(), storageKey)).catch(() => undefined);
}

async function removePrivateDirectory(root: string, storageKey: string): Promise<void> {
  await fs.rm(resolveSafe(root, storageKey), { recursive: true, force: true });
}

export async function deleteChildPrivateDirectories(parentId: string, childId: string): Promise<void> {
  const key = path.posix.join(parentId, childId);
  await Promise.all([
    removePrivateDirectory(childPhotosRoot(), key),
    removePrivateDirectory(characterRefsRoot(), key),
    removePrivateDirectory(childAssetsRoot(), key),
    removePrivateDirectory(academyMessagesRoot(), key),
  ]);
}

export async function deleteAccountPrivateDirectories(parentId: string): Promise<void> {
  await Promise.all([
    removePrivateDirectory(childPhotosRoot(), parentId),
    removePrivateDirectory(characterRefsRoot(), parentId),
    removePrivateDirectory(childAssetsRoot(), parentId),
    removePrivateDirectory(academyMessagesRoot(), parentId),
  ]);
}
