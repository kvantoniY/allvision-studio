import { createLogger, format, transports } from 'winston';

const colors = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

const levelColor: Record<string, string> = {
  error: colors.red,
  warn: colors.yellow,
  info: colors.cyan,
  debug: colors.gray,
};

export const logger = createLogger({
  level: process.env.LOG_LEVEL ?? 'info',
  format: format.combine(
    format.errors({ stack: true }),
    format.printf(({ level, message, stack }) => {
      const time = new Date().toLocaleTimeString('ru-RU', { hour12: false });
      const color = levelColor[level] ?? colors.reset;
      const lvl = `${color}${level.toUpperCase().padEnd(5)}${colors.reset}`;
      const line = `${colors.dim}${time}${colors.reset} ${lvl} ${message}`;
      return stack ? `${line}\n${colors.gray}${stack}${colors.reset}` : line;
    }),
  ),
  transports: [new transports.Console()],
});
