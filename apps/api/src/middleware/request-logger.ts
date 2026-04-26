import type { NextFunction, Request, Response } from 'express';
import { logger } from '../utils/logger';

const colors = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

function statusColor(status: number): string {
  if (status >= 500) return colors.red;
  if (status >= 400) return colors.yellow;
  if (status >= 300) return colors.cyan;
  return colors.green;
}

// Шумные пути, которые не пишем в лог при успешном статусе.
const SILENT_PATHS = new Set(['/api/health']);

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    if (SILENT_PATHS.has(req.originalUrl) && res.statusCode < 400) return;
    const status = `${statusColor(res.statusCode)}${res.statusCode}${colors.reset}`;
    const duration = `${colors.dim}${ms.toFixed(0)}ms${colors.reset}`;
    const msg = `${req.method.padEnd(4)} ${req.originalUrl} ${status} ${duration}`;
    if (res.statusCode >= 500) logger.error(msg);
    else logger.info(msg);
  });
  next();
}
