import { prisma, ProcessingType, ProjectStatus } from '@allvision/database';
import { QUEUE_NAMES } from '@allvision/shared';
import { queueConcurrencyFor } from '../index';
import { PiAPIProvider } from '../providers/piapi-provider';
import { ProviderError } from '../providers/provider-errors';
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
    publishFileUrl: jest.fn(),
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
  await prisma.project.deleteMany({ where: { id: { startsWith: `worker-piapi-${RUN_ID}` } } });
  await prisma.service.deleteMany({ where: { slug: { startsWith: `worker-piapi-${RUN_ID}` } } });
  await prisma.user.deleteMany({ where: { id: { startsWith: `worker-piapi-${RUN_ID}` } } });
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

  it('records timeout_charged when final PiAPI status completed after polling timeout', async () => {
    process.env.ALLOW_REAL_PIAPI_IN_TEST = 'true';
    const userId = `worker-piapi-${RUN_ID}-timeout-user`;
    const projectId = `worker-piapi-${RUN_ID}-timeout-project`;
    const service = await prisma.service.create({
      data: {
        slug: `worker-piapi-${RUN_ID}-timeout-service`,
        title: 'PiAPI timeout test service',
        shortDesc: 'PiAPI timeout test',
        description: 'PiAPI timeout test',
        category: "NOSTALGIA",
        priceTokens: 0,
        costUsd: 0,
        galleryImages: [],
        processingType: ProcessingType.AUTO,
      },
    });
    await prisma.user.create({
      data: {
        id: userId,
        email: `worker-piapi-${RUN_ID}-timeout@example.com`,
        passwordHash: 'hash',
        tokenBalance: 0,
      },
    });
    await prisma.project.create({
      data: {
        id: projectId,
        userId,
        serviceId: service.id,
        title: 'PiAPI timeout test project',
        status: ProjectStatus.PROCESSING,
        inputImages: [],
        tokensCost: 0,
      },
    });
    const storage = fakeStorage();
    const publisher = {
      publishImageUrl: jest.fn().mockResolvedValue({ publicUrl: 'https://cdn.test/swap.jpg' }),
      publishFileUrl: jest.fn().mockResolvedValue({ publicUrl: 'https://cdn.test/target.mp4' }),
    };
    const provider = new PiAPIProvider({
      apiKey: 'test-key',
      dailyCapUsd: 999,
      balanceMinUsd: 0,
      storage,
      publisher: publisher as never,
      logger,
    });
    const client = {
      createTask: jest.fn().mockResolvedValue({ taskId: `timeout-charged-${RUN_ID}`, raw: {} }),
      pollUntilDone: jest.fn().mockRejectedValue(new Error('placeholder')),
      getTask: jest.fn(),
    };
    client.pollUntilDone.mockRejectedValue(new ProviderError('PIAPI_TIMEOUT', 'PiAPI timed out'));
    client.getTask.mockResolvedValue({
      taskId: `timeout-charged-${RUN_ID}`,
      status: 'completed',
      outputUrl: 'https://piapi.test/output.mp4',
      actualCostUsd: 0.42,
      raw: {},
    });
    (provider as unknown as { client: typeof client }).client = client;

    await expect(provider.faceSwapVideo({
      swapImageUrl: 'https://input.test/swap.jpg',
      targetVideoUrl: 'https://input.test/target.mp4',
      model: 'qubico-video-toolkit',
      params: { duration: 1, estimatedFrames: 1 },
      context: {
        projectId,
        userId,
        blockSlug: 'face-swap-video',
        stepId: 'step_face',
      },
    })).rejects.toMatchObject({ code: 'PIAPI_TIMEOUT' });

    const log = await prisma.aIUsageLog.findFirst({
      where: { taskId: `timeout-charged-${RUN_ID}` },
    });
    expect(log?.status).toBe('timeout_charged');
    expect(log?.costUsd).toBeCloseTo(0.42);
    expect(log?.recoverableOutputUrl).toBe('https://piapi.test/output.mp4');
  });
});
