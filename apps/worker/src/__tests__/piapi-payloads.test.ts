import { __piapiPayloadBuildersForTests } from '../providers/piapi-provider';

const { buildImageToVideoPayload, buildTextToVideoPayload } = __piapiPayloadBuildersForTests;

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
});
