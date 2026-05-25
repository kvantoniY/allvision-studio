import './config/env';
import { app } from './app';
import { logger } from './utils/logger';
import { startPendingPaymentPoller, stopPendingPaymentPoller } from './services/payment-poller';

const port = Number(process.env.PORT ?? 4000);

const server = app.listen(port, () => {
  logger.info(`\x1b[32m✓\x1b[0m API готов на http://localhost:${port}`);
  startPendingPaymentPoller();
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    logger.error(`Порт ${port} уже занят. Освободите его и перезапустите.`);
    process.exit(1);
  }
  logger.error(`Не удалось запустить API: ${err.message}`);
  process.exit(1);
});

let shuttingDown = false;
function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  stopPendingPaymentPoller();
  logger.info(`Получен ${signal}, останавливаю API...`);
  const timer = setTimeout(() => {
    logger.warn('Принудительное завершение по таймауту');
    process.exit(1);
  }, 5000);
  timer.unref();
  server.close((err) => {
    if (err) {
      logger.error(`Ошибка при остановке: ${err.message}`);
      process.exit(1);
    }
    logger.info('API остановлен, порт освобождён');
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGHUP', () => shutdown('SIGHUP'));
process.on('uncaughtException', (err) => {
  logger.error(`uncaughtException: ${err.message}`);
  shutdown('uncaughtException');
});
process.on('unhandledRejection', (reason) => {
  logger.error(`unhandledRejection: ${String(reason)}`);
});
