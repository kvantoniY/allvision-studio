import { imageEditBlock } from '../blocks/image-edit';
import { ProviderError } from '../providers/provider-errors';
import { StubAIProvider } from '../providers/stub-ai-provider';

function ctx(provider = new StubAIProvider()) {
  return {
    generationId: 'test-generation',
    providerContext: {
      projectId: 'test-project',
      userId: 'test-user',
      blockSlug: 'image-edit',
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

describe('image-edit block', () => {
  it('calls provider imageEdit and returns image output', async () => {
    const provider = new StubAIProvider();
    const spy = jest.spyOn(provider, 'imageEdit');
    const output = await imageEditBlock.executor(
      { model: 'nano-banana', prompt: 'restore old photo' },
      'mock://photo.jpg',
      ctx(provider),
    );

    expect(spy).toHaveBeenCalledWith(expect.objectContaining({
      imageUrl: 'mock://photo.jpg',
      model: 'nano-banana',
      prompt: 'restore old photo',
    }));
    expect(output).toEqual(expect.objectContaining({ type: 'image', url: 'stub://edited-image.jpg' }));
  });

  it('validates required prompt', async () => {
    await expect(imageEditBlock.executor({ model: 'nano-banana' }, 'mock://photo.jpg', ctx())).rejects.toThrow();
  });

  it('propagates provider errors', async () => {
    const provider = new StubAIProvider();
    jest.spyOn(provider, 'imageEdit').mockRejectedValue(new ProviderError('PIAPI_TIMEOUT', 'timeout'));
    await expect(
      imageEditBlock.executor({ model: 'nano-banana', prompt: 'restore' }, 'mock://photo.jpg', ctx(provider)),
    ).rejects.toThrow('timeout');
  });
});
