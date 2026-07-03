import { falDocumentedCostUsd } from '../blocks/fal-pricing';
import { summarizePipelinePricing } from '../blocks/pricing';

describe('falDocumentedCostUsd', () => {
  it('prices gpt-image-2 by quality and frame format from fal docs', () => {
    expect(falDocumentedCostUsd('gpt-image-2', { quality: 'low', aspectRatio: '1:1' })).toBeCloseTo(0.006);
    expect(falDocumentedCostUsd('gpt-image-2', { quality: 'medium', aspectRatio: '1:1' })).toBeCloseTo(0.053);
    expect(falDocumentedCostUsd('gpt-image-2', { quality: 'high', aspectRatio: '1:1' })).toBeCloseTo(0.211);
    expect(falDocumentedCostUsd('gpt-image-2', { quality: 'high', aspectRatio: '9:16' })).toBeCloseTo(0.165);
    // auto / пусто тарифицируется как medium
    expect(falDocumentedCostUsd('gpt-image-2', { quality: 'auto' })).toBeCloseTo(0.053);
    expect(falDocumentedCostUsd('gpt-image-2')).toBeCloseTo(0.053);
  });

  it('prices nano-banana by resolution from fal docs', () => {
    expect(falDocumentedCostUsd('nano-banana', { resolution: '1K' })).toBeCloseTo(0.12);
    expect(falDocumentedCostUsd('nano-banana', { resolution: '2K' })).toBeCloseTo(0.14);
    expect(falDocumentedCostUsd('nano-banana', { resolution: '4K' })).toBeCloseTo(0.18);
    expect(falDocumentedCostUsd('nano-banana')).toBeCloseTo(0.12);
  });

  it('returns undefined for models without a documented tariff', () => {
    expect(falDocumentedCostUsd('kling-3-pro')).toBeUndefined();
    expect(falDocumentedCostUsd('seedance-2')).toBeUndefined();
  });
});

describe('block pricing summary', () => {
  const gptMedium = falDocumentedCostUsd('gpt-image-2', { quality: 'medium' })!;

  it('reflects gpt-image-2 quality selection in image-edit step cost', () => {
    const low = summarizePipelinePricing([
      { blockSlug: 'image-edit', params: { model: 'gpt-image-2', prompt: 'x', quality: 'low' } },
    ]);
    const high = summarizePipelinePricing([
      { blockSlug: 'image-edit', params: { model: 'gpt-image-2', prompt: 'x', quality: 'high' } },
    ]);

    expect(low.pro.costUsd).toBeCloseTo(0.006);
    expect(high.pro.costUsd).toBeCloseTo(0.211);
  });

  it('reflects nano-banana resolution selection in image-edit step cost', () => {
    const base = summarizePipelinePricing([
      { blockSlug: 'image-edit', params: { model: 'nano-banana', prompt: 'x', resolution: '1K' } },
    ]);
    const uhd = summarizePipelinePricing([
      { blockSlug: 'image-edit', params: { model: 'nano-banana', prompt: 'x', resolution: '4K' } },
    ]);

    expect(base.pro.costUsd).toBeCloseTo(0.12);
    expect(uhd.pro.costUsd).toBeCloseTo(0.18);
  });

  it('estimates carousel cost per concrete slide and one placeholder slide', () => {
    const concrete = summarizePipelinePricing([
      { blockSlug: 'carousel-slides', params: { model: 'gpt-image-2', slides: ['one', 'two', 'three'] } },
    ]);
    const placeholder = summarizePipelinePricing([
      { blockSlug: 'carousel-slides', params: { model: 'gpt-image-2', slides: '{{user.slides}}' } },
    ]);

    expect(concrete.pro.costUsd).toBeCloseTo(gptMedium * 3);
    expect(placeholder.pro.costUsd).toBeCloseTo(gptMedium);
  });

  it('estimates product-card cost from selected outputs with a docs-priced cover', () => {
    const cover = summarizePipelinePricing([
      { blockSlug: 'product-card', params: { outputs: ['cover'] } },
    ]);
    const coverLow = summarizePipelinePricing([
      { blockSlug: 'product-card', params: { outputs: ['cover'], quality: 'low' } },
    ]);
    const animation = summarizePipelinePricing([
      { blockSlug: 'product-card', params: { outputs: ['animation'], animation_duration: 10 } },
    ]);
    const userChoiceFallback = summarizePipelinePricing([
      { blockSlug: 'product-card', params: { outputs: '{{user.outputs}}' } },
    ]);

    expect(cover.pro.costUsd).toBeCloseTo(gptMedium);
    expect(coverLow.pro.costUsd).toBeCloseTo(0.006);
    expect(animation.pro.costUsd).toBeCloseTo(2.6);
    expect(userChoiceFallback.pro.costUsd).toBeCloseTo(gptMedium);
  });

  it('estimates video upscale by processed frames', () => {
    const summary = summarizePipelinePricing([
      { blockSlug: 'video-upscale', params: { model: 'video-upscale-2x', estimatedFrames: 120 } },
    ]);

    expect(summary.pro.costUsd).toBeCloseTo(0.036);
    expect(summary.pro.costCoins).toBe(1);
  });
});
