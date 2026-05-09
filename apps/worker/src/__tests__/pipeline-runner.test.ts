import { z } from 'zod';
import {
  prisma,
  ProcessingType,
  ProjectStatus,
  ServiceCategory,
  type Service,
  type User,
} from '@allvision/database';
import type { BlockDefinition, BlockOutput } from '../blocks/types';
import {
  resolvePlaceholders,
  runPipeline,
  type PipelineStep,
} from '../pipeline-runner';
import { StubAIProvider } from '../providers/stub-ai-provider';
import { deleteAIUsageLogsByUserIds } from '../providers/usage-limits';

const RUN_ID = Date.now();

const outputSchema = z.object({
  type: z.enum(['image', 'video']),
  url: z.string(),
  metadata: z.record(z.unknown()).optional(),
});

function noopLogger() {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
}

function fakeStorage() {
  return {
    upload: jest.fn(),
    getSignedUrl: jest.fn(),
    delete: jest.fn(),
  };
}

function stubProviderFactory() {
  const provider = new StubAIProvider();
  return () => provider;
}

function makeBlock(params: {
  slug: string;
  output?: BlockOutput;
  fail?: boolean;
  onProgress?: (percent: number) => Promise<void>;
}): BlockDefinition {
  return {
    slug: params.slug,
    title: params.slug,
    description: params.slug,
    category: 'image',
    inputSchema: z.unknown(),
    outputSchema,
    paramsSchema: z.unknown(),
    supportedModels: [{ slug: 'mock', title: 'Mock', tierHint: 'both', estimatedCostCoins: 1, provider: 'mock' }],
    estimatedCostCoins: () => 1,
    async executor(_blockParams, _input, ctx) {
      await ctx.reportProgress(50);
      await params.onProgress?.(50);
      if (params.fail) throw new Error(`Block failed: ${params.slug}`);
      await ctx.reportProgress(100);
      return params.output ?? { type: 'image', url: `mock://${params.slug}.jpg` };
    },
  };
}

async function createUser(balance = 100): Promise<User> {
  return prisma.user.create({
    data: {
      email: `worker-pipeline-${RUN_ID}-${Math.random()}@example.com`,
      passwordHash: 'hash',
      name: 'Worker Pipeline User',
      tokenBalance: balance,
    },
  });
}

async function createService(): Promise<Service> {
  return prisma.service.create({
    data: {
      slug: `worker-pipeline-${RUN_ID}-${Math.random()}`,
      title: 'Worker Pipeline Service',
      shortDesc: 'Pipeline test',
      description: 'Pipeline test',
      category: ServiceCategory.NOSTALGIA,
      priceTokens: 0,
      costUsd: 0,
      galleryImages: [],
      isActive: false,
      processingType: ProcessingType.AUTO,
      pipelineConfig: [],
      userInputForm: {},
      priceCoinsStandard: 1,
      priceCoinsPro: 2,
    },
  });
}

async function createProject(params: {
  user: User;
  service: Service;
  pipeline: PipelineStep[];
  tokensCost?: number;
}) {
  return prisma.project.create({
    data: {
      userId: params.user.id,
      serviceId: params.service.id,
      title: `Pipeline Project ${RUN_ID}`,
      status: ProjectStatus.PENDING,
      inputImages: [],
      tokensCost: params.tokensCost ?? 0,
      pipelineSnapshot: params.pipeline,
      userInputs: { photo: 'mock://photo.jpg', name: 'Alice' },
      selectedTier: 'standard',
      stepProgress: [],
    },
  });
}

async function cleanup() {
  const users = await prisma.user.findMany({
    where: { email: { contains: `worker-pipeline-${RUN_ID}` } },
    select: { id: true },
  });
  const userIds = users.map((user) => user.id);
  if (userIds.length > 0) {
    await deleteAIUsageLogsByUserIds(userIds);
    await prisma.tokenTransaction.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.project.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
  await prisma.service.deleteMany({ where: { slug: { contains: `worker-pipeline-${RUN_ID}` } } });
}

beforeEach(async () => {
  await cleanup();
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe('resolvePlaceholders', () => {
  it('resolves user fields, step output fields, and tier model choices', () => {
    const resolved = resolvePlaceholders(
      {
        photo: '{{user.photo}}',
        prevUrl: '{{step_1.url}}',
        embedded: 'Hello {{user.name}}',
        model: { standard: 'kling-std', pro: 'kling-pro' },
      },
      {
        userInputs: { photo: 'photo.jpg', name: 'Alice' },
        stepOutputs: { step_1: { type: 'image', url: 'restored.jpg' } },
        selectedTier: 'pro',
      },
    );

    expect(resolved).toEqual({
      photo: 'photo.jpg',
      prevUrl: 'restored.jpg',
      embedded: 'Hello Alice',
      model: 'kling-pro',
    });
  });
});

describe('runPipeline', () => {
  it('runs a simple two-step pipeline successfully', async () => {
    const user = await createUser();
    const service = await createService();
    const pipeline = [
      { id: 'step_1', blockSlug: 'restore' },
      { id: 'step_2', blockSlug: 'video' },
    ];
    const project = await createProject({ user, service, pipeline });
    const blocks = {
      restore: makeBlock({ slug: 'restore', output: { type: 'image', url: 'mock://restored.jpg' } }),
      video: makeBlock({ slug: 'video', output: { type: 'video', url: 'mock://final.mp4' } }),
    };

    await runPipeline(
      {
        generationId: project.id,
        pipelineConfig: pipeline,
        userInputs: { photo: 'photo.jpg' },
        selectedTier: 'standard',
      },
      {
        getBlock: (slug) => blocks[slug as keyof typeof blocks],
        getAIProvider: stubProviderFactory(),
        storage: fakeStorage(),
        logger: noopLogger(),
      },
    );

    const updated = await prisma.project.findUniqueOrThrow({ where: { id: project.id } });
    expect(updated.status).toBe(ProjectStatus.COMPLETED);
    expect(updated.progress).toBe(100);
    expect(updated.resultVideo).toBe('mock://final.mp4');
    expect(updated.stepProgress).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ stepId: 'step_1', status: 'completed', progress: 100 }),
        expect.objectContaining({ stepId: 'step_2', status: 'completed', progress: 100 }),
      ]),
    );
  });

  it('aggregates step progress into project progress', async () => {
    const user = await createUser();
    const service = await createService();
    const pipeline = [
      { id: 'step_1', blockSlug: 'first' },
      { id: 'step_2', blockSlug: 'second' },
    ];
    const project = await createProject({ user, service, pipeline });
    const observed: number[] = [];
    const blocks = {
      first: makeBlock({
        slug: 'first',
        onProgress: async () => {
          const current = await prisma.project.findUniqueOrThrow({ where: { id: project.id } });
          observed.push(current.progress);
        },
      }),
      second: makeBlock({
        slug: 'second',
        output: { type: 'video', url: 'mock://done.mp4' },
        onProgress: async () => {
          const current = await prisma.project.findUniqueOrThrow({ where: { id: project.id } });
          observed.push(current.progress);
        },
      }),
    };

    await runPipeline(
      { generationId: project.id, pipelineConfig: pipeline, selectedTier: 'standard' },
      {
        getBlock: (slug) => blocks[slug as keyof typeof blocks],
        getAIProvider: stubProviderFactory(),
        storage: fakeStorage(),
        logger: noopLogger(),
      },
    );

    expect(observed).toContain(25);
    expect(observed).toContain(75);
  });

  it('marks failed pipeline and refunds project tokens', async () => {
    const user = await createUser(100);
    const service = await createService();
    const pipeline = [{ id: 'step_1', blockSlug: 'bad' }];
    const project = await createProject({ user, service, pipeline, tokensCost: 10 });

    await expect(
      runPipeline(
        { generationId: project.id, pipelineConfig: pipeline, selectedTier: 'standard' },
        {
          getBlock: () => makeBlock({ slug: 'bad', fail: true }),
          getAIProvider: stubProviderFactory(),
          storage: fakeStorage(),
          logger: noopLogger(),
        },
      ),
    ).rejects.toThrow('Block failed: bad');

    const updatedProject = await prisma.project.findUniqueOrThrow({ where: { id: project.id } });
    const updatedUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    const refund = await prisma.tokenTransaction.findFirst({
      where: { userId: user.id, refId: project.id, reason: 'refund' },
    });
    expect(updatedProject.status).toBe(ProjectStatus.FAILED);
    expect(updatedUser.tokenBalance).toBe(110);
    expect(refund?.amount).toBe(10);
  });

  it('fails with a clear error for unknown blocks', async () => {
    const user = await createUser();
    const service = await createService();
    const pipeline = [{ id: 'step_1', blockSlug: 'missing-block' }];
    const project = await createProject({ user, service, pipeline });

    await expect(
      runPipeline({ generationId: project.id, pipelineConfig: pipeline, selectedTier: 'standard' }),
    ).rejects.toThrow('Unknown block: missing-block');
  });
});
