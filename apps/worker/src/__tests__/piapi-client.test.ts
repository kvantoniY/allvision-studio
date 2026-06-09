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

  it('requests GPT Image output as URL to avoid large long-held responses', async () => {
    const client = new PiAPIClient({ apiKey: 'test', baseUrl: 'https://api.test' });
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({
      data: [{ url: 'https://image.test/result.jpg' }],
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));

    const result = await client.generateGptImage({
      model: 'gpt-image-2',
      prompt: 'test prompt',
      images: [],
      size: '1024x1024',
      quality: 'standard',
      outputFormat: 'jpeg',
    });

    expect(result.url).toBe('https://image.test/result.jpg');
    const request = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string) as Record<string, unknown>;
    expect(request.response_format).toBe('url');
    fetchSpy.mockRestore();
  });

  it('normalises GPT Image records from PiAPI user history', async () => {
    const client = new PiAPIClient({ apiKey: 'test', baseUrl: 'https://api.test' });
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({
      data: {
        items: [
          {
            task_id: 'history-task-1',
            model: 'gpts',
            status: 'success',
            input: { model: 'gpt-image-2', prompt: 'test prompt' },
            output: { data: [{ url: 'https://image.test/history.jpg' }] },
            meta: { created_at: 1_770_000_000 },
          },
        ],
      },
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));

    const history = await client.getUserTaskHistory({
      model: 'gpts',
      startTimeSec: 1,
      endTimeSec: 2,
      pageSize: 50,
    });

    expect(history.tasks[0]).toEqual(expect.objectContaining({
      taskId: 'history-task-1',
      model: 'gpts',
      status: 'completed',
      input: { model: 'gpt-image-2', prompt: 'test prompt' },
      outputUrl: 'https://image.test/history.jpg',
    }));
    expect(fetchSpy.mock.calls[0][0]).toBe('https://api.test/api/open/tasks/histories?page=1&page_size=50&model=gpts&start_time=1&end_time=2');
    fetchSpy.mockRestore();
  });

  it('does not retry a GPT Image request that aborts (avoids duplicate billing)', async () => {
    const client = new PiAPIClient({ apiKey: 'test', baseUrl: 'https://api.test' });
    const abortError = Object.assign(new Error('aborted'), { name: 'AbortError' });
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockRejectedValue(abortError);

    await expect(client.generateGptImage({
      model: 'gpt-image-2',
      prompt: 'test prompt',
      images: [],
      size: '1024x1024',
      quality: 'standard',
      outputFormat: 'jpeg',
    })).rejects.toMatchObject({ code: 'PIAPI_TIMEOUT' });

    // Один запрос, без повторов — иначе PiAPI сгенерировал бы лишнее изображение.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    fetchSpy.mockRestore();
  });
});
