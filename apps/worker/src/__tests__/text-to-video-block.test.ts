import { textToVideoBlock } from '../blocks/text-to-video';
import { StubAIProvider } from '../providers/stub-ai-provider';

function ctx(provider = new StubAIProvider()) {
  return {
    generationId: 'test-generation',
    providerContext: {
      projectId: 'test-project',
      userId: 'test-user',
      blockSlug: 'text-to-video',
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

describe('text-to-video block', () => {
  it('calls provider textToVideo for Seedance', async () => {
    const provider = new StubAIProvider();
    const spy = jest.spyOn(provider, 'textToVideo');
    const output = await textToVideoBlock.executor(
      { model: 'seedance-2-fast', prompt: 'a warm family scene', duration: 5, aspect_ratio: '16:9' },
      {},
      ctx(provider),
    );

    expect(spy).toHaveBeenCalledWith(expect.objectContaining({
      prompt: 'a warm family scene',
      durationSec: 5,
      model: 'seedance-2-fast',
    }));
    expect(output).toEqual(expect.objectContaining({ type: 'video', url: 'stub://text-to-video.mp4' }));
  });

  it('supports Veo and Sora model slugs', async () => {
    const provider = new StubAIProvider();
    const spy = jest.spyOn(provider, 'textToVideo');
    await textToVideoBlock.executor({ model: 'veo-3.1', prompt: 'cinematic shot' }, {}, ctx(provider));
    await textToVideoBlock.executor({ model: 'sora-2', prompt: 'playful scene' }, {}, ctx(provider));
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ model: 'veo-3.1' }));
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ model: 'sora-2' }));
  });

  it('validates required prompt', async () => {
    await expect(textToVideoBlock.executor({ model: 'seedance-2' }, {}, ctx())).rejects.toThrow();
  });

  it('passes the step input as the first image reference for Seedance omni', async () => {
    const provider = new StubAIProvider();
    const spy = jest.spyOn(provider, 'textToVideo');
    await textToVideoBlock.executor(
      { model: 'seedance-2-omni', mode: 'omni_reference', prompt: 'use @image1', duration: 8 },
      { type: 'image', url: 'https://cdn.test/step1.jpg' },
      ctx(provider),
    );

    const call = spy.mock.calls[0][0] as { params?: Record<string, unknown> };
    expect(call.params?.image_urls).toEqual(['https://cdn.test/step1.jpg']);
  });

  it('does not duplicate the input when image_urls already contains it', async () => {
    const provider = new StubAIProvider();
    const spy = jest.spyOn(provider, 'textToVideo');
    await textToVideoBlock.executor(
      {
        model: 'seedance-2-omni',
        mode: 'omni_reference',
        prompt: 'use @image1 and @image2',
        image_urls: ['https://cdn.test/step1.jpg', 'https://cdn.test/extra.jpg'],
      },
      { type: 'image', url: 'https://cdn.test/step1.jpg' },
      ctx(provider),
    );

    const call = spy.mock.calls[0][0] as { params?: Record<string, unknown> };
    expect(call.params?.image_urls).toEqual(['https://cdn.test/step1.jpg', 'https://cdn.test/extra.jpg']);
  });

  it('merges the input into images for Kling 3.0 Omni', async () => {
    const provider = new StubAIProvider();
    const spy = jest.spyOn(provider, 'textToVideo');
    await textToVideoBlock.executor(
      { model: 'kling-3-omni', prompt: 'use @image_1' },
      { type: 'image', url: 'https://cdn.test/step1.jpg' },
      ctx(provider),
    );

    const call = spy.mock.calls[0][0] as { params?: Record<string, unknown> };
    expect(call.params?.images).toEqual(['https://cdn.test/step1.jpg']);
  });

  it('ignores the step input for text-only models', async () => {
    const provider = new StubAIProvider();
    const spy = jest.spyOn(provider, 'textToVideo');
    await textToVideoBlock.executor(
      { model: 'veo-3.1', prompt: 'cinematic shot' },
      { type: 'image', url: 'https://cdn.test/step1.jpg' },
      ctx(provider),
    );

    const call = spy.mock.calls[0][0] as { params?: Record<string, unknown> };
    expect(call.params?.image_urls).toBeUndefined();
    expect(call.params?.images).toBeUndefined();
  });
});
