import './config/env';
import { Worker, type Processor } from 'bullmq';
import IORedis from 'ioredis';
import { QUEUE_NAMES, type QueueName } from '@allvision/shared';
import { processPhotoRestore } from './processors/photo-restore';
import { processPhotoAnimate } from './processors/photo-animate';
import { processTrend } from './processors/trend';
import { processFairyTaleScript } from './processors/fairy-tale-script';
import { processCharacterNsfw } from './processors/character-nsfw';
import { processEpisode } from './processors/episode';
import { processServicePipeline } from './processors/service-pipeline';
import { initialiseWorkerProviders } from './providers';
import { startGenerationRetentionCleanup } from './services/generation-retention';
import { startGenerationTimeoutWatchdog } from './services/generation-timeout';

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
const CONCURRENCY = 2;
const CHARACTER_NSFW_CONCURRENCY = 4;
const EPISODE_CONCURRENCY = 1;
export const SERVICE_PIPELINE_CONCURRENCY = 1;
// Склейка упирается в CPU, а не в чужой API: две параллельные — предел для нашей ВМ.
export const VIDEO_RENDER_CONCURRENCY = 2;

// BullMQ requires maxRetriesPerRequest: null for blocking commands.
let connection: IORedis | undefined;

const time = () => new Date().toLocaleTimeString('ru-RU', { hour12: false });
const log = (msg: string) => console.log(`\x1b[2m${time()}\x1b[0m \x1b[35mWORKER\x1b[0m ${msg}`);
const err = (msg: string) => console.error(`\x1b[2m${time()}\x1b[0m \x1b[31mWORKER\x1b[0m ${msg}`);

const queues: Array<[QueueName, Processor]> = [
  [QUEUE_NAMES.PHOTO_RESTORE, processPhotoRestore as Processor],
  [QUEUE_NAMES.PHOTO_ANIMATE, processPhotoAnimate as Processor],
  [QUEUE_NAMES.TREND, processTrend as Processor],
  [QUEUE_NAMES.FAIRY_TALE_SCRIPT, processFairyTaleScript as Processor],
  [QUEUE_NAMES.CHARACTER_NSFW, processCharacterNsfw as Processor],
  [QUEUE_NAMES.EPISODE, processEpisode as Processor],
  [QUEUE_NAMES.SERVICE_PIPELINE, processServicePipeline as Processor],
  // Экспорт из редактора — тот же исполнитель, но своя очередь и свой параллелизм.
  [QUEUE_NAMES.VIDEO_RENDER, processServicePipeline as Processor],
];

export function queueConcurrencyFor(name: QueueName) {
  if (name === QUEUE_NAMES.CHARACTER_NSFW) return CHARACTER_NSFW_CONCURRENCY;
  if (name === QUEUE_NAMES.EPISODE) return EPISODE_CONCURRENCY;
  if (name === QUEUE_NAMES.SERVICE_PIPELINE) return SERVICE_PIPELINE_CONCURRENCY;
  if (name === QUEUE_NAMES.VIDEO_RENDER) return VIDEO_RENDER_CONCURRENCY;
  return CONCURRENCY;
}

let workers: Worker[] = [];
let stopRetentionCleanup: (() => void) | undefined;
let stopGenerationTimeoutWatchdog: (() => void) | undefined;

let readyCount = 0;
export async function start() {
  await initialiseWorkerProviders();
  stopRetentionCleanup = startGenerationRetentionCleanup();
  stopGenerationTimeoutWatchdog = startGenerationTimeoutWatchdog();
  connection = new IORedis(redisUrl, { maxRetriesPerRequest: null, lazyConnect: false });
  workers = queues.map(([name, processor]) => {
    const concurrency = queueConcurrencyFor(name);
    return new Worker(name, processor, { connection: connection!, concurrency });
  });

  workers.forEach((w) => {
    w.on('ready', () => {
      readyCount += 1;
      log(`Worker ready: ${w.name} (concurrency: ${queueConcurrencyFor(w.name as QueueName)})`);
      if (readyCount === workers.length) {
        log(`All workers started: ${queues.map(([n]) => n).join(', ')}`);
      }
    });
    w.on('active', (job) => log(`[${w.name}] job started: ${job.id}`));
    w.on('completed', (job, _res, prev) =>
      log(`[${w.name}] job completed: ${job.id} (was ${prev})`),
    );
    w.on('failed', (job, e) => err(`[${w.name}] job ${job?.id} failed: ${e.message}`));
    w.on('error', (e) => err(`[${w.name}] ${e.message}`));
  });
}

if (require.main === module) {
  start().catch((e) => {
    err(`startup failed: ${(e as Error).message}`);
    process.exit(1);
  });
}

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  log(`Received ${signal}, shutting down...`);
  const timer = setTimeout(() => {
    err('Forced shutdown by timeout');
    process.exit(1);
  }, 5000);
  timer.unref();
  try {
    stopRetentionCleanup?.();
    stopGenerationTimeoutWatchdog?.();
    await Promise.all(workers.map((w) => w.close()));
    await connection?.quit();
    log('Worker stopped');
    process.exit(0);
  } catch (e) {
    err(`Shutdown error: ${(e as Error).message}`);
    process.exit(1);
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGHUP', () => shutdown('SIGHUP'));
process.on('uncaughtException', (e) => {
  err(`uncaughtException: ${e.message}`);
  shutdown('uncaughtException');
});
