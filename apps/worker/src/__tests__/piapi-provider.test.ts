import { prisma } from '@allvision/database';
import { QUEUE_NAMES } from '@allvision/shared';
import { queueConcurrencyFor } from '../index';
import { PiAPIProvider } from '../providers/piapi-provider';
import {
  assertPiAPIDailyCap,
  createAIUsageLog,
  deleteAIUsageLogsByUserIdPrefix,
} from '../providers/usage-limits';

const RUN_ID = Date.now();

function fakeStorage() {
  return {
    upload: jest.fn(),
    getSignedUrl: jest.fn(),
    delete: jest.fn(),
  };
}

function fakePublisher() {
  return {
    publishImageUrl: jest.fn(),
  } as never;
}

const logger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

afterEach(async () => {
  delete process.env.ALLOW_REAL_PIAPI_IN_TEST;
  await deleteAIUsageLogsByUserIdPrefix(`worker-piapi-${RUN_ID}`);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('PiAPI provider safety', () => {
  it('refuses to run in test environment without explicit opt-in', () => {
    expect(() => new PiAPIProvider({
      apiKey: 'test-key',
      dailyCapUsd: 5,
      balanceMinUsd: 2,
      storage: fakeStorage(),
      publisher: fakePublisher(),
      logger,
    })).toThrow('PiAPIProvider refuses to run in test environment');
  });

  it('rejects calls when the daily cap is already reached', async () => {
    await createAIUsageLog({
      userId: `worker-piapi-${RUN_ID}`,
      blockSlug: 'image-to-video',
      provider: 'piapi',
      model: 'kling-std',
      status: 'success',
      costUsd: 5,
      durationMs: 10,
    });

    await expect(assertPiAPIDailyCap(0.01, 5)).rejects.toThrow('PiAPI daily cap exceeded');
  });

  it('keeps service-pipeline worker concurrency at 1', () => {
    expect(queueConcurrencyFor(QUEUE_NAMES.SERVICE_PIPELINE)).toBe(1);
  });
});
