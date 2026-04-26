import { QUEUE_NAMES } from '@allvision/shared';
import { getQueue, addProjectJob, closeQueues } from '../queues';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

async function isRedisReachable(): Promise<boolean> {
  const IORedisModule = await import('ioredis');
  const IORedis = IORedisModule.default;
  const client = new IORedis(REDIS_URL, {
    maxRetriesPerRequest: 1,
    lazyConnect: true,
    connectTimeout: 1500,
  });
  try {
    await client.connect();
    await client.ping();
    return true;
  } catch {
    return false;
  } finally {
    client.disconnect();
  }
}

describe('BullMQ queues', () => {
  let redisAvailable = false;

  beforeAll(async () => {
    redisAvailable = await isRedisReachable();
  });

  afterAll(async () => {
    if (redisAvailable) await closeQueues();
  });

  it('creates queue singletons', () => {
    if (!redisAvailable) {
      console.warn('[queue.test] Redis недоступен — пропускаю интеграционные шаги');
      return;
    }
    const a = getQueue(QUEUE_NAMES.PHOTO_RESTORE);
    const b = getQueue(QUEUE_NAMES.PHOTO_RESTORE);
    expect(a).toBe(b);
    expect(a.name).toBe('photo-restore');
  });

  it('addProjectJob enqueues a job', async () => {
    if (!redisAvailable) return;
    const queue = getQueue(QUEUE_NAMES.PHOTO_RESTORE);
    await queue.drain();
    const job = await addProjectJob(QUEUE_NAMES.PHOTO_RESTORE, {
      projectId: 'test_project',
      userId: 'test_user',
      serviceId: 'svc',
      inputImages: [],
      aiConfig: {},
    });
    expect(job.id).toBeDefined();
    const counts = await queue.getJobCounts('waiting', 'delayed');
    expect((counts.waiting ?? 0) + (counts.delayed ?? 0)).toBeGreaterThan(0);
    await queue.drain();
  });
});
