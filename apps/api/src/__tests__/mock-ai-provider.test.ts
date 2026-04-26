import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { LocalFileStorage } from '../providers/local-file-storage';
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { MockAIProvider } from '../../../worker/src/providers/mock-ai-provider';

async function makeJpeg(seed: number): Promise<Buffer> {
  return sharp({
    create: {
      width: 64,
      height: 64,
      channels: 3,
      background: { r: seed % 255, g: 50, b: 100 },
    },
  })
    .jpeg()
    .toBuffer();
}

describe('MockAIProvider', () => {
  let workDir: string;
  let demoAssets: string;
  let storageRoot: string;
  let storage: LocalFileStorage;
  let provider: MockAIProvider;

  beforeEach(async () => {
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mock-ai-'));
    demoAssets = path.join(workDir, 'demo-assets');
    storageRoot = path.join(workDir, 'uploads');
    fs.mkdirSync(path.join(demoAssets, 'photo-restore'), { recursive: true });
    fs.mkdirSync(path.join(demoAssets, 'photo-animate'), { recursive: true });
    fs.mkdirSync(path.join(demoAssets, 'trends'), { recursive: true });
    fs.mkdirSync(path.join(demoAssets, 'fairy-tales'), { recursive: true });

    storage = new LocalFileStorage({
      rootDir: storageRoot,
      publicBaseUrl: 'http://test/static',
    });

    provider = new MockAIProvider({
      storageProvider: storage,
      demoAssetsRoot: demoAssets,
      minDurationMs: 50,
      maxDurationMs: 60,
    });
  });

  afterEach(() => {
    fs.rmSync(workDir, { recursive: true, force: true });
  });

  it('throws DEMO_ASSETS_EMPTY when photo-restore folder is empty', async () => {
    await expect(
      provider.restorePhoto({ imageUrl: 'http://x/y.jpg', config: {} }),
    ).rejects.toThrow(/DEMO_ASSETS_EMPTY/);
  });

  it('restorePhoto + getJobStatus eventually completes with a real URL', async () => {
    const buf = await makeJpeg(1);
    fs.writeFileSync(path.join(demoAssets, 'photo-restore', 'restore-1.jpg'), buf);

    const handle = await provider.restorePhoto({ imageUrl: 'http://x/y.jpg', config: {} });
    expect(handle.providerJobId).toBeTruthy();

    // Ждём дольше maxDurationMs.
    await new Promise((r) => setTimeout(r, 120));
    const status = await provider.getJobStatus(handle);
    expect(status.status).toBe('completed');
    expect(status.progress).toBe(100);
    expect(status.resultType).toBe('image');
    expect(status.resultUrl).toMatch(/\/static\/results\/mock\//);

    const key = status.resultUrl!.split('/static/')[1];
    expect(fs.existsSync(path.join(storageRoot, key))).toBe(true);
  });

  it('does not re-upload result on repeated getJobStatus (caches URL)', async () => {
    const buf = await makeJpeg(2);
    fs.writeFileSync(path.join(demoAssets, 'photo-restore', 'restore-1.jpg'), buf);

    const handle = await provider.restorePhoto({ imageUrl: 'http://x/y.jpg', config: {} });
    await new Promise((r) => setTimeout(r, 120));
    const a = await provider.getJobStatus(handle);

    const dir = path.join(storageRoot, 'results', 'mock');
    const filesAfterFirst = fs.readdirSync(dir);

    const b = await provider.getJobStatus(handle);
    const filesAfterSecond = fs.readdirSync(dir);

    expect(a.resultUrl).toBe(b.resultUrl);
    expect(filesAfterSecond).toEqual(filesAfterFirst);
  });

  it('generateFairyTaleScript replaces placeholders and returns valid structure', async () => {
    const template = {
      title: 'Сказка про {{childName}}',
      moral: 'Урок: {{moralLesson}}',
      durationMinutes: 3,
      scenes: [
        {
          number: 1,
          description: '{{childName}} ({{childAge}} лет) идёт. {{additionalDetails}}',
          dialogue: 'Hi',
          visualCues: 'sun',
        },
      ],
    };
    fs.writeFileSync(
      path.join(demoAssets, 'fairy-tales', 'template-x.json'),
      JSON.stringify(template),
    );

    const script = await provider.generateFairyTaleScript({
      childName: 'Маша',
      childAge: 5,
      moralLesson: 'быть добрым',
      additionalDetails: 'и улыбается',
      durationMinutes: 3,
    });

    expect(script.title).toBe('Сказка про Маша');
    expect(script.moral).toBe('Урок: быть добрым');
    expect(script.scenes[0].description).toBe('Маша (5 лет) идёт. и улыбается');
    expect(script.tokensCost).toBe(5);
  });

  it('generateFairyTaleScript handles empty additionalDetails', async () => {
    const template = {
      title: 't',
      moral: 'm',
      durationMinutes: 3,
      scenes: [{ number: 1, description: 'before {{additionalDetails}} after', visualCues: '' }],
    };
    fs.writeFileSync(
      path.join(demoAssets, 'fairy-tales', 'template-y.json'),
      JSON.stringify(template),
    );

    const script = await provider.generateFairyTaleScript({
      childName: 'X',
      childAge: 4,
      moralLesson: 'm',
      durationMinutes: 3,
    });

    expect(script.scenes[0].description).toBe('before  after');
  });

  it('throws JOB_NOT_FOUND for unknown handle', async () => {
    await expect(provider.getJobStatus({ providerJobId: 'nope' })).rejects.toThrow('JOB_NOT_FOUND');
  });
});
