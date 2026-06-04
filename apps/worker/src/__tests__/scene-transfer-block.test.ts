import { sceneTransferBlock } from '../blocks/scene-transfer';
import { StubAIProvider } from '../providers/stub-ai-provider';

function ctx(provider = new StubAIProvider()) {
  return {
    generationId: 'test-generation',
    providerContext: {
      projectId: 'test-project',
      userId: 'test-user',
      blockSlug: 'scene-transfer',
      stepId: 'step_1',
    },
    reportProgress: jest.fn(),
    getAIProvider: () => provider,
    storage: {
      upload: jest.fn(),
      getSignedUrl: jest.fn(),
      delete: jest.fn(),
    },
    logger: {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    },
  };
}

describe('scene-transfer block', () => {
  it('runs Kling 3.0 Omni with a single person and a photo scene reference', async () => {
    const provider = new StubAIProvider();
    const spy = jest.spyOn(provider, 'textToVideo');

    const output = await sceneTransferBlock.executor(
      {
        model: 'kling-3-omni',
        scene_mode: 'photo',
        scene_image: 'https://cdn.test/scene.jpg',
        primary_photo: 'https://cdn.test/person.jpg',
        base_prompt: 'Photorealistic cinematic film scene.',
        user_prompt: 'walking down the hall',
        duration: 5,
        aspect_ratio: '16:9',
      },
      undefined,
      ctx(provider),
    );

    expect(spy).toHaveBeenCalledWith(expect.objectContaining({
      prompt: expect.stringContaining('@image_1'),
      durationSec: 5,
      model: 'kling-3-omni',
      params: expect.objectContaining({
        images: ['https://cdn.test/person.jpg', 'https://cdn.test/scene.jpg'],
        video: undefined,
        aspect_ratio: '16:9',
      }),
    }));
    // The user prompt and base prompt are both folded into the final prompt.
    const call = spy.mock.calls[0][0];
    expect(call.prompt).toContain('Photorealistic cinematic film scene.');
    expect(call.prompt).toContain('walking down the hall');
    expect(output).toEqual(expect.objectContaining({ type: 'video', url: 'stub://text-to-video.mp4' }));
  });

  it('runs Seedance 2.0 Omni with two people and a video scene reference', async () => {
    const provider = new StubAIProvider();
    const spy = jest.spyOn(provider, 'textToVideo');

    await sceneTransferBlock.executor(
      {
        model: 'seedance-2-omni',
        scene_mode: 'video',
        scene_video: 'https://cdn.test/scene.mp4',
        primary_photo: 'https://cdn.test/left.jpg',
        secondary_photo: 'https://cdn.test/right.jpg',
        duration: 10,
        aspect_ratio: '9:16',
      },
      undefined,
      ctx(provider),
    );

    expect(spy).toHaveBeenCalledWith(expect.objectContaining({
      prompt: expect.stringContaining('@image2'),
      durationSec: 10,
      model: 'seedance-2-omni',
      params: expect.objectContaining({
        mode: 'omni_reference',
        image_urls: ['https://cdn.test/left.jpg', 'https://cdn.test/right.jpg'],
        video_urls: ['https://cdn.test/scene.mp4'],
      }),
    }));
  });

  it('uses the default prompt when the user prompt is empty', async () => {
    const provider = new StubAIProvider();
    const spy = jest.spyOn(provider, 'textToVideo');

    await sceneTransferBlock.executor(
      {
        model: 'kling-3-omni',
        scene_mode: 'photo',
        scene_image: 'https://cdn.test/scene.jpg',
        primary_photo: 'https://cdn.test/person.jpg',
        user_prompt: '',
        default_user_prompt: 'animate the scene',
        duration: 5,
      },
      undefined,
      ctx(provider),
    );

    expect(spy.mock.calls[0][0].prompt).toContain('animate the scene');
  });

  it('cartoonifies each character through image-edit before the video step', async () => {
    const provider = new StubAIProvider();
    const editSpy = jest.spyOn(provider, 'imageEdit');
    const videoSpy = jest.spyOn(provider, 'textToVideo');

    await sceneTransferBlock.executor(
      {
        model: 'kling-3-omni',
        scene_mode: 'photo',
        scene_image: 'https://cdn.test/cartoon-scene.jpg',
        primary_photo: 'https://cdn.test/kid1.jpg',
        secondary_photo: 'https://cdn.test/kid2.jpg',
        stylize_characters: true,
        stylize_model: 'gpt-image-2',
        stylize_prompt: 'make cartoon',
        base_prompt: 'Cartoon scene.',
        duration: 5,
      },
      undefined,
      ctx(provider),
    );

    expect(editSpy).toHaveBeenCalledTimes(2);
    expect(editSpy.mock.calls[0][0]).toEqual(expect.objectContaining({
      imageUrl: 'https://cdn.test/kid1.jpg',
      model: 'gpt-image-2',
      prompt: 'make cartoon',
    }));
    // The video step receives the stylized outputs as the character references plus the scene image.
    expect(videoSpy.mock.calls[0][0].params).toEqual(expect.objectContaining({
      images: ['stub://edited-image.jpg', 'stub://edited-image.jpg', 'https://cdn.test/cartoon-scene.jpg'],
    }));
  });

  it('throws when a photo scene mode has no scene image', async () => {
    await expect(
      sceneTransferBlock.executor(
        {
          model: 'kling-3-omni',
          scene_mode: 'photo',
          primary_photo: 'https://cdn.test/person.jpg',
        },
        undefined,
        ctx(),
      ),
    ).rejects.toThrow('scene_image');
  });
});
