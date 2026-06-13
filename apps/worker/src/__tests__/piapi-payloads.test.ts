import { __piapiPayloadBuildersForTests } from '../providers/piapi-provider';

const {
  buildImageToVideoPayload,
  buildTextToVideoPayload,
  buildImageEditPayload,
  buildWatermarkPayload,
  buildVideoUpscalePayload,
  uniqueImageReferenceUrls,
  limitImageReferences,
} = __piapiPayloadBuildersForTests;

describe('PiAPI payload builders', () => {
  it('builds Veo 3.1 text-to-video payload with audio and quality controls', () => {
    const payload = buildTextToVideoPayload('veo-3.1-fast', {
      prompt: 'cinematic sunrise',
      durationSec: 8,
      aspectRatio: '9:16',
      resolution: '720p',
      generateAudio: true,
      params: {
        negative_prompt: 'blur',
      },
    });

    expect(payload).toEqual({
      model: 'veo3.1',
      task_type: 'veo3.1-video-fast',
      input: {
        prompt: 'cinematic sunrise',
        duration: '8s',
        aspect_ratio: '9:16',
        generate_audio: true,
        resolution: '720p',
        negative_prompt: 'blur',
      },
    });
  });

  it('builds Sora 2 Pro payload with the provider model expected by PiAPI', () => {
    const payload = buildTextToVideoPayload('sora-2-pro', {
      prompt: 'paper lanterns over a river',
      durationSec: 10,
      aspectRatio: '16:9',
      resolution: '1080p',
      generateAudio: false,
      params: {},
    });

    expect(payload).toEqual({
      model: 'sora2',
      task_type: 'sora2-pro-video',
      input: {
        prompt: 'paper lanterns over a river',
        duration: 10,
        aspect_ratio: '16:9',
        resolution: '1080p',
      },
    });
  });

  it('builds Seedance omni-reference payload with image, video and audio refs', () => {
    const payload = buildTextToVideoPayload('seedance-2-fast-omni', {
      prompt: 'match the references',
      durationSec: 5,
      aspectRatio: '21:9',
      resolution: '1080p',
      generateAudio: false,
      params: {
        image_urls: ['https://cdn.test/a.jpg'],
        video_urls: ['https://cdn.test/b.mp4'],
        audio_urls: ['https://cdn.test/c.mp3'],
        seed: 123,
      },
    });

    expect(payload).toEqual({
      model: 'seedance',
      task_type: 'seedance-2-fast',
      input: {
        prompt: 'match the references',
        mode: 'omni_reference',
        duration: 5,
        aspect_ratio: '21:9',
        resolution: '1080p',
        image_urls: ['https://cdn.test/a.jpg'],
        video_urls: ['https://cdn.test/b.mp4'],
        audio_urls: ['https://cdn.test/c.mp3'],
        seed: 123,
      },
    });
  });

  it('builds Seedance less-restriction omni-reference payload', () => {
    const payload = buildTextToVideoPayload('seedance-2-less-restriction', {
      prompt: 'match the references',
      durationSec: 10,
      aspectRatio: '9:16',
      resolution: '720p',
      generateAudio: false,
      params: {
        mode: 'omni_reference',
        image_urls: ['https://cdn.test/a.jpg'],
        video_urls: ['https://cdn.test/b.mp4'],
      },
    });

    expect(payload).toEqual({
      model: 'seedance',
      task_type: 'seedance-2-less-restriction',
      input: {
        prompt: 'match the references',
        mode: 'omni_reference',
        duration: 10,
        aspect_ratio: '9:16',
        resolution: '720p',
        image_urls: ['https://cdn.test/a.jpg'],
        video_urls: ['https://cdn.test/b.mp4'],
      },
    });
  });

  it('builds Kling 3.0 Omni payload with references and audio controls', () => {
    const payload = buildTextToVideoPayload('kling-3-omni', {
      prompt: 'use @image_1 and @video as references',
      durationSec: 12,
      aspectRatio: '16:9',
      resolution: '1080p',
      generateAudio: true,
      params: {
        images: ['https://cdn.test/ref.jpg'],
        video: 'https://cdn.test/ref.mp4',
        keep_original_audio: true,
        multi_shots: '[{"duration":4,"prompt":"opening shot"}]',
        prefer_multi_shots: true,
      },
    });

    expect(payload).toEqual({
      model: 'kling',
      task_type: 'omni_video_generation',
      input: {
        prompt: 'use @image_1 and @video as references',
        duration: 12,
        aspect_ratio: '16:9',
        resolution: '1080p',
        version: '3.0',
        enable_audio: true,
        images: ['https://cdn.test/ref.jpg'],
        video: 'https://cdn.test/ref.mp4',
        keep_original_audio: true,
        prefer_multi_shots: true,
        multi_shots: [{ duration: 4, prompt: 'opening shot' }],
      },
    });
  });

  it('omits aspect_ratio for Kling 3.0 Omni when auto (follows the uploaded scene)', () => {
    const payload = buildTextToVideoPayload('kling-3-omni', {
      prompt: 'integrate the person into the scene',
      durationSec: 5,
      aspectRatio: 'auto',
      resolution: '720p',
      generateAudio: false,
      params: { images: ['https://cdn.test/scene.jpg'] },
    });

    expect((payload.input as Record<string, unknown>).aspect_ratio).toBeUndefined();
    expect((payload.input as Record<string, unknown>).images).toEqual(['https://cdn.test/scene.jpg']);
  });

  it('omits aspect_ratio for Seedance omni when auto, but keeps an explicit choice', () => {
    const auto = buildTextToVideoPayload('seedance-2-omni', {
      prompt: 'match the scene',
      durationSec: 5,
      aspectRatio: 'auto',
      resolution: '720p',
      generateAudio: false,
      params: { image_urls: ['https://cdn.test/a.jpg'] },
    });
    expect((auto.input as Record<string, unknown>).aspect_ratio).toBeUndefined();

    const explicit = buildTextToVideoPayload('seedance-2-omni', {
      prompt: 'match the scene',
      durationSec: 5,
      aspectRatio: '9:16',
      resolution: '720p',
      generateAudio: false,
      params: { image_urls: ['https://cdn.test/a.jpg'] },
    });
    expect((explicit.input as Record<string, unknown>).aspect_ratio).toBe('9:16');
  });

  it('keeps a 16:9 default for pure Seedance text-to-video (no references) when auto', () => {
    const payload = buildTextToVideoPayload('seedance-2', {
      prompt: 'a quiet forest',
      durationSec: 5,
      aspectRatio: 'auto',
      resolution: '720p',
      generateAudio: false,
      params: {},
    });
    expect((payload.input as Record<string, unknown>).aspect_ratio).toBe('16:9');
  });

  it('builds Wan image-to-video payload with audio reference and advanced controls', () => {
    const payload = buildImageToVideoPayload('wan-2.6-i2v', {
      imageUrl: 'https://cdn.test/input.jpg',
      prompt: 'slow handheld move',
      durationSec: 10,
      aspectRatio: '16:9',
      params: {
        resolution: '1080p',
        negative_prompt: 'jitter',
        expand_prompt: false,
        shot_type: 'handheld',
        audio_url: 'https://cdn.test/music.mp3',
        watermark: false,
        seed: 321,
      },
    });

    expect(payload).toEqual({
      model: 'wan',
      task_type: 'wan26-i2v',
      input: {
        prompt: 'slow handheld move',
        image_url: 'https://cdn.test/input.jpg',
        duration: 10,
        aspect_ratio: '16:9',
        resolution: '1080p',
        negative_prompt: 'jitter',
        prompt_extend: false,
        shot_type: 'handheld',
        audio_url: 'https://cdn.test/music.mp3',
        watermark: false,
        seed: 321,
      },
    });
  });

  it('builds watermark remover payload, omitting duration when auto-detected', () => {
    expect(buildWatermarkPayload('https://cdn.test/clip.mp4')).toEqual({
      model: 'seedance',
      task_type: 'remove-watermark',
      input: { video_url: 'https://cdn.test/clip.mp4' },
    });

    expect(buildWatermarkPayload('https://cdn.test/clip.mp4', 7.2)).toEqual({
      model: 'seedance',
      task_type: 'remove-watermark',
      input: { video_url: 'https://cdn.test/clip.mp4', duration: 8 },
    });
  });

  it('builds video upscale payload', () => {
    expect(buildVideoUpscalePayload('https://cdn.test/source.mp4')).toEqual({
      model: 'Qubico/video-toolkit',
      task_type: 'upscale',
      input: { video: 'https://cdn.test/source.mp4' },
    });
  });

  it('builds Nano Banana image-edit payload with merged references', () => {
    const payload = buildImageEditPayload({
      modelSlug: 'nano-banana',
      modelConfig: { providerModel: 'gemini', taskType: 'nano-banana-2', supportsImageInput: true, estimatedCostUsd: 0.06 },
      prompt: 'restore the photo',
      imageUrls: ['https://cdn.test/main.jpg', 'https://cdn.test/extra.jpg'],
      resolution: '2K',
      aspectRatio: '16:9',
      params: { output_format: 'png' },
    });

    expect(payload).toEqual({
      model: 'gemini',
      task_type: 'nano-banana-2',
      input: {
        prompt: 'restore the photo',
        output_format: 'png',
        resolution: '2K',
        image_urls: ['https://cdn.test/main.jpg', 'https://cdn.test/extra.jpg'],
        aspect_ratio: '16:9',
      },
    });
  });

  it('omits image_urls for Nano Banana text-to-image (no references)', () => {
    const payload = buildImageEditPayload({
      modelSlug: 'nano-banana',
      modelConfig: { providerModel: 'gemini', taskType: 'nano-banana-2', supportsImageInput: true, estimatedCostUsd: 0.06 },
      prompt: 'a calm lake at dawn',
      imageUrls: [],
      resolution: '1K',
      params: {},
    });

    expect((payload.input as Record<string, unknown>).image_urls).toBeUndefined();
  });

  it('dedupes the step input against image_urls duplicates (same /static key)', () => {
    const refs = uniqueImageReferenceUrls([
      'https://allvision-pulse.ru/static/media-assets/user-avatar/photo.png',
      'https://allvision-pulse.ru/static/media-assets/user-avatar/photo.png',
      '/static/media-assets/user-avatar/photo.png',
      'https://cdn.test/other.jpg',
    ]);

    expect(refs).toEqual([
      'https://allvision-pulse.ru/static/media-assets/user-avatar/photo.png',
      'https://cdn.test/other.jpg',
    ]);
  });

  it('clamps references to the provider limit with a warning', () => {
    const warnings: string[] = [];
    const logger = { info: () => {}, warn: (msg: string) => warnings.push(msg), error: () => {} } as never;
    const refs = Array.from({ length: 12 }, (_, i) => `https://cdn.test/ref-${i}.jpg`);

    expect(limitImageReferences(refs, 10, 'gpt-image-2', logger)).toHaveLength(10);
    expect(warnings).toHaveLength(1);
    expect(limitImageReferences(refs, undefined, 'nano-banana', logger)).toHaveLength(12);
  });
});
