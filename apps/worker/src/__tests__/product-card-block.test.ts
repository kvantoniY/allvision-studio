import { usdToTokens } from '@allvision/shared';
import { productCardBlock } from '../blocks/product-card';
import { StubAIProvider } from '../providers/stub-ai-provider';

function ctx(provider = new StubAIProvider()) {
  return {
    generationId: 'g',
    providerContext: { projectId: 'p', userId: 'u', blockSlug: 'product-card', stepId: 'step_1' },
    reportProgress: jest.fn(),
    getAIProvider: () => provider,
    storage: { upload: jest.fn(), getSignedUrl: jest.fn(), delete: jest.fn() },
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  };
}

describe('product-card block', () => {
  it('estimates only selected output costs', () => {
    expect(productCardBlock.estimatedCostCoins({ outputs: ['cover'] })).toBe(usdToTokens(0.1));
    expect(productCardBlock.estimatedCostCoins({ outputs: ['animation'], animation_duration: 10 })).toBe(usdToTokens(2.6));
    expect(productCardBlock.estimatedCostCoins({ outputs: [] })).toBe(usdToTokens(0.1));
  });

  it('only generates the selected outputs and returns labeled assets', async () => {
    const provider = new StubAIProvider();
    const edit = jest.spyOn(provider, 'imageEdit');
    const i2v = jest.spyOn(provider, 'imageToVideo');
    const t2v = jest.spyOn(provider, 'textToVideo');

    const output = await productCardBlock.executor(
      {
        photo1: 'https://cdn.test/a.jpg',
        photo2: 'https://cdn.test/b.jpg',
        product_name: 'Кроссовки',
        outputs: ['cover', 'ad'],
      },
      undefined,
      ctx(provider),
    );

    expect(edit).toHaveBeenCalledTimes(1); // cover
    expect(i2v).not.toHaveBeenCalled(); // animation not selected
    expect(t2v).toHaveBeenCalledTimes(1); // ad
    expect(t2v.mock.calls[0][0].params).toEqual(expect.objectContaining({
      mode: 'omni_reference',
      image_urls: ['https://cdn.test/a.jpg', 'https://cdn.test/b.jpg'],
    }));

    const assets = (output as { metadata: { assets: Array<{ label: string; type: string }> } }).metadata.assets;
    expect(assets.map((a) => a.label)).toEqual(['Обложка', 'Реклама']);
    expect(assets[0]).toEqual(expect.objectContaining({ type: 'image' }));
    expect(assets[1]).toEqual(expect.objectContaining({ type: 'video' }));
  });

  it('feeds the generated cover into the animation step', async () => {
    const provider = new StubAIProvider();
    const i2v = jest.spyOn(provider, 'imageToVideo');
    await productCardBlock.executor(
      { photo1: 'https://cdn.test/a.jpg', outputs: ['cover', 'animation'] },
      undefined,
      ctx(provider),
    );
    expect(i2v).toHaveBeenCalledTimes(1);
    expect(i2v.mock.calls[0][0].imageUrl).toBe('stub://edited-image.jpg'); // the cover output
  });

  it('accepts outputs as a JSON string and ignores disabled/unknown values', async () => {
    const provider = new StubAIProvider();
    const edit = jest.spyOn(provider, 'imageEdit');
    const t2v = jest.spyOn(provider, 'textToVideo');
    await productCardBlock.executor(
      { photo1: 'https://cdn.test/a.jpg', outputs: '["cover","description","bogus"]' },
      undefined,
      ctx(provider),
    );
    expect(edit).toHaveBeenCalledTimes(1);
    expect(t2v).not.toHaveBeenCalled();
  });

  it('throws when nothing is selected', async () => {
    await expect(
      productCardBlock.executor({ photo1: 'https://cdn.test/a.jpg', outputs: [] }, undefined, ctx()),
    ).rejects.toThrow('at least one selected output');
  });
});
