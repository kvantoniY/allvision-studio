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

  it('runs Seedance text-to-video when prompt mode has no user reference', async () => {
    const provider = new StubAIProvider();
    const spy = jest.spyOn(provider, 'textToVideo');

    await sceneTransferBlock.executor(
      {
        model: 'kling-3-omni',
        generation_mode: 'prompt',
        prompt_model: 'seedance-2-omni',
        prompt_text_model: 'seedance-2',
        primary_photo: '',
        prompt_base_prompt: 'Cinematic prompt mode.',
        no_reference_prompt: 'No identity reference.',
        user_prompt: 'a lone detective walks through neon rain',
        duration: 8,
        aspect_ratio: '16:9',
      },
      undefined,
      ctx(provider),
    );

    expect(spy).toHaveBeenCalledWith(expect.objectContaining({
      model: 'seedance-2',
      durationSec: 8,
      params: expect.objectContaining({
        mode: 'text_to_video',
        image_urls: undefined,
        video_urls: undefined,
        aspect_ratio: '16:9',
      }),
    }));
    const call = spy.mock.calls[0][0];
    expect(call.prompt).toContain('Cinematic prompt mode.');
    expect(call.prompt).toContain('No identity reference.');
    expect(call.prompt).toContain('a lone detective walks through neon rain');
  });

  it('runs Seedance Omni with one identity reference in prompt mode', async () => {
    const provider = new StubAIProvider();
    const spy = jest.spyOn(provider, 'textToVideo');

    await sceneTransferBlock.executor(
      {
        generation_mode: 'prompt',
        prompt_model: 'seedance-2-omni',
        prompt_text_model: 'seedance-2',
        primary_photo: 'https://cdn.test/person.jpg',
        prompt_base_prompt: 'Premium animated scene.',
        prompt_character_prompt: 'Keep identity from the uploaded reference.',
        user_prompt: 'the hero opens a portal above the city',
        duration: 5,
      },
      undefined,
      ctx(provider),
    );

    expect(spy).toHaveBeenCalledWith(expect.objectContaining({
      model: 'seedance-2-omni',
      params: expect.objectContaining({
        mode: 'omni_reference',
        image_urls: ['https://cdn.test/person.jpg'],
        video_urls: undefined,
      }),
    }));
    const call = spy.mock.calls[0][0];
    expect(call.prompt).toContain('@image1');
    expect(call.prompt).toContain('Premium animated scene.');
    expect(call.prompt).toContain('Keep identity from the uploaded reference.');
  });

  it('runs Kling photo mode with a scene reference but no user reference', async () => {
    const provider = new StubAIProvider();
    const spy = jest.spyOn(provider, 'textToVideo');

    await sceneTransferBlock.executor(
      {
        generation_mode: 'photo',
        photo_model: 'kling-3-omni',
        scene_mode: 'photo',
        scene_image: 'https://cdn.test/movie-frame.jpg',
        primary_photo: '',
        no_reference_prompt: 'Generate without preserving a real person.',
        user_prompt: '',
        default_photo_prompt: 'animate the uploaded film still',
        duration: 5,
      },
      undefined,
      ctx(provider),
    );

    expect(spy).toHaveBeenCalledWith(expect.objectContaining({
      model: 'kling-3-omni',
      params: expect.objectContaining({
        images: ['https://cdn.test/movie-frame.jpg'],
        video: undefined,
      }),
    }));
    const call = spy.mock.calls[0][0];
    expect(call.prompt).toContain('@image_1');
    expect(call.prompt).toContain('Generate without preserving a real person.');
    expect(call.prompt).toContain('animate the uploaded film still');
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

  it('cartoon visual mode stylizes a single user reference before Seedance prompt mode', async () => {
    const provider = new StubAIProvider();
    const editSpy = jest.spyOn(provider, 'imageEdit');
    const videoSpy = jest.spyOn(provider, 'textToVideo');

    await sceneTransferBlock.executor(
      {
        generation_mode: 'prompt',
        prompt_model: 'seedance-2-omni',
        primary_photo: 'https://cdn.test/person.jpg',
        cartoon_visual_mode: 'cartoon',
        cartoon_style: 'classic hand-drawn animation',
        cartoon_character_prompt: 'Turn the person into a stable animated character.',
        stylize_model: 'gpt-image-2',
        stylize_prompt: 'make an animation character',
        user_prompt: 'the character runs across a magical bridge',
        duration: 5,
      },
      undefined,
      ctx(provider),
    );

    expect(editSpy).toHaveBeenCalledTimes(1);
    expect(editSpy.mock.calls[0][0]).toEqual(expect.objectContaining({
      imageUrl: 'https://cdn.test/person.jpg',
      model: 'gpt-image-2',
      prompt: 'make an animation character',
    }));
    expect(videoSpy.mock.calls[0][0]).toEqual(expect.objectContaining({
      model: 'seedance-2-omni',
      params: expect.objectContaining({
        mode: 'omni_reference',
        image_urls: ['stub://edited-image.jpg'],
      }),
    }));
    expect(videoSpy.mock.calls[0][0].prompt).toContain('classic hand-drawn animation');
    expect(videoSpy.mock.calls[0][0].prompt).toContain('Turn the person into a stable animated character.');
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
