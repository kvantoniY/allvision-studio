import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  deleteAccountPrivateDirectories,
  deleteChildPrivateDirectories,
} from '../utils/private-storage';

const ENV_KEYS = [
  'CHILD_PHOTOS_DIR',
  'CHARACTER_REFS_DIR',
  'CHILD_ASSETS_DIR',
  'ACADEMY_MESSAGES_DIR',
] as const;

let tempRoot = '';
const originalEnv = new Map<string, string | undefined>();

async function writeFixture(root: string, relative: string) {
  const target = path.join(root, ...relative.split('/'));
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, 'private-child-material');
}

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'allvision-a10-delete-'));
  for (const key of ENV_KEYS) {
    originalEnv.set(key, process.env[key]);
    process.env[key] = path.join(tempRoot, key.toLowerCase());
  }
});

afterEach(async () => {
  for (const key of ENV_KEYS) {
    const value = originalEnv.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  originalEnv.clear();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('removes every private child directory and leaves a sibling child intact', async () => {
  for (const key of ENV_KEYS) {
    await writeFixture(process.env[key]!, 'parent-1/child-1/file.bin');
    await writeFixture(process.env[key]!, 'parent-1/child-2/file.bin');
  }

  await deleteChildPrivateDirectories('parent-1', 'child-1');

  for (const key of ENV_KEYS) {
    await expect(fs.stat(path.join(process.env[key]!, 'parent-1', 'child-1'))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(fs.readFile(path.join(process.env[key]!, 'parent-1', 'child-2', 'file.bin'), 'utf8'))
      .resolves.toBe('private-child-material');
  }
});

it('removes all private directories belonging to an account', async () => {
  for (const key of ENV_KEYS) {
    await writeFixture(process.env[key]!, 'parent-1/child-1/file.bin');
    await writeFixture(process.env[key]!, 'parent-2/child-2/file.bin');
  }

  await deleteAccountPrivateDirectories('parent-1');

  for (const key of ENV_KEYS) {
    await expect(fs.stat(path.join(process.env[key]!, 'parent-1'))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(fs.readFile(path.join(process.env[key]!, 'parent-2', 'child-2', 'file.bin'), 'utf8'))
      .resolves.toBe('private-child-material');
  }
});
