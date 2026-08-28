import { prisma } from '@allvision/database';
import { reapStalledGenerations } from '../services/stalled-generation-reaper';
import * as queuesModule from '../queues';

/**
 * Сборщик брошенных генераций трогает деньги, поэтому проверяем обе стороны: закрывает ли он
 * действительно потерянное и НЕ трогает ли то, что ещё считается.
 */

const RUN_ID = Date.now();
const EMAIL = `reaper-${RUN_ID}@example.ru`;
let userId: string;

/** Очередь подменяем: важно не то, как BullMQ хранит задачи, а какие проекты она называет живыми. */
function mockQueueWithJobs(projectIds: string[]) {
  jest.spyOn(queuesModule, 'getQueue').mockReturnValue({
    getJobs: async () => projectIds.map((projectId) => ({ data: { projectId } })),
  } as never);
}

async function createStuckProject(overrides: { createdAt: Date; tokensCost?: number; mode?: string }) {
  return prisma.project.create({
    data: {
      userId,
      mode: overrides.mode ?? 'free-chat',
      title: 'Зависшая генерация',
      status: 'PROCESSING',
      progress: 15,
      inputImages: [],
      tokensCost: overrides.tokensCost ?? 12,
      stepProgress: [] as never,
      createdAt: overrides.createdAt,
    },
    select: { id: true },
  });
}

beforeAll(async () => {
  const user = await prisma.user.create({
    data: { email: EMAIL, passwordHash: 'hash', tokenBalance: 100 },
  });
  userId = user.id;
});

afterEach(() => {
  jest.restoreAllMocks();
});

afterAll(async () => {
  await prisma.tokenTransaction.deleteMany({ where: { userId } });
  await prisma.project.deleteMany({ where: { userId } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.$disconnect();
});

describe('сборщик брошенных генераций', () => {
  it('закрывает проект без задачи в очереди и возвращает коины', async () => {
    mockQueueWithJobs([]);
    const stuck = await createStuckProject({ createdAt: new Date(Date.now() - 60 * 60 * 1000), tokensCost: 12 });
    const before = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

    const result = await reapStalledGenerations(30 * 60 * 1000);
    expect(result.reaped).toBeGreaterThanOrEqual(1);

    const project = await prisma.project.findUniqueOrThrow({ where: { id: stuck.id } });
    expect(project.status).toBe('FAILED');
    expect(project.errorCode).toBe('GENERATION_ABANDONED');

    const after = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(after.tokenBalance).toBe(before.tokenBalance + 12);
    const refund = await prisma.tokenTransaction.findFirst({ where: { refId: stuck.id, reason: 'refund' } });
    expect(refund?.amount).toBe(12);
  });

  it('не трогает проект, у которого задача ещё в очереди', async () => {
    const running = await createStuckProject({ createdAt: new Date(Date.now() - 60 * 60 * 1000) });
    mockQueueWithJobs([running.id]);

    await reapStalledGenerations(30 * 60 * 1000);

    // Долгая генерация — это норма: Kling на пятнадцати секундах считает минуты.
    const project = await prisma.project.findUniqueOrThrow({ where: { id: running.id } });
    expect(project.status).toBe('PROCESSING');
  });

  it('не трогает свежую генерацию, даже если задачи в очереди не видно', async () => {
    mockQueueWithJobs([]);
    const fresh = await createStuckProject({ createdAt: new Date() });

    await reapStalledGenerations(30 * 60 * 1000);

    const project = await prisma.project.findUniqueOrThrow({ where: { id: fresh.id } });
    expect(project.status).toBe('PROCESSING');
  });

  it('молчит, когда очередь недоступна, и ничего не закрывает', async () => {
    const stuck = await createStuckProject({ createdAt: new Date(Date.now() - 60 * 60 * 1000) });
    jest.spyOn(queuesModule, 'getQueue').mockImplementation(() => {
      throw new Error('redis down');
    });

    // Ошибочный отказ по недоступному Redis хуже, чем лишние полчаса ожидания.
    await expect(reapStalledGenerations(30 * 60 * 1000)).rejects.toThrow();
    const project = await prisma.project.findUniqueOrThrow({ where: { id: stuck.id } });
    expect(project.status).toBe('PROCESSING');
  });
});
