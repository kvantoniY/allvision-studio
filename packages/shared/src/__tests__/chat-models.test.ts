import { BLOCK_CATALOG } from '../blocks/catalog';
import { CHAT_MODELS, CHAT_PROMPT_MAX_LENGTH, chatModelPriceFloorCoins, estimateChatGenerationCostCoins, estimateChatGenerationPriceCoins, getChatModel } from '../chat/chat-models';

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

  it('enforces chat price floors: images >= 2 coins, Kling/Seedance video 12 + 1/sec over 5s', () => {
    // Все фото-модели чата — минимум 2 токена.
    for (const model of CHAT_MODELS.filter((m) => m.category === 'image')) {
      expect(estimateChatGenerationPriceCoins(model.slug)).toBeGreaterThanOrEqual(2);
    }
    expect(chatModelPriceFloorCoins('nano-banana')).toBe(2);
    // Kling / Seedance видео: 5с -> 12, 6с -> 13, 7с -> 14, «auto»/короткое -> 12.
    expect(chatModelPriceFloorCoins('kling-3-std', 5)).toBe(12);
    expect(chatModelPriceFloorCoins('kling-3-std', 6)).toBe(13);
    expect(chatModelPriceFloorCoins('kling-3-std', 7)).toBe(14);
    expect(chatModelPriceFloorCoins('seedance-2-fast', 4)).toBe(12);
    expect(estimateChatGenerationPriceCoins('kling-3-std', { duration: 5 })).toBeGreaterThanOrEqual(12);
    expect(estimateChatGenerationPriceCoins('seedance-2', { duration: 6 })).toBeGreaterThanOrEqual(13);
    expect(CHAT_PROMPT_MAX_LENGTH).toBe(2500);
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

    const seedance25 = getChatModel('seedance-2.5');
    expect(seedance25?.familySlug).toBe('seedance-2.5');
    expect(seedance25?.supportedResolutions).toEqual(expect.arrayContaining(['720p', '1080p']));
  });

  it('keeps models the owner removed out of the picker', () => {
    // Список моделей — это витрина, а не свалка всего, что умеет провайдер: лишние строки
    // мешают выбрать. Владелец убрал их осознанно, и вернуться они должны только явно.
    for (const slug of ['sora-2', 'sora-2-pro', 'grok-video', 'luma-ray2', 'luma-ray2-i2v', 'remove-watermark', 'flux-dev', 'recraft-v3', 'ideogram-v3']) {
      expect(getChatModel(slug)).toBeUndefined();
    }
  });

  it('gives every model a human family name', () => {
    // Раньше семейство без правила показывалось сырым слагом — в списке висели
    // «seedream-5-lite» и «fal-custom-video».
    for (const model of CHAT_MODELS) {
      expect(model.familyTitle).not.toBe(model.slug);
    }
  });

  it('prices advanced resolution choices through chat cost estimation', () => {
    expect(estimateChatGenerationCostCoins('wan-2.6', { duration: 10, params: { resolution: '1080p' } })).toBeGreaterThan(
      estimateChatGenerationCostCoins('wan-2.6', { duration: 10, params: { resolution: '720p' } }),
    );
  });

  it('treats admin model price override as a MINIMUM (floor/duration still raise it)', () => {
    // Оверрайд выше базовой цены — поднимает цену до себя.
    const base = estimateChatGenerationPriceCoins('nano-banana');
    expect(estimateChatGenerationPriceCoins('nano-banana', { priceOverrides: { 'nano-banana': base + 50 } })).toBe(base + 50);
    // Оверрайд ниже пола НЕ опускает цену: картинка всё равно минимум 2 токена.
    expect(estimateChatGenerationPriceCoins('nano-banana', { priceOverrides: { 'nano-banana': 1 } })).toBe(2);
    // Оверрайд не «замораживает» видео: длительность поднимает цену выше оверрайда.
    expect(estimateChatGenerationPriceCoins('kling-3-omni', { duration: 5, priceOverrides: { 'kling-3-omni': 12 } })).toBe(12);
    expect(estimateChatGenerationPriceCoins('kling-3-omni', { duration: 15, priceOverrides: { 'kling-3-omni': 12 } })).toBe(22);
  });

  it('marks up chat pricing at cost x2 but never below the chat floor', () => {
    const gptCost = estimateChatGenerationCostCoins('gpt-image-2');
    // Картинка: max(себестоимость×2, пол 2 токена).
    expect(estimateChatGenerationPriceCoins('gpt-image-2')).toBe(Math.max(2, Math.ceil(gptCost * 2)));

    // kling-3-omni 15с/720p: себестоимость×2 = 14, но пол Kling на 15с = 12 + 10 = 22 → берём 22.
    const klingCost = estimateChatGenerationCostCoins('kling-3-omni', { duration: 15, params: { resolution: '720p' } });
    expect(klingCost).toBe(7);
    expect(estimateChatGenerationPriceCoins('kling-3-omni', { duration: 15, params: { resolution: '720p' } }))
      .toBe(Math.max(22, klingCost * 2));
  });
});
