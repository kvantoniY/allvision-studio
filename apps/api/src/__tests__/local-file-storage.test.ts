import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { LocalFileStorage } from '../providers/local-file-storage';

describe('LocalFileStorage', () => {
  let rootDir: string;
  let storage: LocalFileStorage;

  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lfs-test-'));
    storage = new LocalFileStorage({
      rootDir,
      publicBaseUrl: 'http://localhost:4000/static',
    });
  });

  afterEach(() => {
    fs.rmSync(rootDir, { recursive: true, force: true });
  });

  it('uploads buffer and returns public URL', async () => {
    const body = Buffer.from('hello');
    const result = await storage.upload({ key: 'a/b/c.txt', body, contentType: 'text/plain' });

    expect(result.key).toBe('a/b/c.txt');
    expect(result.url).toBe('http://localhost:4000/static/a/b/c.txt');
    expect(fs.readFileSync(path.join(rootDir, 'a', 'b', 'c.txt')).toString()).toBe('hello');
  });

  it('creates nested directories on upload', async () => {
    await storage.upload({
      key: 'deep/nested/folder/file.bin',
      body: Buffer.from([1, 2, 3]),
      contentType: 'application/octet-stream',
    });
    expect(fs.existsSync(path.join(rootDir, 'deep', 'nested', 'folder', 'file.bin'))).toBe(true);
  });

  it('has() returns boolean correctly', async () => {
    expect(await storage.has('missing.txt')).toBe(false);
    await storage.upload({ key: 'x.txt', body: Buffer.from('1'), contentType: 'text/plain' });
    expect(await storage.has('x.txt')).toBe(true);
  });

  it('delete() removes file and is idempotent', async () => {
    await storage.upload({ key: 'd.txt', body: Buffer.from('1'), contentType: 'text/plain' });
    await storage.delete('d.txt');
    expect(fs.existsSync(path.join(rootDir, 'd.txt'))).toBe(false);
    await expect(storage.delete('d.txt')).resolves.toBeUndefined();
  });

  it('rejects path traversal keys', async () => {
    await expect(
      storage.upload({ key: '../escape.txt', body: Buffer.from('x'), contentType: 'text/plain' }),
    ).rejects.toThrow(/INVALID_KEY/);
  });
});
