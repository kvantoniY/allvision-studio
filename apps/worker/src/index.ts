import './config/env';
import { Worker, type Job } from 'bullmq';
import IORedis from 'ioredis';
import { QUEUE_NAMES, type GenerationJobData } from '@allvision/shared';

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
const CONCURRENCY = 1;

const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null, lazyConnect: false });

const time = () => new Date().toLocaleTimeString('ru-RU', { hour12: false });
const log = (msg: string) => console.log(`\x1b[2m${time()}\x1b[0m \x1b[35mWORKER\x1b[0m ${msg}`);
const warn = (msg: string) => console.warn(`\x1b[2m${time()}\x1b[0m \x1b[33mWORKER\x1b[0m ${msg}`);
const err = (msg: string) => console.error(`\x1b[2m${time()}\x1b[0m \x1b[31mWORKER\x1b[0m ${msg}`);

async function processGeneration(_job: Job<GenerationJobData>) {
  warn('Generation processor not implemented yet');
  throw new Error('NOT_IMPLEMENTED_R4');
}

const worker = new Worker<GenerationJobData>(QUEUE_NAMES.GENERATION, processGeneration, {
  connection,
  concurrency: CONCURRENCY,
});

worker.on('ready', () => {
  log(`Worker ready: ${worker.name} (concurrency: ${CONCURRENCY})`);
});
worker.on('active', (job) => log(`[${worker.name}] job started: ${job.id}`));
worker.on('completed', (job, _res, prev) =>
  log(`[${worker.name}] job completed: ${job.id} (was ${prev})`),
);
worker.on('failed', (job, e) => err(`[${worker.name}] job ${job?.id} failed: ${e.message}`));
worker.on('error', (e) => err(`[${worker.name}] ${e.message}`));

connection.on('error', (e) => err(`Redis: ${e.message}`));

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
    await worker.close();
    await connection.quit();
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
