import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { validateAndProcessImage, uploadUserImage } from '../services/file-service';
import { _resetProvidersForTests } from '../providers';

describe('file-service', () => {
  let tmpDir: string;
  let originalUploads: string | undefined;
  let originalApiUrl: string | undefined;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fs-test-'));
    originalUploads = process.env.UPLOADS_DIR;
    originalApiUrl = process.env.PUBLIC_API_URL;
    process.env.UPLOADS_DIR = tmpDir;
    process.env.PUBLIC_API_URL = 'http://test.local:4000';
    _resetProvidersForTests();
  });

  afterAll(() => {
    process.env.UPLOADS_DIR = originalUploads;
    process.env.PUBLIC_API_URL = originalApiUrl;
    _resetProvidersForTests();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('validates valid PNG and returns dimensions', async () => {
    const png = await sharp({
      create: { width: 200, height: 100, channels: 3, background: '#ff0000' },
    })
      .png()
      .toBuffer();
    const result = await validateAndProcessImage(png);
    expect(result.contentType).toBe('image/png');
    expect(result.dimensions).toEqual({ width: 200, height: 100 });
  });

  it('resizes images larger than 4000px on the longest side', async () => {
    const big = await sharp({
      create: { width: 6000, height: 3000, channels: 3, background: '#00ff00' },
    })
      .jpeg()
      .toBuffer();
    const result = await validateAndProcessImage(big);
    expect(Math.max(result.dimensions.width, result.dimensions.height)).toBe(4000);
    expect(result.contentType).toBe('image/jpeg');
  });

  it('rejects non-image buffers', async () => {
    await expect(validateAndProcessImage(Buffer.from('this is not an image'))).rejects.toThrow();
  });

  it('uploadUserImage stores the file and returns URL', async () => {
    const png = await sharp({
      create: { width: 10, height: 10, channels: 3, background: '#0000ff' },
    })
      .png()
      .toBuffer();
    const result = await uploadUserImage('user_test_1', png, 'image/png');
    expect(result.url).toMatch(/^http:\/\/test\.local:4000\/static\/user-uploads\/user_test_1\//);
    const onDisk = path.resolve(tmpDir, result.key);
    expect(fs.existsSync(onDisk)).toBe(true);
  });
});
