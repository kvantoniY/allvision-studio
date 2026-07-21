import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { readOutputBytes, toDataUri } from '../processors/character-profile';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

describe('character-profile: readOutputBytes', () => {
  it('decodes data URI', async () => {
    const uri = `data:image/png;base64,${PNG.toString('base64')}`;
    const out = await readOutputBytes(uri);
    expect(out.buffer.equals(PNG)).toBe(true);
    expect(out.cleanup).toBeUndefined();
  });

  it('returns placeholder for stub:// (test provider)', async () => {
    const out = await readOutputBytes('stub://edited-image.jpg');
    expect(out.buffer.length).toBeGreaterThan(0);
  });

  it('reads local /static output and cleanup removes the public copy', async () => {
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'char-test-'));
    const prev = process.env.UPLOADS_DIR;
    process.env.UPLOADS_DIR = tmpRoot;
    try {
      const key = 'outputs/u1/p1/portrait/result.jpg';
      const target = path.join(tmpRoot, ...key.split('/'));
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, PNG);

      const out = await readOutputBytes(`http://localhost:4000/static/${key}`);
      expect(out.buffer.equals(PNG)).toBe(true);

      await out.cleanup?.();
      await expect(fs.access(target)).rejects.toBeTruthy();
    } finally {
      process.env.UPLOADS_DIR = prev;
      await fs.rm(tmpRoot, { recursive: true, force: true });
    }
  });

  it('rejects /static path traversal', async () => {
    await expect(readOutputBytes('http://x/static/../../etc/passwd')).rejects.toThrow('INVALID_OUTPUT_KEY');
  });
});

describe('character-profile: toDataUri', () => {
  it('produces a jpeg data URI from an image buffer', async () => {
    const uri = await toDataUri(PNG);
    expect(uri.startsWith('data:image/jpeg;base64,')).toBe(true);
  });
});
