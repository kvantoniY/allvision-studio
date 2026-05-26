export type ApiErrorDetails = {
  code?: string;
  message?: string;
  retryAfterSeconds?: number;
  retryAt?: string;
  limit?: number;
  used?: number;
  remaining?: number;
  windowSeconds?: number;
};

type ApiErrorLike = {
  status?: number | string;
  data?: {
    error?: ApiErrorDetails;
  };
  error?: string;
};

export function apiErrorDetails(error: unknown): ApiErrorDetails | undefined {
  return (error as ApiErrorLike | undefined)?.data?.error;
}

export function apiErrorMessage(error: unknown, fallback = 'Операция не выполнена') {
  if (!error) return undefined;
  const typed = error as ApiErrorLike | undefined;
  return typed?.data?.error?.message ?? (typed?.error ? 'Не удалось подключиться к серверу.' : fallback);
}

export function retryTargetMs(details: ApiErrorDetails | undefined) {
  if (!details || details.code !== 'RATE_LIMITED') return null;

  if (details.retryAt) {
    const time = Date.parse(details.retryAt);
    if (Number.isFinite(time)) return time;
  }

  if (typeof details.retryAfterSeconds === 'number' && details.retryAfterSeconds > 0) {
    return Date.now() + details.retryAfterSeconds * 1000;
  }

  return null;
}

export function formatRetryDuration(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.ceil(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  if (hours > 0) return `${hours} ч ${minutes} мин`;
  if (minutes > 0) return `${minutes} мин ${seconds} сек`;
  return `${seconds} сек`;
}
