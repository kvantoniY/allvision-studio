import { normaliseModelPriceOverrides } from '../services/model-pricing';

describe('normaliseModelPriceOverrides', () => {
  it('allows supported model prices below calculated model cost', () => {
    expect(normaliseModelPriceOverrides({ 'nano-banana': 1 })).toEqual({ 'nano-banana': 1 });
  });

  it('keeps only positive integer prices for supported models', () => {
    expect(normaliseModelPriceOverrides({
      'nano-banana': '1.2',
      'unknown-model': 10,
      'gpt-image-2': 0,
      'kling-std': -5,
    })).toEqual({
      'nano-banana': 2,
    });
  });
});
