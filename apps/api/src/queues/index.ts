import { Queue, type JobsOptions } from 'bullmq';
import IORedis, { type Redis } from 'ioredis';
import {
  QUEUE_NAMES,
  type GenerationJobData,
  type NsfwCheckJobData,
  type QueueName,
} from '@allvision/shared';

let connectionSingleton: Redis | undefined;
const queues = new Map<QueueName, Queue>();

function getConnection(): Redis {
  if (connectionSingleton) return connectionSingleton;
  const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
  connectionSingleton = new IORedis(url, { maxRetriesPerRequest: null, lazyConnect: false });
  return connectionSingleton;
}

const DEFAULT_JOB_OPTIONS: JobsOptions = {
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 50 },
  attempts: 2,
  backoff: { type: 'exponential', delay: 5000 },
};

export function getQueue(name: QueueName): Queue {
  let q = queues.get(name);
  if (q) return q;
  q = new Queue(name, {
    connection: getConnection(),
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
  });
  queues.set(name, q);
  return q;
}

export async function addGenerationJob(data: GenerationJobData, opts?: JobsOptions) {
  return getQueue(QUEUE_NAMES.GENERATION).add(QUEUE_NAMES.GENERATION, data, opts);
}

export async function addNsfwCheckJob(data: NsfwCheckJobData, opts?: JobsOptions) {
  return getQueue(QUEUE_NAMES.NSFW_CHECK).add(QUEUE_NAMES.NSFW_CHECK, data, opts);
}

export async function closeQueues() {
  await Promise.all(Array.from(queues.values()).map((q) => q.close()));
  queues.clear();
  if (connectionSingleton) {
    await connectionSingleton.quit().catch(() => connectionSingleton?.disconnect());
    connectionSingleton = undefined;
  }
}

export { QUEUE_NAMES } from '@allvision/shared';
