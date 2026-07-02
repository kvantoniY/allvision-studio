import { BLOCK_CATALOG } from '../blocks/catalog';
import { CHAT_MODELS, estimateChatGenerationCostCoins, estimateChatGenerationPriceCoins, getChatModel } from '../chat/chat-models';

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
      expect.arrayContaining(['video-compose', 'image-restore', 'image-upscale']),
    );
  });

  it('marks audio-capable models and prices audio requests higher when provider charges for audio', () => {
    expect(getChatModel('veo-3.1-fast')?.supportsAudio).toBe(true);
    expect(getChatModel('seedance-2-fast')?.supportsAudio).toBe(false);
    expect(estimateChatGenerationCostCoins('veo-3.1-fast', { duration: 8, generateAudio: true })).toBeGreaterThan(
      estimateChatGenerationCostCoins('veo-3.1-fast', { duration: 8, generateAudio: false }),
    );
  });

  it('exposes current PiAPI video capabilities in Allvision AI', () => {
    const wan = getChatModel('wan-2.6');
    expect(wan?.acceptsAudioInput).toBe(true);
    expect(wan?.audioInputParam).toBe('audio_url');
    expect(wan?.supportedResolutions).toEqual(['720p', '1080p']);
    expect(wan?.advancedParams.map((param) => param.key)).toEqual(expect.arrayContaining(['negative_prompt', 'audio_url', 'seed']));

    const seedanceOmni = getChatModel('seedance-2-fast-omni');
    expect(seedanceOmni?.acceptsImageInput).toBe(true);
    expect(seedanceOmni?.acceptsVideoInput).toBe(true);
    expect(seedanceOmni?.acceptsAudioInput).toBe(true);
    expect(seedanceOmni?.audioInputParam).toBe('audio_urls');
    expect(seedanceOmni?.supportedAspectRatios).toEqual(expect.arrayContaining(['21:9', '9:21']));
    expect(seedanceOmni?.durationOptions).toEqual([4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);

    const veoI2v = getChatModel('veo-3.1-i2v');
    expect(veoI2v?.durationOptions).toEqual([4, 6, 8]);
    expect(veoI2v?.supportedResolutions).toEqual(['1080p']);

    const klingOmni = getChatModel('kling-3-omni');
    expect(klingOmni?.familySlug).toBe('kling-3.0');
    expect(klingOmni?.supportsAudio).toBe(true);
    expect(klingOmni?.durationOptions).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);

    const motion = getChatModel('kling-motion-3.0-pro');
    expect(motion?.blockSlug).toBe('motion-transfer');
    expect(motion?.advancedParams.map((param) => param.key)).toEqual(expect.arrayContaining(['video_url', 'preset_motion', 'keep_original_sound']));

    const faceSwap = getChatModel('qubico-video-toolkit');
    expect(faceSwap?.blockSlug).toBe('face-swap-video');
    expect(faceSwap?.advancedParams.map((param) => param.key)).toEqual(expect.arrayContaining(['target_video', 'swap_faces_index', 'target_faces_index']));

    const soraPro = getChatModel('sora-2-pro');
    expect(soraPro?.supportedResolutions).toEqual(['720p', '1080p']);
  });

  it('prices advanced resolution choices through chat cost estimation', () => {
    expect(estimateChatGenerationCostCoins('wan-2.6', { duration: 10, params: { resolution: '1080p' } })).toBeGreaterThan(
      estimateChatGenerationCostCoins('wan-2.6', { duration: 10, params: { resolution: '720p' } }),
    );
  });

  it('applies admin model prices down to one token', () => {
    const base = estimateChatGenerationCostCoins('nano-banana');
    expect(estimateChatGenerationPriceCoins('nano-banana', { priceOverrides: { 'nano-banana': base + 50 } })).toBe(base + 50);
    expect(estimateChatGenerationPriceCoins('nano-banana', { priceOverrides: { 'nano-banana': 1 } })).toBe(1);
  });

  it('marks up chat pricing at cost x2 (both image and video) after token rounding', () => {
    const gptCost = estimateChatGenerationCostCoins('gpt-image-2');
    expect(estimateChatGenerationPriceCoins('gpt-image-2')).toBe(Math.max(1, Math.ceil(gptCost * 2)));

    const klingCost = estimateChatGenerationCostCoins('kling-3-omni', { duration: 15, params: { resolution: '720p' } });
    expect(klingCost).toBe(7);
    expect(estimateChatGenerationPriceCoins('kling-3-omni', { duration: 15, params: { resolution: '720p' } })).toBe(14);
  });
});
