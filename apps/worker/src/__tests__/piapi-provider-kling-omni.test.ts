jest.mock('../providers/usage-limits', () => ({
  createAIUsageLog: jest.fn().mockResolvedValue(undefined),
}));

import { PiAPIProvider } from '../providers/piapi-provider';

const logger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

afterEach(() => {
  delete process.env.ALLOW_REAL_PIAPI_IN_TEST;
  jest.clearAllMocks();
});

describe('PiAPI provider Kling Omni references', () => {
  it('publishes references under images and video keys', async () => {
    process.env.ALLOW_REAL_PIAPI_IN_TEST = 'true';
    const storage = {
      upload: jest.fn().mockResolvedValue({ url: 'https://local.test/result.mp4', key: 'outputs/result.mp4' }),
      getSignedUrl: jest.fn(),
      delete: jest.fn(),
    };
    const publisher = {
      publishImageUrl: jest.fn(async (url: string) => ({ publicUrl: url.replace('https://input.test', 'https://public.test') })),
      publishFileUrl: jest.fn(async (url: string) => ({ publicUrl: url.replace('https://input.test', 'https://public.test') })),
    };
    const provider = new PiAPIProvider({
      apiKey: 'test-key',
      dailyCapUsd: 999,
      balanceMinUsd: 0,
      storage,
      publisher: publisher as never,
      logger,
    });
    const client = {
      createTask: jest.fn().mockResolvedValue({ taskId: 'kling-omni-unit', raw: {} }),
      pollUntilDone: jest.fn().mockResolvedValue({
        taskId: 'kling-omni-unit',
        status: 'completed',
        outputUrl: 'https://piapi.test/output.mp4',
        actualCostUsd: 0.25,
        raw: {},
      }),
      download: jest.fn().mockResolvedValue({ buffer: Buffer.from('video'), contentType: 'video/mp4' }),
    };
    (provider as unknown as { client: typeof client }).client = client;

    await provider.textToVideo({
      prompt: 'Use @image_1, @image_2 and @video.',
      durationSec: 10,
      model: 'kling-3-omni',
      params: {
        images: ['https://input.test/left.jpg', 'https://input.test/right.jpg'],
        video: 'https://input.test/ref.mp4',
        aspect_ratio: '9:16',
        resolution: '720p',
        enable_audio: false,
      },
      context: {
        projectId: 'kling-omni-project',
        userId: 'kling-omni-user',
        blockSlug: 'trend-video-transfer',
        stepId: 'step_kling',
      },
    });

    expect(publisher.publishImageUrl).toHaveBeenCalledTimes(2);
    expect(publisher.publishFileUrl).toHaveBeenCalledWith('https://input.test/ref.mp4', 1, 'video/mp4');
    expect(client.createTask).toHaveBeenCalledWith({
      model: 'kling',
      task_type: 'omni_video_generation',
      input: expect.objectContaining({
        prompt: 'Use @image_1, @image_2 and @video.',
        images: ['https://public.test/left.jpg', 'https://public.test/right.jpg'],
        video: 'https://public.test/ref.mp4',
        duration: 10,
        aspect_ratio: '9:16',
        resolution: '720p',
        version: '3.0',
        enable_audio: false,
      }),
    });
  });
});
