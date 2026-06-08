import { usdToTokens } from '@allvision/shared';
import { carouselSlidesBlock } from '../blocks/carousel-slides';
import { StubAIProvider } from '../providers/stub-ai-provider';

function ctx(provider = new StubAIProvider()) {
  return {
    generationId: 'test-generation',
    providerContext: { projectId: 'p', userId: 'u', blockSlug: 'carousel-slides', stepId: 'step_1' },
    reportProgress: jest.fn(),
    getAIProvider: () => provider,
    storage: { upload: jest.fn(), getSignedUrl: jest.fn(), delete: jest.fn() },
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  };
}

describe('carousel-slides block', () => {
  it('estimates cost per slide', () => {
    expect(carouselSlidesBlock.estimatedCostCoins({ slides: ['one', 'two', 'three'] })).toBe(3 * usdToTokens(0.1));
    expect(carouselSlidesBlock.estimatedCostCoins({ slides: [] })).toBe(usdToTokens(0.1));
  });

  it('generates one image per slide and returns them in metadata.slides', async () => {
    const provider = new StubAIProvider();
    const spy = jest.spyOn(provider, 'imageEdit');

    const output = await carouselSlidesBlock.executor(
      {
        model: 'gpt-image-2',
        person_photo: 'https://cdn.test/me.jpg',
        slides: ['Заголовок', 'Второй слайд', ''],
        style_prompt: 'Premium cream brand carousel.',
        aspect_ratio: '3:4',
      },
      undefined,
      ctx(provider),
    );

    expect(spy).toHaveBeenCalledTimes(3);
    // First slide: person photo only (no style ref yet).
    expect(spy.mock.calls[0][0]).toEqual(expect.objectContaining({ imageUrl: 'https://cdn.test/me.jpg', model: 'gpt-image-2' }));
    expect(spy.mock.calls[0][0].params).toEqual(expect.objectContaining({ image_urls: [], aspect_ratio: '3:4', quality: 'high' }));
    // Later slides reuse slide 1 as a style reference.
    expect(spy.mock.calls[1][0].params).toEqual(expect.objectContaining({ image_urls: ['stub://edited-image.jpg'] }));
    // Prompts carry the style prompt and the slide text.
    expect(spy.mock.calls[0][0].prompt).toContain('Premium cream brand carousel.');
    expect(spy.mock.calls[0][0].prompt).toContain('Заголовок');

    expect(output).toEqual(
      expect.objectContaining({
        type: 'image',
        url: 'stub://edited-image.jpg',
        metadata: expect.objectContaining({ slideCount: 3, slides: ['stub://edited-image.jpg', 'stub://edited-image.jpg', 'stub://edited-image.jpg'] }),
      }),
    );
  });

  it('accepts slides as a JSON string', async () => {
    const provider = new StubAIProvider();
    const spy = jest.spyOn(provider, 'imageEdit');
    await carouselSlidesBlock.executor(
      { model: 'gpt-image-2', person_photo: 'https://cdn.test/me.jpg', slides: '["a","b"]' },
      undefined,
      ctx(provider),
    );
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('throws when there are no slides', async () => {
    await expect(
      carouselSlidesBlock.executor(
        { model: 'gpt-image-2', person_photo: 'https://cdn.test/me.jpg', slides: [] },
        undefined,
        ctx(),
      ),
    ).rejects.toThrow('at least one slide');
  });
});
