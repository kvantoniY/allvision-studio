import { EventEmitter } from 'node:events';
import https from 'node:https';
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

  it('keeps polling through transient getTask network errors', async () => {
    jest.useFakeTimers();
    try {
      const client = new PiAPIClient({ apiKey: 'test' });
      const { ProviderError } = jest.requireActual<typeof import('../providers/provider-errors')>('../providers/provider-errors');
      jest.spyOn(client, 'getTask')
        .mockRejectedValueOnce(new ProviderError('PIAPI_NETWORK_ERROR', 'fetch failed'))
        .mockResolvedValueOnce({ taskId: 'task-flaky', status: 'completed', outputUrl: 'https://cdn.test/out.mp4', actualCostUsd: null, raw: {} });

      const promise = client.pollUntilDone('task-flaky', {
        timeoutMs: 60_000,
        expectedDurationMs: 100,
      });
      await jest.advanceTimersByTimeAsync(5_000);
      const result = await promise;
      expect(result.status).toBe('completed');
    } finally {
      jest.useRealTimers();
    }
  });

  it('fails fast when getTask returns a hard 4xx', async () => {
    const client = new PiAPIClient({ apiKey: 'test' });
    const { ProviderError } = jest.requireActual<typeof import('../providers/provider-errors')>('../providers/provider-errors');
    jest.spyOn(client, 'getTask').mockRejectedValue(new ProviderError('PIAPI_HTTP_401', 'unauthorized', 401));

    await expect(client.pollUntilDone('task-auth', {
      timeoutMs: 60_000,
      expectedDurationMs: 100,
    })).rejects.toMatchObject({ code: 'PIAPI_HTTP_401' });
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

describe('PiAPIClient gpt-image edit retries', () => {
  type FakeBehavior =
    | { kind: 'early-reset' }
    | { kind: 'reset-after-response-started' }
    | { kind: 'timeout' }
    | { kind: 'success'; json: unknown };

  function mockHttpsRequest(behaviors: FakeBehavior[]) {
    let call = 0;
    return jest.spyOn(https, 'request').mockImplementation(((_options: unknown, callback: (res: unknown) => void) => {
      const behavior = behaviors[Math.min(call, behaviors.length - 1)];
      call += 1;
      const req = new EventEmitter() as EventEmitter & {
        write: jest.Mock; end: jest.Mock; destroy: jest.Mock;
      };
      req.write = jest.fn();
      req.destroy = jest.fn((err?: Error) => {
        if (err) req.emit('error', err);
      });
      // Эмитим синхронно из end(): все обработчики уже навешаны к этому моменту,
      // а синхронность избавляет тест от гонок с fake timers.
      req.end = jest.fn(() => {
        const socket = new EventEmitter() as EventEmitter & { setKeepAlive: jest.Mock };
        socket.setKeepAlive = jest.fn();
        req.emit('socket', socket);
        if (behavior.kind === 'early-reset') {
          req.emit('error', Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' }));
          return;
        }
        if (behavior.kind === 'timeout') {
          req.emit('timeout');
          return;
        }
        const res = new EventEmitter() as EventEmitter & { statusCode: number };
        res.statusCode = 200;
        callback(res);
        if (behavior.kind === 'reset-after-response-started') {
          req.emit('error', Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' }));
          return;
        }
        res.emit('data', Buffer.from(JSON.stringify(behavior.json)));
        res.emit('end');
      });
      return req;
    }) as never);
  }

  const editParams = {
    model: 'gpt-image-2',
    prompt: 'test prompt',
    images: [{ buffer: Buffer.from('fake-image'), contentType: 'image/jpeg' }],
    size: '1024x1024',
    quality: 'auto',
    outputFormat: 'jpeg' as const,
  };

  beforeEach(() => {
    delete process.env.PIAPI_GPT_IMAGE_EDIT_RETRIES;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('retries an early connection reset (before any response byte) and succeeds', async () => {
    jest.useFakeTimers();
    const spy = mockHttpsRequest([
      { kind: 'early-reset' },
      { kind: 'success', json: { data: [{ url: 'https://image.test/after-retry.jpg' }] } },
    ]);

    const promise = new PiAPIClient({ apiKey: 'test' }).generateGptImage(editParams);
    await jest.advanceTimersByTimeAsync(2_000);
    const result = await promise;

    expect(result.url).toBe('https://image.test/after-retry.jpg');
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('marks the error neverReachedProvider when every attempt resets before a response byte', async () => {
    jest.useFakeTimers();
    const spy = mockHttpsRequest([{ kind: 'early-reset' }]);

    const promise = new PiAPIClient({ apiKey: 'test' }).generateGptImage(editParams);
    const assertion = expect(promise).rejects.toMatchObject({
      code: 'PIAPI_NETWORK_ERROR',
      meta: expect.objectContaining({ neverReachedProvider: true, responseStarted: false }),
    });
    await jest.advanceTimersByTimeAsync(20_000);
    await assertion;

    // Default 4 попытки: ранний RST = запрос не дошёл до PiAPI, повтор безопасен.
    expect(spy).toHaveBeenCalledTimes(4);
  });

  it('does not retry a reset after the response started (upstream may be rendering)', async () => {
    const spy = mockHttpsRequest([{ kind: 'reset-after-response-started' }]);

    await expect(new PiAPIClient({ apiKey: 'test' }).generateGptImage(editParams)).rejects.toMatchObject({
      code: 'PIAPI_NETWORK_ERROR',
      meta: expect.objectContaining({ responseStarted: true }),
    });

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('does not retry our own edit timeout (history recovery handles it)', async () => {
    const spy = mockHttpsRequest([{ kind: 'timeout' }]);

    await expect(new PiAPIClient({ apiKey: 'test' }).generateGptImage(editParams)).rejects.toMatchObject({
      code: 'PIAPI_TIMEOUT',
    });

    expect(spy).toHaveBeenCalledTimes(1);
  });
});
