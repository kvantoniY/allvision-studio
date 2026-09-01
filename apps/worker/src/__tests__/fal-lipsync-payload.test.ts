/**
 * Лип-синк на fal.
 *
 * Под одним блоком живут две разные задачи, и перепутать их нельзя: модели оживления
 * ждут image_url, модели переозвучки — video_url. Именно на этом услуга и падала: в
 * пайплайне стояла модель, которой прежний провайдер не знал вовсе.
 */
process.env.ALLOW_REAL_FAL_IN_TEST = '1';

import { prisma } from '@allvision/database';
import { FalProvider } from '../providers/fal-provider';

beforeAll(() => {
  jest.spyOn(prisma.project, 'update').mockResolvedValue({} as never);
  jest.spyOn(prisma, '$executeRaw').mockResolvedValue(0 as never);
});

type Submitted = { endpoint: string; input: Record<string, unknown> };

function makeProvider() {
  const provider = new FalProvider({
    apiKey: 'test-key',
    storage: {
      upload: jest.fn(async ({ key }: { key: string }) => ({ key, url: `/static/${key}` })),
      getSignedUrl: jest.fn(),
      delete: jest.fn(),
    } as never,
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  });
  const submitted: Submitted[] = [];
  const client = (provider as unknown as { client: Record<string, unknown> }).client;
  client.submit = jest.fn(async (endpoint: string, input: Record<string, unknown>) => {
    submitted.push({ endpoint, input });
    return { requestId: 'req-1', statusUrl: 'https://queue.fal.run/s', responseUrl: 'https://queue.fal.run/r' };
  });
  client.pollUntilDone = jest.fn(async () => ({
    output: { video: { url: 'https://cdn.fal.test/talk.mp4' } },
    costUsd: 0.5,
    raw: {},
  }));
  client.download = jest.fn(async () => ({ buffer: Buffer.from('video'), contentType: 'video/mp4' }));
  client.getEndpointPricing = jest.fn(async () => undefined);
  return { provider, submitted };
}

const context = { projectId: 'proj-1', userId: 'user-1', blockSlug: 'talking-avatar', stepId: 'step_1' };

describe('лип-синк на fal', () => {
  it('оживляет фотографию: image_url плюс звук', async () => {
    const { provider, submitted } = makeProvider();
    await provider.talkingAvatar({
      imageUrl: 'https://cdn.test/face.jpg',
      audioUrl: 'https://cdn.test/voice.mp3',
      prompt: 'тёплая улыбка',
      model: 'omnihuman-1.5',
      params: { resolution: '1080p' },
      context,
    });

    expect(submitted[0].endpoint).toBe('fal-ai/bytedance/omnihuman/v1.5');
    expect(submitted[0].input.image_url).toBe('https://cdn.test/face.jpg');
    expect(submitted[0].input.audio_url).toBe('https://cdn.test/voice.mp3');
    expect(submitted[0].input.resolution).toBe('1080p');
    // Готового видео у этой ветки быть не должно: модель принимает только фото.
    expect(submitted[0].input.video_url).toBeUndefined();
  });

  it('kling-ai-avatar больше не падает: раньше провайдер такой модели не знал', async () => {
    const { provider, submitted } = makeProvider();
    await provider.talkingAvatar({
      imageUrl: 'https://cdn.test/face.jpg',
      audioUrl: 'https://cdn.test/voice.mp3',
      model: 'kling-ai-avatar',
      context,
    });

    expect(submitted[0].endpoint).toBe('fal-ai/kling-video/v1/pro/ai-avatar');
    expect(submitted[0].input.image_url).toBe('https://cdn.test/face.jpg');
  });

  it('InfiniTalk получает промпт даже когда его не задали: схема требует непустой', async () => {
    const { provider, submitted } = makeProvider();
    await provider.talkingAvatar({
      imageUrl: 'https://cdn.test/face.jpg',
      audioUrl: 'https://cdn.test/voice.mp3',
      model: 'infinitalk',
      context,
    });

    expect(submitted[0].endpoint).toBe('fal-ai/infinitalk');
    expect(String(submitted[0].input.prompt ?? '')).not.toHaveLength(0);
    expect(submitted[0].input.resolution).toBe('480p');
  });

  it('переозвучка берёт готовое видео и подставляет вариант модели', async () => {
    const { provider, submitted } = makeProvider();
    await provider.talkingAvatar({
      imageUrl: 'https://cdn.test/frame.jpg',
      audioUrl: 'https://cdn.test/voice.mp3',
      model: 'sync-lipsync-2-pro',
      params: { video_url: 'https://cdn.test/clip.mp4' },
      context,
    });

    expect(submitted[0].endpoint).toBe('fal-ai/sync-lipsync/v2');
    expect(submitted[0].input.video_url).toBe('https://cdn.test/clip.mp4');
    expect(submitted[0].input.model).toBe('lipsync-2-pro');
    // Кадр в эту ветку не попадает: модель ждёт ролик, а не картинку.
    expect(submitted[0].input.image_url).toBeUndefined();
  });

  it('переозвучка без видео отказывает понятным текстом, а не 422 от провайдера', async () => {
    const { provider, submitted } = makeProvider();
    await expect(provider.talkingAvatar({
      imageUrl: 'https://cdn.test/frame.jpg',
      audioUrl: 'https://cdn.test/voice.mp3',
      model: 'latentsync',
      context,
    })).rejects.toThrow(/готовое видео/i);

    expect(submitted).toHaveLength(0);
  });
});
