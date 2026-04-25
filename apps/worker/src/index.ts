import './config/env';
import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { processPhotoRestore } from './processors/photo-restore';
import { processPhotoAnimate } from './processors/photo-animate';
import { processTrend } from './processors/trend';

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';

// BullMQ требует maxRetriesPerRequest: null для блокирующих команд.
const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });

const workers = [
  new Worker('photo-restore', processPhotoRestore, { connection }),
  new Worker('photo-animate', processPhotoAnimate, { connection }),
  new Worker('trend', processTrend, { connection }),
];

workers.forEach((w) => {
  w.on('ready', () => console.log(`[worker:${w.name}] ready`));
  w.on('failed', (job, err) => console.error(`[worker:${w.name}] failed`, job?.id, err));
});

console.log('Worker started. Queues: photo-restore, photo-animate, trend');

async function shutdown() {
  console.log('Worker shutting down...');
  await Promise.all(workers.map((w) => w.close()));
  await connection.quit();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
