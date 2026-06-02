import { trendVideoTransferBlock } from '../blocks/trend-video-transfer';
import { StubAIProvider } from '../providers/stub-ai-provider';

function ctx(provider = new StubAIProvider()) {
  return {
    generationId: 'test-generation',
    providerContext: {
      projectId: 'test-project',
      userId: 'test-user',
      blockSlug: 'trend-video-transfer',
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

describe('trend-video-transfer block', () => {
  it('runs single-person face swap', async () => {
    const provider = new StubAIProvider();
    const spy = jest.spyOn(provider, 'faceSwapVideo');

    const output = await trendVideoTransferBlock.executor(
      {
        mode: 'face_swap',
        people_count: 'one',
        reference_video: 'https://cdn.test/trend.mp4',
        primary_photo: 'https://cdn.test/person.jpg',
        duration: 10,
      },
      undefined,
      ctx(provider),
    );

    expect(spy).toHaveBeenCalledWith(expect.objectContaining({
      swapImageUrl: 'https://cdn.test/person.jpg',
      targetVideoUrl: 'https://cdn.test/trend.mp4',
      model: 'qubico-video-toolkit',
    }));
    expect(output).toEqual(expect.objectContaining({ type: 'video', url: 'stub://face-swap.mp4' }));
  });

  it('runs two-person face swap sequentially', async () => {
    const provider = new StubAIProvider();
    const spy = jest.spyOn(provider, 'faceSwapVideo');

    await trendVideoTransferBlock.executor(
      {
        mode: 'face_swap',
        people_count: 'two',
        reference_video: 'https://cdn.test/duo.mp4',
        primary_photo: 'https://cdn.test/left.jpg',
        secondary_photo: 'https://cdn.test/right.jpg',
      },
      undefined,
      ctx(provider),
    );

    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy.mock.calls[0][0]).toEqual(expect.objectContaining({
      swapImageUrl: 'https://cdn.test/left.jpg',
      targetVideoUrl: 'https://cdn.test/duo.mp4',
    }));
    expect(spy.mock.calls[1][0]).toEqual(expect.objectContaining({
      swapImageUrl: 'https://cdn.test/right.jpg',
      targetVideoUrl: 'stub://face-swap.mp4',
    }));
  });

  it('runs single-person motion transfer', async () => {
    const provider = new StubAIProvider();
    const spy = jest.spyOn(provider, 'motionTransfer');

    const output = await trendVideoTransferBlock.executor(
      {
        mode: 'motion_transfer',
        people_count: 'one',
        reference_video: 'https://cdn.test/dance.mp4',
        primary_photo: 'https://cdn.test/person.jpg',
        duration: 5,
      },
      undefined,
      ctx(provider),
    );

    expect(spy).toHaveBeenCalledWith(expect.objectContaining({
      inputImageUrl: 'https://cdn.test/person.jpg',
      drivingVideoUrl: 'https://cdn.test/dance.mp4',
      model: 'kling-motion-3.0-std',
    }));
    expect(output).toEqual(expect.objectContaining({ type: 'video', url: 'stub://motion-transfer.mp4' }));
  });
});
