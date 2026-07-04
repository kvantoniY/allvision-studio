import { trendVideoTransferBlock } from '../blocks/trend-video-transfer';
import { StubAIProvider } from '../providers/stub-ai-provider';

function ctx(provider = new StubAIProvider()) {
  return {
    generationId: 'test-generation',
    providerContext: {
      projectId: 'test-project',
      userId: 'test-user',
      blockSlug: 'trend-video-transfer',
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

describe('trend-video-transfer block', () => {
  it('runs single-person face swap', async () => {
    const provider = new StubAIProvider();
    const spy = jest.spyOn(provider, 'faceSwapVideo');

    const output = await trendVideoTransferBlock.executor(
      {
        mode: 'face_swap',
        people_count: 'one',
        reference_video: 'https://cdn.test/trend.mp4',
        primary_photo: 'https://cdn.test/person.jpg',
        duration: 10,
      },
      undefined,
      ctx(provider),
    );

    expect(spy).toHaveBeenCalledWith(expect.objectContaining({
      swapImageUrl: 'https://cdn.test/person.jpg',
      targetVideoUrl: 'https://cdn.test/trend.mp4',
      model: 'qubico-video-toolkit',
    }));
    expect(output).toEqual(expect.objectContaining({ type: 'video', url: 'stub://face-swap.mp4' }));
  });

  it('runs two-person face swap sequentially', async () => {
    const provider = new StubAIProvider();
    const spy = jest.spyOn(provider, 'faceSwapVideo');

    await trendVideoTransferBlock.executor(
      {
        mode: 'face_swap',
        people_count: 'two',
        reference_video: 'https://cdn.test/duo.mp4',
        primary_photo: 'https://cdn.test/left.jpg',
        secondary_photo: 'https://cdn.test/right.jpg',
      },
      undefined,
      ctx(provider),
    );

    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy.mock.calls[0][0]).toEqual(expect.objectContaining({
      swapImageUrl: 'https://cdn.test/left.jpg',
      targetVideoUrl: 'https://cdn.test/duo.mp4',
    }));
    expect(spy.mock.calls[1][0]).toEqual(expect.objectContaining({
      swapImageUrl: 'https://cdn.test/right.jpg',
      targetVideoUrl: 'stub://face-swap.mp4',
    }));
  });

  it('runs single-person motion transfer', async () => {
    const provider = new StubAIProvider();
    const spy = jest.spyOn(provider, 'motionTransfer');

    const output = await trendVideoTransferBlock.executor(
      {
        mode: 'motion_transfer',
        people_count: 'one',
        reference_video: 'https://cdn.test/dance.mp4',
        primary_photo: 'https://cdn.test/person.jpg',
        duration: 5,
      },
      undefined,
      ctx(provider),
    );

    expect(spy).toHaveBeenCalledWith(expect.objectContaining({
      inputImageUrl: 'https://cdn.test/person.jpg',
      drivingVideoUrl: 'https://cdn.test/dance.mp4',
      // Дефолтный движок — Wan Motion (animal-safe pose retargeting), см. runMotionTransfer.
      model: 'wan-motion',
    }));
    expect(output).toEqual(expect.objectContaining({ type: 'video', url: 'stub://motion-transfer.mp4' }));
  });

  it('routes subject_type=human to the human model and animal to pose step + animal model', async () => {
    const providerHuman = new StubAIProvider();
    const humanSpy = jest.spyOn(providerHuman, 'motionTransfer');
    const humanEditSpy = jest.spyOn(providerHuman, 'imageEdit');
    await trendVideoTransferBlock.executor(
      { mode: 'motion_transfer', people_count: 'one', subject_type: 'human', reference_video: 'https://cdn.test/d.mp4', primary_photo: 'https://cdn.test/p.jpg', motion_model: 'wan-motion', duration: 6 },
      undefined,
      ctx(providerHuman),
    );
    expect(humanSpy).toHaveBeenCalledWith(expect.objectContaining({ model: 'kling-motion-3.0-pro' }));
    // Для человека промежуточного image-шага нет.
    expect(humanEditSpy).not.toHaveBeenCalled();

    const providerAnimal = new StubAIProvider();
    const animalSpy = jest.spyOn(providerAnimal, 'motionTransfer');
    const poseSpy = jest.spyOn(providerAnimal, 'imageEdit');
    const animalOutput = await trendVideoTransferBlock.executor(
      { mode: 'motion_transfer', people_count: 'one', subject_type: 'animal', reference_video: 'https://cdn.test/d.mp4', primary_photo: 'https://cdn.test/cat.jpg', motion_model: 'kling-motion-3.0-pro', duration: 6 },
      undefined,
      ctx(providerAnimal),
    );
    // Промежуточная поза сохраняется в metadata результата (видна в «Детали генерации»).
    expect(animalOutput).toEqual(expect.objectContaining({
      metadata: expect.objectContaining({ animalPoseImage: 'stub://edited-image.jpg' }),
    }));
    // Животное: сначала GPT Image ставит питомца в полный рост, затем движение из позы.
    expect(poseSpy).toHaveBeenCalledWith(expect.objectContaining({
      imageUrl: 'https://cdn.test/cat.jpg',
      model: 'gpt-image-2',
      prompt: expect.stringContaining('standing upright'),
    }));
    expect(animalSpy).toHaveBeenCalledWith(expect.objectContaining({
      model: 'wan-2.7-reference',
      inputImageUrl: 'stub://edited-image.jpg',
    }));
  });

  it('does not leak the human prompt into the animal branch (uses animal_prompt instead)', async () => {
    const provider = new StubAIProvider();
    const spy = jest.spyOn(provider, 'motionTransfer');
    await trendVideoTransferBlock.executor(
      {
        mode: 'motion_transfer',
        people_count: 'one',
        subject_type: 'animal',
        prompt: 'preserve the uploaded person identity, stable face',
        animal_prompt: 'the cat dances with joy',
        reference_video: 'https://cdn.test/d.mp4',
        primary_photo: 'https://cdn.test/cat.jpg',
        duration: 6,
      },
      undefined,
      ctx(provider),
    );
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ prompt: 'the cat dances with joy' }));

    const providerNoPrompt = new StubAIProvider();
    const spyNoPrompt = jest.spyOn(providerNoPrompt, 'motionTransfer');
    await trendVideoTransferBlock.executor(
      {
        mode: 'motion_transfer',
        people_count: 'one',
        subject_type: 'animal',
        prompt: 'preserve the uploaded person identity, stable face',
        reference_video: 'https://cdn.test/d.mp4',
        primary_photo: 'https://cdn.test/cat.jpg',
        duration: 6,
      },
      undefined,
      ctx(providerNoPrompt),
    );
    expect(spyNoPrompt).toHaveBeenCalledWith(expect.objectContaining({ prompt: undefined }));
  });

  it('respects admin overrides for human/animal motion models and pose toggle', async () => {
    const provider = new StubAIProvider();
    const motionSpy = jest.spyOn(provider, 'motionTransfer');
    const editSpy = jest.spyOn(provider, 'imageEdit');
    await trendVideoTransferBlock.executor(
      {
        mode: 'motion_transfer',
        people_count: 'one',
        subject_type: 'animal',
        animal_motion_model: 'scail-2',
        animal_pose_enabled: false,
        reference_video: 'https://cdn.test/d.mp4',
        primary_photo: 'https://cdn.test/cat.jpg',
        duration: 6,
      },
      undefined,
      ctx(provider),
    );
    expect(editSpy).not.toHaveBeenCalled();
    expect(motionSpy).toHaveBeenCalledWith(expect.objectContaining({
      model: 'scail-2',
      inputImageUrl: 'https://cdn.test/cat.jpg',
    }));

    const providerHuman = new StubAIProvider();
    const humanSpy = jest.spyOn(providerHuman, 'motionTransfer');
    await trendVideoTransferBlock.executor(
      { mode: 'motion_transfer', people_count: 'one', subject_type: 'human', human_motion_model: 'kling-motion-2.6-pro', reference_video: 'https://cdn.test/d.mp4', primary_photo: 'https://cdn.test/p.jpg', duration: 6 },
      undefined,
      ctx(providerHuman),
    );
    expect(humanSpy).toHaveBeenCalledWith(expect.objectContaining({ model: 'kling-motion-2.6-pro' }));
  });

  it('does NOT fall back to another model: the selected model error propagates', async () => {
    const provider = new StubAIProvider();
    const motionSpy = jest
      .spyOn(provider, 'motionTransfer')
      .mockRejectedValue(new Error('fal result fetch failed (422): may require human in image'));

    await expect(
      trendVideoTransferBlock.executor(
        {
          mode: 'motion_transfer',
          people_count: 'one',
          subject_type: 'animal',
          reference_video: 'https://cdn.test/dance.mp4',
          primary_photo: 'https://cdn.test/cat.jpg',
          duration: 8,
        },
        undefined,
        ctx(provider),
      ),
    ).rejects.toThrow('may require human in image');
    // Ровно один вызов: тихого повтора другой моделью (Wan 2.2 и т.п.) больше нет.
    expect(motionSpy).toHaveBeenCalledTimes(1);
    expect(motionSpy).toHaveBeenCalledWith(expect.objectContaining({ model: 'wan-2.7-reference' }));
  });

  it('uses default_mode when the user does not choose a transfer mode', async () => {
    const provider = new StubAIProvider();
    const spy = jest.spyOn(provider, 'motionTransfer');

    await trendVideoTransferBlock.executor(
      {
        default_mode: 'motion_transfer',
        people_count: 'one',
        reference_video: 'https://cdn.test/default.mp4',
        primary_photo: 'https://cdn.test/person.jpg',
        duration: 6,
      },
      undefined,
      ctx(provider),
    );

    expect(spy).toHaveBeenCalledWith(expect.objectContaining({
      inputImageUrl: 'https://cdn.test/person.jpg',
      drivingVideoUrl: 'https://cdn.test/default.mp4',
      model: 'wan-motion',
    }));
  });

  it('propagates Kling Motion Control rejection without silent retry', async () => {
    const provider = new StubAIProvider();
    const motionSpy = jest
      .spyOn(provider, 'motionTransfer')
      .mockRejectedValue(new Error('fal result fetch failed (422): {"detail":[{"msg":"No complete upper body detected in the image","type":"input_value_error"}]}'));
    const omniSpy = jest.spyOn(provider, 'textToVideo');

    await expect(
      trendVideoTransferBlock.executor(
        {
          mode: 'motion_transfer',
          people_count: 'one',
          reference_video: 'https://cdn.test/dance.mp4',
          primary_photo: 'https://cdn.test/face.jpg',
          motion_model: 'kling-motion-3.0-std',
          duration: 8,
        },
        undefined,
        ctx(provider),
      ),
    ).rejects.toThrow('No complete upper body detected');
    expect(motionSpy).toHaveBeenCalledTimes(1);
    expect(omniSpy).not.toHaveBeenCalled();
  });

  it('routes kling_omni reference transfer to Kling O3 Reference V2V (kling-3-omni is text-only on fal)', async () => {
    const provider = new StubAIProvider();
    const spy = jest.spyOn(provider, 'textToVideo');

    const output = await trendVideoTransferBlock.executor(
      {
        mode: 'kling_omni',
        people_count: 'two',
        reference_video: 'https://cdn.test/duo.mp4',
        primary_photo: 'https://cdn.test/left.jpg',
        secondary_photo: 'https://cdn.test/right.jpg',
        duration: 10,
      },
      undefined,
      ctx(provider),
    );

    // kling-3-omni на fal не принимает image/video reference -> прозрачно уходит на Kling O3 Reference V2V.
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({
      model: 'kling-o3-omni',
      prompt: expect.stringContaining('@Video1'),
      params: expect.objectContaining({
        images: ['https://cdn.test/left.jpg', 'https://cdn.test/right.jpg'],
        video: 'https://cdn.test/duo.mp4',
        keep_audio: true,
      }),
    }));
    expect(output).toEqual(expect.objectContaining({ type: 'video', url: 'stub://text-to-video.mp4' }));
  });

  it('runs two-person Seedance Omni with image and video references', async () => {
    const provider = new StubAIProvider();
    const spy = jest.spyOn(provider, 'textToVideo');

    const output = await trendVideoTransferBlock.executor(
      {
        mode: 'seedance_omni',
        people_count: 'two',
        reference_video: 'https://cdn.test/duo.mp4',
        primary_photo: 'https://cdn.test/left.jpg',
        secondary_photo: 'https://cdn.test/right.jpg',
        duration: 12,
      },
      undefined,
      ctx(provider),
    );

    expect(spy).toHaveBeenCalledWith(expect.objectContaining({
      prompt: expect.stringContaining('@Image1'),
      durationSec: 12,
      model: 'seedance-2-omni',
      params: expect.objectContaining({
        mode: 'omni_reference',
        image_urls: ['https://cdn.test/left.jpg', 'https://cdn.test/right.jpg'],
        video_urls: ['https://cdn.test/duo.mp4'],
        aspect_ratio: 'auto',
        resolution: '720p',
      }),
    }));
    expect(output).toEqual(expect.objectContaining({ type: 'video', url: 'stub://text-to-video.mp4' }));
  });
});
