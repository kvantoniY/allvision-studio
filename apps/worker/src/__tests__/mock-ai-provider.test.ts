import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { StorageProvider } from '@allvision/shared';
import { MockAIProvider } from '../providers/mock-ai-provider';

function memoryStorage(): StorageProvider & { uploads: Array<{ key: string; contentType: string }> } {
  const uploads: Array<{ key: string; contentType: string }> = [];
  return {
    uploads,
    async upload(params) {
      uploads.push({ key: params.key, contentType: params.contentType });
      return { key: params.key, url: `https://example.com/static/${params.key}` };
    },
    async getSignedUrl(key) {
      return `https://example.com/static/${key}`;
    },
    async delete() {},
  };
}

describe('MockAIProvider demo-assets fallback', () => {
  let workDir: string;

  beforeEach(() => {
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'worker-mock-ai-'));
  });

  afterEach(() => {
    fs.rmSync(workDir, { recursive: true, force: true });
  });

  it('generates a black mp4 fallback when video demo-assets are missing', async () => {
    const storage = memoryStorage();
    const provider = new MockAIProvider({
      storageProvider: storage,
      demoAssetsRoot: path.join(workDir, 'missing-demo-assets'),
      minDurationMs: 1,
      maxDurationMs: 1,
      fallbackVideoFactory(filePath) {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, Buffer.from('fake mp4'));
      },
    });

    const result = await provider.imageToVideo({
      imageUrl: 'https://example.com/input.png',
      model: 'mock',
      durationSec: 1,
      context: {
        projectId: 'project-1',
        userId: 'user-1',
        blockSlug: 'image-to-video',
        stepId: 'step-1',
      },
    });

    expect(result.outputUrl).toBe('https://example.com/static/outputs/user-1/project-1/step-1/result.mp4');
    expect(result.meta).toMatchObject({ provider: 'mock', resultType: 'video', service: 'photo-animate' });
    expect(storage.uploads).toEqual([
      { key: 'outputs/user-1/project-1/step-1/result.mp4', contentType: 'video/mp4' },
    ]);
  });

  it('returns private image output as data URI without touching public storage', async () => {
    const demoRoot = path.join(workDir, 'demo-assets');
    const imageDir = path.join(demoRoot, 'photo-restore');
    fs.mkdirSync(imageDir, { recursive: true });
    fs.writeFileSync(path.join(imageDir, 'sample.png'), Buffer.from('private-image'));
    const storage = memoryStorage();
    const provider = new MockAIProvider({ storageProvider: storage, demoAssetsRoot: demoRoot });

    const result = await provider.falRaw({
      endpoint: 'fal-ai/birefnet/v2',
      kind: 'image',
      falInput: {},
      context: {
        projectId: 'private-project',
        userId: 'teacher-1',
        blockSlug: 'academy-generation',
        stepId: 'remove-background',
        privateOutput: true,
      },
    });

    expect(result.outputUrl).toMatch(/^data:image\/png;base64,/);
    expect(storage.uploads).toEqual([]);
  });
});
