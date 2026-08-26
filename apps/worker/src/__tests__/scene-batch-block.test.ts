import { sceneBatchBlock } from '../blocks/scene-batch';
import type { BlockContext } from '../blocks/types';

type ImageToVideoCall = { imageUrl: string; stepId: string; model: string };

function makeCtx(overrides: {
  imageToVideo?: (input: Record<string, unknown>) => Promise<{ outputUrl: string; costUsd: number; durationMs: number }>;
  imageEdit?: (input: Record<string, unknown>) => Promise<{ outputUrl: string; costUsd: number; durationMs: number }>;
} = {}) {
  const videoCalls: ImageToVideoCall[] = [];
  const editCalls: string[] = [];
  const warnings: string[] = [];

  const ctx = {
    generationId: 'gen-1',
    providerContext: { projectId: 'p1', stepId: 'step_1', userId: 'u1' },
    reportProgress: async () => undefined,
    storage: {} as never,
    logger: {
      info: () => undefined,
      warn: (message: string) => warnings.push(message),
      error: () => undefined,
    },
    getAIProvider: () => ({
      imageToVideo: async (input: Record<string, unknown>) => {
        const context = input.context as { stepId: string };
        videoCalls.push({ imageUrl: input.imageUrl as string, stepId: context.stepId, model: input.model as string });
        if (overrides.imageToVideo) return overrides.imageToVideo(input);
        return { outputUrl: `https://cdn.test/clip-${videoCalls.length}.mp4`, costUsd: 0.16, durationMs: 10 };
      },
      imageEdit: async (input: Record<string, unknown>) => {
        editCalls.push(input.imageUrl as string);
        if (overrides.imageEdit) return overrides.imageEdit(input);
        return { outputUrl: `https://cdn.test/styled-${editCalls.length}.jpg`, costUsd: 0.05, durationMs: 10 };
      },
    }),
  } as unknown as BlockContext;

  return { ctx, videoCalls, editCalls, warnings };
}

const PHOTOS = ['https://cdn.test/a.jpg', 'https://cdn.test/b.jpg', 'https://cdn.test/c.jpg'];

describe('scene-batch', () => {
  it('makes one clip per photo and keeps the upload order', async () => {
    const { ctx, videoCalls } = makeCtx();
    const output = await sceneBatchBlock.executor(
      { photos: PHOTOS, model: 'hailuo-2.3-fast', duration: 5 },
      undefined,
      ctx,
    ) as { metadata: { clips: string[]; sceneCount: number } };

    expect(videoCalls.map((call) => call.imageUrl)).toEqual(PHOTOS);
    expect(output.metadata.clips).toHaveLength(3);
    expect(output.metadata.sceneCount).toBe(3);
  });

  it('gives every scene its own stepId so clips do not overwrite each other', async () => {
    const { ctx, videoCalls } = makeCtx();
    await sceneBatchBlock.executor({ photos: PHOTOS }, undefined, ctx);

    const stepIds = videoCalls.map((call) => call.stepId);
    expect(new Set(stepIds).size).toBe(PHOTOS.length);
    expect(stepIds).toEqual(['step_1-scene-1', 'step_1-scene-2', 'step_1-scene-3']);
  });

  it('stylizes each frame before animating it when a style prompt is set', async () => {
    const { ctx, videoCalls, editCalls } = makeCtx();
    await sceneBatchBlock.executor(
      { photos: PHOTOS, mode: 'stylize-animate', stylize_prompt: 'cartoon', stylize_model: 'seedream-4' },
      undefined,
      ctx,
    );

    expect(editCalls).toEqual(PHOTOS);
    // В видео уходит стилизованный кадр, а не оригинал.
    expect(videoCalls.map((call) => call.imageUrl)).toEqual([
      'https://cdn.test/styled-1.jpg',
      'https://cdn.test/styled-2.jpg',
      'https://cdn.test/styled-3.jpg',
    ]);
  });

  it('survives a single failed scene instead of losing the whole video', async () => {
    let call = 0;
    const { ctx, warnings } = makeCtx({
      imageToVideo: async () => {
        call += 1;
        if (call === 2) throw new Error('provider blew up');
        return { outputUrl: `https://cdn.test/clip-${call}.mp4`, costUsd: 0.16, durationMs: 10 };
      },
    });

    const photos = Array.from({ length: 10 }, (_, index) => `https://cdn.test/${index}.jpg`);
    const output = await sceneBatchBlock.executor({ photos }, undefined, ctx) as {
      metadata: { sceneCount: number; failedCount: number };
    };

    expect(output.metadata.sceneCount).toBe(9);
    expect(output.metadata.failedCount).toBe(1);
    expect(warnings.join(' ')).toContain('сцена 2');
  });

  it('fails when too many scenes fall over, so the coins come back', async () => {
    const { ctx } = makeCtx({
      imageToVideo: async () => {
        throw new Error('provider down');
      },
    });

    await expect(sceneBatchBlock.executor({ photos: PHOTOS }, undefined, ctx)).rejects.toThrow('SCENE_BATCH_FAILED');
  });

  it('refuses to run without photos rather than producing an empty video', async () => {
    const { ctx } = makeCtx();
    await expect(sceneBatchBlock.executor({ photos: [] }, undefined, ctx)).rejects.toThrow('SCENE_BATCH_NO_PHOTOS');
  });

  it('ignores unresolved placeholders in the photo list', async () => {
    const { ctx, videoCalls } = makeCtx();
    await sceneBatchBlock.executor({ photos: ['{{user.photos}}', PHOTOS[0], PHOTOS[1]] }, undefined, ctx);
    expect(videoCalls.map((call) => call.imageUrl)).toEqual([PHOTOS[0], PHOTOS[1]]);
  });

  it('caps the number of scenes so a template cannot run away', async () => {
    const { ctx, videoCalls } = makeCtx();
    const photos = Array.from({ length: 20 }, (_, index) => `https://cdn.test/${index}.jpg`);
    await sceneBatchBlock.executor({ photos, max_scenes: 6 }, undefined, ctx);
    expect(videoCalls).toHaveLength(6);
  });
});
