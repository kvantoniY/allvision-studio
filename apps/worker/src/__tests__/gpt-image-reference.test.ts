import sharp from 'sharp';
import { __piapiPayloadBuildersForTests } from '../providers/piapi-provider';

const { normalizeGptImageReference } = __piapiPayloadBuildersForTests;

const logger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

afterEach(() => jest.clearAllMocks());

describe('normalizeGptImageReference (gpt-image upload size guard)', () => {
  it('downscales and re-encodes a large PNG reference to a small JPEG', async () => {
    // Simulate a heavy raw phone upload: large, lossless PNG.
    const bigPng = await sharp({
      create: { width: 4000, height: 3000, channels: 3, background: { r: 120, g: 80, b: 40 } },
    })
      .png()
      .toBuffer();

    const result = await normalizeGptImageReference({ buffer: bigPng, contentType: 'image/png' }, logger);

    expect(result.contentType).toBe('image/jpeg');
    // Body must shrink dramatically so the VM->PiAPI multipart upload no longer resets.
    expect(result.buffer.length).toBeLessThan(bigPng.length);
    const meta = await sharp(result.buffer).metadata();
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBeLessThanOrEqual(1536);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('keeps the original bytes when re-encoding would not shrink them', async () => {
    const tinyJpeg = await sharp({
      create: { width: 64, height: 64, channels: 3, background: { r: 10, g: 10, b: 10 } },
    })
      .jpeg({ quality: 80 })
      .toBuffer();

    const result = await normalizeGptImageReference({ buffer: tinyJpeg, contentType: 'image/jpeg' }, logger);

    expect(result.buffer).toBe(tinyJpeg);
  });

  it('falls back to original bytes for non-image data instead of throwing', async () => {
    const notAnImage = Buffer.from('this is not an image', 'utf8');

    const result = await normalizeGptImageReference({ buffer: notAnImage, contentType: 'image/png' }, logger);

    expect(result.buffer).toBe(notAnImage);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('throws a clear error when an unprocessable reference would exceed the hard upload limit', async () => {
    // 5 MB мусора, который sharp не может перекодировать: раньше такое тело уходило в PiAPI
    // и гарантированно обрывалось на ~15s; теперь падаем сразу с понятным кодом.
    const hugeGarbage = Buffer.alloc(5 * 1024 * 1024, 7);

    await expect(
      normalizeGptImageReference({ buffer: hugeGarbage, contentType: 'image/png' }, logger),
    ).rejects.toMatchObject({ code: 'GPT_IMAGE_REF_UNPROCESSABLE' });
    expect(logger.warn).toHaveBeenCalled();
  });
});
