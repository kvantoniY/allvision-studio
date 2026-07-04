/**
 * Проверяет маппинг omni-референсов в fal-провайдере:
 *  - Seedance reference-to-video: video_urls МАССИВОМ (не video_url!), generate_audio=false по
 *    умолчанию, duration строкой. Регресс: video_url вместо video_urls -> Seedance молча игнорировал
 *    референс-видео и генерил танец «из головы» с собственной музыкой.
 *  - Kling O3 Reference V2V: единственный video_url + image_urls.
 *  - DreamActor v2 (motion transfer): минимальный payload без промпта.
 */
process.env.ALLOW_REAL_FAL_IN_TEST = '1';

import { prisma } from '@allvision/database';
import { FalProvider } from '../providers/fal-provider';

// Тест не требует БД: перехватываем побочные записи (aiProviderJobId, AIUsageLog).
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
    return { requestId: 'req-1', statusUrl: 'https://queue.fal.run/status', responseUrl: 'https://queue.fal.run/response' };
  });
  client.pollUntilDone = jest.fn(async () => ({
    output: { video: { url: 'https://cdn.fal.test/result.mp4' } },
    costUsd: 0.42,
    raw: {},
  }));
  client.download = jest.fn(async () => ({ buffer: Buffer.from('video'), contentType: 'video/mp4' }));
  client.getEndpointPricing = jest.fn(async () => undefined);
  return { provider, submitted };
}

const context = {
  projectId: 'proj-1',
  userId: 'user-1',
  blockSlug: 'trend-video-transfer',
  stepId: 'step_1',
};

describe('FalProvider reference payload mapping', () => {
  it('sends video_urls array, generate_audio=false and string duration to Seedance reference-to-video', async () => {
    const { provider, submitted } = makeProvider();
    await provider.textToVideo({
      prompt: 'dance like @Video1',
      durationSec: 10,
      model: 'seedance-2-omni',
      params: {
        image_urls: ['https://cdn.test/cat.jpg'],
        video_urls: ['https://cdn.test/trend.mp4'],
        aspect_ratio: 'auto',
      },
      context,
    });

    expect(submitted).toHaveLength(1);
    expect(submitted[0].endpoint).toBe('bytedance/seedance-2.0/reference-to-video');
    expect(submitted[0].input.video_urls).toEqual(['https://cdn.test/trend.mp4']);
    expect(submitted[0].input.video_url).toBeUndefined();
    expect(submitted[0].input.image_urls).toEqual(['https://cdn.test/cat.jpg']);
    expect(submitted[0].input.generate_audio).toBe(false);
    expect(submitted[0].input.duration).toBe('10');
  });

  it('sends single video_url to Kling O3 reference V2V and keeps keep_audio passthrough', async () => {
    const { provider, submitted } = makeProvider();
    await provider.textToVideo({
      prompt: 'use @Video1 and @Image1',
      durationSec: 8,
      model: 'kling-o3-omni',
      params: {
        images: ['https://cdn.test/cat.jpg'],
        video: 'https://cdn.test/trend.mp4',
        keep_audio: true,
      },
      context,
    });

    expect(submitted).toHaveLength(1);
    expect(submitted[0].endpoint).toBe('fal-ai/kling-video/o3/pro/video-to-video/reference');
    expect(submitted[0].input.video_url).toBe('https://cdn.test/trend.mp4');
    expect(submitted[0].input.video_urls).toBeUndefined();
    expect(submitted[0].input.image_urls).toEqual(['https://cdn.test/cat.jpg']);
    expect(submitted[0].input.keep_audio).toBe(true);
    // generate_audio не относится к Kling O3 и не должен форситься.
    expect(submitted[0].input.generate_audio).toBeUndefined();
    // Kling O3 v2v reference требует duration строковым enum '3'..'15' (422 на числе, прод-инцидент).
    expect(submitted[0].input.duration).toBe('8');
  });

  it('maps motion transfer via Wan 2.7 reference-to-video to reference_*_urls with integer duration', async () => {
    const { provider, submitted } = makeProvider();
    await provider.motionTransfer({
      inputImageUrl: 'https://cdn.test/cat.jpg',
      drivingVideoUrl: 'https://cdn.test/dance.mp4',
      durationSec: 12,
      model: 'wan-2.7-reference',
      params: { aspect_ratio: 'auto' },
      context,
    });

    expect(submitted).toHaveLength(1);
    expect(submitted[0].endpoint).toBe('fal-ai/wan/v2.7/reference-to-video');
    expect(submitted[0].input.reference_image_urls).toEqual(['https://cdn.test/cat.jpg']);
    expect(submitted[0].input.reference_video_urls).toEqual(['https://cdn.test/dance.mp4']);
    expect(submitted[0].input.image_urls).toBeUndefined();
    expect(submitted[0].input.video_urls).toBeUndefined();
    // duration integer, clamp до 10; aspect 'auto' у Wan 2.7 не существует — опускается.
    expect(submitted[0].input.duration).toBe(10);
    expect(submitted[0].input.aspect_ratio).toBeUndefined();
    expect(typeof submitted[0].input.prompt).toBe('string');
  });

  it('sends minimal payload without prompt to DreamActor v2', async () => {
    const { provider, submitted } = makeProvider();
    await provider.motionTransfer({
      inputImageUrl: 'https://cdn.test/cat.jpg',
      drivingVideoUrl: 'https://cdn.test/dance.mp4',
      prompt: 'should not be sent',
      durationSec: 10,
      model: 'dreamactor-v2',
      params: {},
      context,
    });

    expect(submitted).toHaveLength(1);
    expect(submitted[0].endpoint).toBe('fal-ai/bytedance/dreamactor/v2');
    expect(submitted[0].input.image_url).toBe('https://cdn.test/cat.jpg');
    expect(submitted[0].input.video_url).toBe('https://cdn.test/dance.mp4');
    expect(submitted[0].input.prompt).toBeUndefined();
    expect(submitted[0].input.trim_first_second).toBe(true);
  });

  it('sends subject_type to SCAIL-2', async () => {
    const { provider, submitted } = makeProvider();
    await provider.motionTransfer({
      inputImageUrl: 'https://cdn.test/cat.jpg',
      drivingVideoUrl: 'https://cdn.test/dance.mp4',
      prompt: 'the cat dances',
      durationSec: 8,
      model: 'scail-2',
      params: { subject_type: 'animal', resolution: '720p' },
      context,
    });

    expect(submitted).toHaveLength(1);
    expect(submitted[0].endpoint).toBe('fal-ai/scail-2');
    expect(submitted[0].input.subject_type).toBe('animal');
    expect(submitted[0].input.mode).toBe('animation');
    expect(submitted[0].input.resolution).toBe('704p');
    expect(submitted[0].input.prompt).toBe('the cat dances');
  });
});
