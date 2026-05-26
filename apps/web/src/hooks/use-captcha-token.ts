'use client';

import { useCallback, useState } from 'react';
import { captchaEnabled } from '@/lib/captcha';

export function useCaptchaToken() {
  const [token, setToken] = useState('');
  const [resetKey, setResetKey] = useState(0);
  const enabled = captchaEnabled();

  const reset = useCallback(() => {
    setToken('');
    setResetKey((value) => value + 1);
  }, []);

  return {
    enabled,
    token,
    setToken,
    reset,
    resetKey,
    solved: !enabled || Boolean(token),
  };
}
