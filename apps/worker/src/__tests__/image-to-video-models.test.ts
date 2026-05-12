import { imageToVideoBlock } from '../blocks/image-to-video';
import { StubAIProvider } from '../providers/stub-ai-provider';

function ctx(provider = new StubAIProvider()) {
  return {
    generationId: 'test-generation',
    providerContext: {
      projectId: 'test-project',
      userId: 'test-user',
      blockSlug: 'image-to-video',
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

describe('image-to-video model expansion', () => {
  it('passes Kling 3.0 model to provider', async () => {
    const provider = new StubAIProvider();
    const spy = jest.spyOn(provider, 'imageToVideo');
    await imageToVideoBlock.executor(
      { model: 'kling-3-pro', duration: 5, prompt: 'soft motion' },
      'https://cdn.test/photo.jpg',
      ctx(provider),
    );
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({
      imageUrl: 'https://cdn.test/photo.jpg',
      model: 'kling-3-pro',
      durationSec: 5,
    }));
  });

  it('passes Hailuo model to provider', async () => {
    const provider = new StubAIProvider();
    const spy = jest.spyOn(provider, 'imageToVideo');
    await imageToVideoBlock.executor(
      { model: 'hailuo-2.3-fast', duration: 6, prompt: 'gentle camera move' },
      { url: 'https://cdn.test/edited.jpg' },
      ctx(provider),
    );
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({
      imageUrl: 'https://cdn.test/edited.jpg',
      model: 'hailuo-2.3-fast',
      durationSec: 6,
    }));
  });
});
