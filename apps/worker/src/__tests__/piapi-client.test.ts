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
