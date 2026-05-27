'use client';

import { ShieldCheck } from 'lucide-react';
import { SmartCaptcha } from '@yandex/smart-captcha';
import { YANDEX_SMARTCAPTCHA_SITE_KEY, captchaEnabled } from '@/lib/captcha';

type CaptchaFieldProps = {
  token: string;
  onTokenChange: (token: string) => void;
  resetKey?: number;
  className?: string;
};

export function CaptchaField({ token, onTokenChange, resetKey, className }: CaptchaFieldProps) {
  if (!captchaEnabled()) return null;

  return (
    <div className={className}>
      <div className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-400">
        <ShieldCheck className="h-4 w-4 text-emerald-400" />
        Проверка безопасности
      </div>
      <div className="max-w-full overflow-hidden rounded-md border border-slate-800 bg-slate-950 p-1 sm:p-2 [&_iframe]:max-w-full">
        <SmartCaptcha
          key={resetKey}
          sitekey={YANDEX_SMARTCAPTCHA_SITE_KEY}
          language="ru"
          theme="dark"
          onSuccess={onTokenChange}
          onTokenExpired={() => onTokenChange('')}
          onNetworkError={() => onTokenChange('')}
          onJavascriptError={() => onTokenChange('')}
        />
      </div>
      {!token && (
        <p className="mt-2 text-xs text-slate-500">
          Подтвердите, что вы не робот, чтобы отправить форму.
        </p>
      )}
    </div>
  );
}
