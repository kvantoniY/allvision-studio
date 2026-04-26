import './config/env';
import { Worker, type Processor } from 'bullmq';
import IORedis from 'ioredis';
import { QUEUE_NAMES, type QueueName } from '@allvision/shared';
import { processPhotoRestore } from './processors/photo-restore';
import { processPhotoAnimate } from './processors/photo-animate';
import { processTrend } from './processors/trend';
import { processFairyTaleScript } from './processors/fairy-tale-script';

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
const CONCURRENCY = 2;

// BullMQ требует maxRetriesPerRequest: null для блокирующих команд.
const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null, lazyConnect: false });

const time = () => new Date().toLocaleTimeString('ru-RU', { hour12: false });
const log = (msg: string) => console.log(`\x1b[2m${time()}\x1b[0m \x1b[35mWORKER\x1b[0m ${msg}`);
const err = (msg: string) => console.error(`\x1b[2m${time()}\x1b[0m \x1b[31mWORKER\x1b[0m ${msg}`);

const queues: Array<[QueueName, Processor]> = [
  [QUEUE_NAMES.PHOTO_RESTORE, processPhotoRestore as Processor],
  [QUEUE_NAMES.PHOTO_ANIMATE, processPhotoAnimate as Processor],
  [QUEUE_NAMES.TREND, processTrend as Processor],
  [QUEUE_NAMES.FAIRY_TALE_SCRIPT, processFairyTaleScript as Processor],
];

const workers = queues.map(
  ([name, processor]) => new Worker(name, processor, { connection, concurrency: CONCURRENCY }),
);

let readyCount = 0;
workers.forEach((w) => {
  w.on('ready', () => {
    readyCount += 1;
    log(`\x1b[32m✓\x1b[0m Worker ready: ${w.name} (concurrency: ${CONCURRENCY})`);
    if (readyCount === workers.length) {
      log(`\x1b[32m✓\x1b[0m Все воркеры запущены: ${queues.map(([n]) => n).join(', ')}`);
    }
  });
  w.on('active', (job) => log(`[${w.name}] job started: ${job.id}`));
  w.on('completed', (job, _res, prev) =>
    log(`[${w.name}] job completed: ${job.id} (was ${prev})`),
  );
  w.on('failed', (job, e) => err(`[${w.name}] job ${job?.id} failed: ${e.message}`));
  w.on('error', (e) => err(`[${w.name}] ${e.message}`));
});

connection.on('error', (e) => err(`Redis: ${e.message}`));

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  log(`Получен ${signal}, останавливаю...`);
  const timer = setTimeout(() => {
    err('Принудительное завершение по таймауту');
    process.exit(1);
  }, 5000);
  timer.unref();
  try {
    await Promise.all(workers.map((w) => w.close()));
    await connection.quit();
    log('Worker остановлен');
    process.exit(0);
  } catch (e) {
    err(`Ошибка при остановке: ${(e as Error).message}`);
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
