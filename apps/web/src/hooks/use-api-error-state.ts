'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiErrorDetails, apiErrorMessage, formatRetryDuration, retryTargetMs } from '@/lib/api-error';

export function useApiErrorState(error: unknown, fallback?: string) {
  const details = useMemo(() => apiErrorDetails(error), [error]);
  const message = useMemo(() => apiErrorMessage(error, fallback), [error, fallback]);
  const [targetMs, setTargetMs] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setTargetMs(retryTargetMs(details));
    setNow(Date.now());
  }, [details]);

  useEffect(() => {
    if (!targetMs || targetMs <= Date.now()) return;
    const tick = () => setNow(Date.now());
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [targetMs]);

  const secondsLeft = targetMs ? Math.max(0, Math.ceil((targetMs - now) / 1000)) : 0;
  const isRateLimited = details?.code === 'RATE_LIMITED';

  return {
    details,
    message,
    isRateLimited,
    locked: isRateLimited && secondsLeft > 0,
    secondsLeft,
    retryText: secondsLeft > 0 ? formatRetryDuration(secondsLeft) : undefined,
    windowText: details?.windowSeconds ? formatRetryDuration(details.windowSeconds) : undefined,
  };
}
