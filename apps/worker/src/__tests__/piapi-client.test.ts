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
});
