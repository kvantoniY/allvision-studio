import { BLOCK_CATALOG } from '../blocks/catalog';
import { CHAT_MODELS } from '../chat/chat-models';

describe('CHAT_MODELS', () => {
  it('points every chat model at an existing catalog block and model', () => {
    for (const chatModel of CHAT_MODELS) {
      const block = BLOCK_CATALOG.find((item) => item.slug === chatModel.blockSlug);
      expect(block).toBeDefined();
      expect(block?.supportedModels.some((model) => model.slug === chatModel.slug)).toBe(true);
      expect(chatModel.estimatedCostCoins).toBeGreaterThanOrEqual(0);
      expect(chatModel.supportedAspectRatios.length).toBeGreaterThan(0);
    }
  });

  it('keeps narrow service blocks out of the free chat list', () => {
    expect(CHAT_MODELS.map((model) => model.blockSlug)).not.toEqual(
      expect.arrayContaining(['face-swap-video', 'motion-transfer', 'video-compose', 'image-restore', 'image-upscale']),
    );
  });
});
