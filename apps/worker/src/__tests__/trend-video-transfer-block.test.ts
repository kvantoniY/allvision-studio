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

  it('routes subject_type=human to Kling Motion 3.0 Pro and animal to Wan Motion', async () => {
    const providerHuman = new StubAIProvider();
    const humanSpy = jest.spyOn(providerHuman, 'motionTransfer');
    await trendVideoTransferBlock.executor(
      { mode: 'motion_transfer', people_count: 'one', subject_type: 'human', reference_video: 'https://cdn.test/d.mp4', primary_photo: 'https://cdn.test/p.jpg', motion_model: 'wan-motion', duration: 6 },
      undefined,
      ctx(providerHuman),
    );
    expect(humanSpy).toHaveBeenCalledWith(expect.objectContaining({ model: 'kling-motion-3.0-pro' }));

    const providerAnimal = new StubAIProvider();
    const animalSpy = jest.spyOn(providerAnimal, 'motionTransfer');
    await trendVideoTransferBlock.executor(
      { mode: 'motion_transfer', people_count: 'one', subject_type: 'animal', reference_video: 'https://cdn.test/d.mp4', primary_photo: 'https://cdn.test/p.jpg', motion_model: 'kling-motion-3.0-pro', duration: 6 },
      undefined,
      ctx(providerAnimal),
    );
    expect(animalSpy).toHaveBeenCalledWith(expect.objectContaining({ model: 'wan-motion' }));
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

  it('falls back to Wan Motion when Kling Motion Control rejects a non-human image', async () => {
    const provider = new StubAIProvider();
    const motionSpy = jest
      .spyOn(provider, 'motionTransfer')
      .mockRejectedValueOnce(new Error('submit: Failed to upload character image (may require human in image)'))
      .mockResolvedValueOnce({ outputUrl: 'stub://wan-motion.mp4', costUsd: 0, durationMs: 0, meta: {} });

    const output = await trendVideoTransferBlock.executor(
      {
        mode: 'motion_transfer',
        people_count: 'one',
        reference_video: 'https://cdn.test/dance.mp4',
        primary_photo: 'https://cdn.test/cat.jpg',
        motion_model: 'kling-motion-3.0-std',
        duration: 8,
      },
      undefined,
      ctx(provider),
    );

    expect(motionSpy).toHaveBeenLastCalledWith(expect.objectContaining({
      model: 'wan-motion',
      inputImageUrl: 'https://cdn.test/cat.jpg',
      drivingVideoUrl: 'https://cdn.test/dance.mp4',
    }));
    expect(output).toEqual(expect.objectContaining({ type: 'video', url: 'stub://wan-motion.mp4' }));
  });

  it('falls back to Wan Motion when Kling Motion Control rejects framing (no upper body)', async () => {
    const provider = new StubAIProvider();
    const motionSpy = jest
      .spyOn(provider, 'motionTransfer')
      .mockRejectedValueOnce(new Error('fal result fetch failed (422): {"detail":[{"msg":"Image recognition failed. Error: No complete upper body detected in the image; ensure the upper body is clearly visible.","type":"input_value_error"}]}'))
      .mockResolvedValueOnce({ outputUrl: 'stub://wan-motion.mp4', costUsd: 0, durationMs: 0, meta: {} });

    const output = await trendVideoTransferBlock.executor(
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
    );

    expect(motionSpy).toHaveBeenLastCalledWith(expect.objectContaining({ model: 'wan-motion' }));
    expect(output).toEqual(expect.objectContaining({ type: 'video', url: 'stub://wan-motion.mp4' }));
  });

  it('does not fall back when Motion Control fails for an unrelated reason', async () => {
    const provider = new StubAIProvider();
    jest.spyOn(provider, 'motionTransfer').mockRejectedValue(new Error('PIAPI_TIMEOUT'));
    const omniSpy = jest.spyOn(provider, 'textToVideo');

    await expect(
      trendVideoTransferBlock.executor(
        {
          mode: 'motion_transfer',
          people_count: 'one',
          reference_video: 'https://cdn.test/dance.mp4',
          primary_photo: 'https://cdn.test/person.jpg',
          duration: 8,
        },
        undefined,
        ctx(provider),
      ),
    ).rejects.toThrow('PIAPI_TIMEOUT');
    expect(omniSpy).not.toHaveBeenCalled();
  });

  it('routes kling_omni reference transfer to Seedance Omni (kling-3-omni is text-only on fal)', async () => {
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

    // kling-3-omni на fal не принимает image/video reference -> прозрачно уходит на seedance-2-omni.
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({
      model: 'seedance-2-omni',
      params: expect.objectContaining({
        mode: 'omni_reference',
        image_urls: ['https://cdn.test/left.jpg', 'https://cdn.test/right.jpg'],
        video_urls: ['https://cdn.test/duo.mp4'],
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
      prompt: expect.stringContaining('@image1'),
      durationSec: 12,
      model: 'seedance-2-omni',
      params: expect.objectContaining({
        mode: 'omni_reference',
        image_urls: ['https://cdn.test/left.jpg', 'https://cdn.test/right.jpg'],
        video_urls: ['https://cdn.test/duo.mp4'],
        aspect_ratio: '9:16',
        resolution: '720p',
      }),
    }));
    expect(output).toEqual(expect.objectContaining({ type: 'video', url: 'stub://text-to-video.mp4' }));
  });
});
