import { motionTransferBlock } from '../blocks/motion-transfer';
import { StubAIProvider } from '../providers/stub-ai-provider';

function ctx(provider = new StubAIProvider()) {
  return {
    generationId: 'test-generation',
    providerContext: {
      projectId: 'test-project',
      userId: 'test-user',
      blockSlug: 'motion-transfer',
      stepId: 'step_1',
    },
    reportProgress: jest.fn(),
    getAIProvider: () => provider,
    storage: {
      upload: jest.fn(),
      getSignedUrl: jest.fn(),
      delete: jest.fn(),
    },
    logger: {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    },
  };
}

describe('motion-transfer block', () => {
  it('calls provider motionTransfer and returns video output', async () => {
    const provider = new StubAIProvider();
    const spy = jest.spyOn(provider, 'motionTransfer');

    const output = await motionTransferBlock.executor(
      {
        model: 'kling-motion-2.6-std',
        driving_video: 'https://cdn.test/dance.mp4',
        prompt: 'copy the dance',
        duration: 5,
      },
      'https://cdn.test/photo.jpg',
      ctx(provider),
    );

    expect(spy).toHaveBeenCalledWith(expect.objectContaining({
      inputImageUrl: 'https://cdn.test/photo.jpg',
      drivingVideoUrl: 'https://cdn.test/dance.mp4',
      model: 'kling-motion-2.6-std',
      durationSec: 5,
    }));
    expect(output).toEqual(expect.objectContaining({ type: 'video', url: 'stub://motion-transfer.mp4' }));
  });

  it('accepts explicit input_image param', async () => {
    const provider = new StubAIProvider();
    const spy = jest.spyOn(provider, 'motionTransfer');
    await motionTransferBlock.executor(
      {
        model: 'kling-motion-3.0-pro',
        input_image: 'https://cdn.test/edited.jpg',
        driving_video: 'https://cdn.test/ref.mp4',
      },
      'https://cdn.test/original.jpg',
      ctx(provider),
    );
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({
      inputImageUrl: 'https://cdn.test/edited.jpg',
      model: 'kling-motion-3.0-pro',
    }));
  });

  it('validates required driving_video', async () => {
    await expect(
      motionTransferBlock.executor({ model: 'kling-motion-2.6-std' }, 'mock://photo.jpg', ctx()),
    ).rejects.toThrow();
  });
});
