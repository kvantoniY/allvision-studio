import { Queue, type JobsOptions } from 'bullmq';
import IORedis, { type Redis } from 'ioredis';
import {
  QUEUE_NAMES,
  type CharacterNsfwJobData,
  type EpisodeJobData,
  type FairyTaleJobData,
  type ProjectJobData,
  type QueueName,
  type ServicePipelineJobData,
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

export async function addProjectJob(
  name: typeof QUEUE_NAMES.PHOTO_RESTORE | typeof QUEUE_NAMES.PHOTO_ANIMATE | typeof QUEUE_NAMES.TREND,
  data: ProjectJobData,
  opts?: JobsOptions,
) {
  return getQueue(name).add(name, data, opts);
}

export async function addFairyTaleScriptJob(data: FairyTaleJobData, opts?: JobsOptions) {
  return getQueue(QUEUE_NAMES.FAIRY_TALE_SCRIPT).add(
    QUEUE_NAMES.FAIRY_TALE_SCRIPT,
    data,
    opts,
  );
}

export async function addCharacterJob(data: CharacterNsfwJobData, opts?: JobsOptions) {
  return getQueue(QUEUE_NAMES.CHARACTER_NSFW).add(
    QUEUE_NAMES.CHARACTER_NSFW,
    data,
    opts,
  );
}

export async function addEpisodeJob(data: EpisodeJobData, opts?: JobsOptions) {
  return getQueue(QUEUE_NAMES.EPISODE).add(
    QUEUE_NAMES.EPISODE,
    data,
    opts,
  );
}

export async function addServicePipelineJob(data: ServicePipelineJobData, opts?: JobsOptions) {
  return getQueue(QUEUE_NAMES.SERVICE_PIPELINE).add(
    QUEUE_NAMES.SERVICE_PIPELINE,
    data,
    {
      attempts: 1,
      ...opts,
    },
  );
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
