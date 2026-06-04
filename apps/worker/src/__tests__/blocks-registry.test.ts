import { BLOCK_REGISTRY, getBlock, listBlocks } from '../blocks/registry';

describe('blocks registry', () => {
  it('contains valid pipeline blocks', () => {
    const blocks = listBlocks();
    expect(blocks).toHaveLength(13);
    expect(Object.keys(BLOCK_REGISTRY).sort()).toEqual([
      'carousel-slides',
      'face-swap-video',
      'image-edit',
      'image-restore',
      'image-to-video',
      'image-upscale',
      'motion-transfer',
      'scene-transfer',
      'text-to-video',
      'trend-video-transfer',
      'video-compose',
      'video-effect',
      'video-watermark-remove',
    ]);

    for (const block of blocks) {
      expect(block.slug).toBeTruthy();
      expect(block.title).toBeTruthy();
      expect(block.description).toBeTruthy();
      expect(block.supportedModels.length).toBeGreaterThan(0);
      expect(typeof block.inputSchema.parse).toBe('function');
      expect(typeof block.outputSchema.parse).toBe('function');
      expect(typeof block.paramsSchema.parse).toBe('function');
      expect(typeof block.executor).toBe('function');
      expect(typeof block.estimatedCostCoins).toBe('function');
    }
  });

  it('returns a known block and rejects unknown blocks', () => {
    expect(getBlock('image-restore').slug).toBe('image-restore');
    expect(() => getBlock('missing-block')).toThrow('Unknown block: missing-block');
  });
});
