import sharp from 'sharp';
import { academyReferenceToDataUri, prepareAcademyImage } from '../processors/academy-generation';

describe('academy generation image utilities', () => {
  it('prepares a private character reference as a redacted-friendly data URI', async () => {
    const source = await sharp({ create: { width: 4, height: 3, channels: 3, background: '#f97316' } }).png().toBuffer();
    const uri = await academyReferenceToDataUri(source);
    expect(uri).toMatch(/^data:image\/jpeg;base64,/);
  });

  it('normalizes ordinary outputs to JPEG', async () => {
    const source = await sharp({ create: { width: 5, height: 4, channels: 3, background: '#ffffff' } }).png().toBuffer();
    const result = await prepareAcademyImage(source, false);
    expect(result.mimeType).toBe('image/jpeg');
    expect(result.extension).toBe('jpg');
    expect(result.width).toBe(5);
    expect(result.height).toBe(4);
  });

  it('keeps transparent outputs as PNG with alpha', async () => {
    const source = await sharp({ create: { width: 3, height: 2, channels: 4, background: { r: 1, g: 2, b: 3, alpha: 0.4 } } }).png().toBuffer();
    const result = await prepareAcademyImage(source, true);
    const metadata = await sharp(result.buffer).metadata();
    expect(result.mimeType).toBe('image/png');
    expect(metadata.hasAlpha).toBe(true);
  });
});
