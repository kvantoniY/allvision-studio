function line(level: string, message: string, extra?: unknown) {
  const time = new Date().toLocaleTimeString('ru-RU', { hour12: false });
  const text = `${time} WORKER ${level} ${message}`;
  if (level === 'ERROR') {
    console.error(text, extra ?? '');
    return;
  }
  if (level === 'WARN') {
    console.warn(text, extra ?? '');
    return;
  }
  console.log(text, extra ?? '');
}

export const logger = {
  info: (message: string, extra?: unknown) => line('INFO', message, extra),
  warn: (message: string, extra?: unknown) => line('WARN', message, extra),
  error: (message: string, extra?: unknown) => line('ERROR', message, extra),
};
