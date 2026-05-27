import { logger } from '../utils/logger';
import { pollPendingPaymentsOnce } from './payment-service';

let timer: NodeJS.Timeout | undefined;
let firstRunTimer: NodeJS.Timeout | undefined;
let running = false;

function positiveIntEnv(name: string, fallback: number) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function isEnabled() {
  const explicit = process.env.PAYMENT_PENDING_POLL_ENABLED?.trim().toLowerCase();
  if (explicit && ['0', 'false', 'no', 'off'].includes(explicit)) return false;
  return (process.env.PAYMENT_PROVIDER ?? 'mock') === 'robokassa';
}

export function stopPendingPaymentPoller() {
  if (firstRunTimer) {
    clearTimeout(firstRunTimer);
    firstRunTimer = undefined;
  }
  if (!timer) return;
  clearInterval(timer);
  timer = undefined;
}

export function startPendingPaymentPoller() {
  if (timer || !isEnabled()) return;

  const intervalMs = positiveIntEnv('PAYMENT_PENDING_POLL_INTERVAL_MS', 10000);

  const run = async () => {
    if (running) return;
    running = true;
    try {
      const result = await pollPendingPaymentsOnce();
      if (result.checked > 0 || result.revived > 0 || result.expired > 0) {
        logger.info(`[payments] pending poll checked=${result.checked} revived=${result.revived} expired=${result.expired}`);
      }
    } catch (error) {
      logger.warn(`[payments] pending poll failed: ${(error as Error).message}`);
    } finally {
      running = false;
    }
  };

  firstRunTimer = setTimeout(run, 2000);
  firstRunTimer.unref();
  timer = setInterval(run, intervalMs);
  timer.unref();
  logger.info(`[payments] pending poller enabled intervalMs=${intervalMs}`);
}
