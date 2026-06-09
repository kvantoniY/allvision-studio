import { summarizePipelinePricing } from '../blocks/pricing';

describe('block pricing summary', () => {
  it('estimates carousel cost per concrete slide and one placeholder slide', () => {
    const concrete = summarizePipelinePricing([
      { blockSlug: 'carousel-slides', params: { model: 'gpt-image-2', slides: ['one', 'two', 'three'] } },
    ]);
    const placeholder = summarizePipelinePricing([
      { blockSlug: 'carousel-slides', params: { model: 'gpt-image-2', slides: '{{user.slides}}' } },
    ]);

    expect(concrete.pro.costUsd).toBeCloseTo(0.3);
    expect(placeholder.pro.costUsd).toBeCloseTo(0.1);
    expect(placeholder.pro.costCoins).toBe(1);
  });

  it('estimates product-card cost from selected outputs', () => {
    const cover = summarizePipelinePricing([
      { blockSlug: 'product-card', params: { outputs: ['cover'] } },
    ]);
    const animation = summarizePipelinePricing([
      { blockSlug: 'product-card', params: { outputs: ['animation'], animation_duration: 10 } },
    ]);
    const userChoiceFallback = summarizePipelinePricing([
      { blockSlug: 'product-card', params: { outputs: '{{user.outputs}}' } },
    ]);

    expect(cover.pro.costUsd).toBeCloseTo(0.1);
    expect(cover.pro.costCoins).toBe(1);
    expect(animation.pro.costUsd).toBeCloseTo(2.6);
    expect(userChoiceFallback.pro.costUsd).toBeCloseTo(0.1);
  });

  it('estimates video upscale by processed frames', () => {
    const summary = summarizePipelinePricing([
      { blockSlug: 'video-upscale', params: { model: 'video-upscale-2x', estimatedFrames: 120 } },
    ]);

    expect(summary.pro.costUsd).toBeCloseTo(0.036);
    expect(summary.pro.costCoins).toBe(1);
  });
});
