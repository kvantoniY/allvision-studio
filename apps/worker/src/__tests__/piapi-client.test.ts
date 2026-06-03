import { extractPiAPIActualCostUsd, PiAPIClient } from '../providers/piapi-client';

describe('PiAPIClient polling', () => {
  it('throws PIAPI_TIMEOUT when polling exceeds timeoutMs', async () => {
    const client = new PiAPIClient({ apiKey: 'test' });
    jest.spyOn(client, 'getTask').mockResolvedValue({
      taskId: 'task-1',
      status: 'processing',
      actualCostUsd: null,
      raw: {},
    });

    await expect(client.pollUntilDone('task-1', {
      timeoutMs: 0,
      expectedDurationMs: 100,
    })).rejects.toMatchObject({ code: 'PIAPI_TIMEOUT' });
  });

  it('classifies upstream busy failed tasks separately from moderation', async () => {
    const client = new PiAPIClient({ apiKey: 'test' });
    jest.spyOn(client, 'getTask').mockResolvedValue({
      taskId: 'task-busy',
      status: 'failed',
      actualCostUsd: null,
      raw: {},
      errorCode: '10001',
      errorMessage: 'Internal upstream is busy (too many requests). Please try again later.',
    });

    await expect(client.pollUntilDone('task-busy', {
      timeoutMs: 1_000,
      expectedDurationMs: 100,
    })).rejects.toMatchObject({ code: 'PIAPI_UPSTREAM_BUSY' });
  });

  it('extracts actual USD cost from PiAPI usage consume', () => {
    expect(extractPiAPIActualCostUsd({
      data: {
        meta: {
          usage: {
            consume: 600_000,
          },
        },
      },
    })).toBeCloseTo(0.06);
  });

  it('requests GPT Image output as base64 to avoid a second provider download', async () => {
    const client = new PiAPIClient({ apiKey: 'test', baseUrl: 'https://api.test' });
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({
      data: [{ b64_json: Buffer.from('image').toString('base64') }],
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));

    const result = await client.generateGptImage({
      model: 'gpt-image-2',
      prompt: 'test prompt',
      imageUrls: [],
      size: '1024x1024',
      quality: 'standard',
      outputFormat: 'jpeg',
    });

    expect(result.b64).toBe(Buffer.from('image').toString('base64'));
    const request = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string) as Record<string, unknown>;
    expect(request.response_format).toBe('b64_json');
    fetchSpy.mockRestore();
  });

  it('does not retry a GPT Image request that aborts (avoids duplicate billing)', async () => {
    const client = new PiAPIClient({ apiKey: 'test', baseUrl: 'https://api.test' });
    const abortError = Object.assign(new Error('aborted'), { name: 'AbortError' });
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockRejectedValue(abortError);

    await expect(client.generateGptImage({
      model: 'gpt-image-2',
      prompt: 'test prompt',
      imageUrls: [],
      size: '1024x1024',
      quality: 'standard',
      outputFormat: 'jpeg',
    })).rejects.toMatchObject({ code: 'PIAPI_TIMEOUT' });

    // Один запрос, без повторов — иначе PiAPI сгенерировал бы лишнее изображение.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    fetchSpy.mockRestore();
  });
});
