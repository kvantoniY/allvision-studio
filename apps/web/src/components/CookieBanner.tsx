'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

const STORAGE_KEY = 'allvision_cookie_consent';

type CookiePreferences = {
  necessary: true;
  analytics: boolean;
  marketing: boolean;
};

export function CookieBanner() {
  const [visible, setVisible] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [preferences, setPreferences] = useState<CookiePreferences>({
    necessary: true,
    analytics: false,
    marketing: false,
  });

  useEffect(() => {
    setVisible(!localStorage.getItem(STORAGE_KEY));
  }, []);

  const save = (value: CookiePreferences) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...value, acceptedAt: new Date().toISOString() }));
    setVisible(false);
    setSettingsOpen(false);
  };

  if (!visible) return null;

  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-50 border-t bg-background/95 p-4 shadow-2xl backdrop-blur dark:border-slate-800">
        <div className="container flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            Мы используем cookies для работы сайта и улучшения сервиса. Продолжая, вы соглашаетесь с{' '}
            <Link href="/privacy" className="text-foreground underline underline-offset-4">
              Политикой конфиденциальности
            </Link>
            .
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => save({ necessary: true, analytics: false, marketing: false })}>
              Только необходимые
            </Button>
            <Button variant="secondary" onClick={() => setSettingsOpen(true)}>
              Настроить
            </Button>
            <Button className="bg-amber-500 text-slate-950 hover:bg-amber-400" onClick={() => save({ necessary: true, analytics: true, marketing: true })}>
              Принять все
            </Button>
          </div>
        </div>
      </div>

      {settingsOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
          <div className="w-full max-w-lg rounded-lg border bg-background shadow-2xl dark:border-slate-800">
            <div className="flex items-center justify-between border-b p-5 dark:border-slate-800">
              <div>
                <h2 className="text-xl font-semibold">Настройки cookies</h2>
                <p className="mt-1 text-sm text-muted-foreground">Выберите, какие категории можно использовать.</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setSettingsOpen(false)} aria-label="Закрыть">
                <X className="h-5 w-5" />
              </Button>
            </div>
            <div className="space-y-4 p-5">
              <label className="flex items-start gap-3 rounded-md border p-4 dark:border-slate-800">
                <input type="checkbox" checked disabled className="mt-1" />
                <span>
                  <span className="block font-medium">Необходимые</span>
                  <span className="text-sm text-muted-foreground">Нужны для входа, безопасности и базовой работы сайта. Всегда включены.</span>
                </span>
              </label>
              <label className="flex items-start gap-3 rounded-md border p-4 dark:border-slate-800">
                <input
                  type="checkbox"
                  checked={preferences.analytics}
                  onChange={(e) => setPreferences((current) => ({ ...current, analytics: e.target.checked }))}
                  className="mt-1"
                />
                <span>
                  <span className="block font-medium">Аналитика</span>
                  <span className="text-sm text-muted-foreground">Помогает понимать, какие страницы и услуги стоит улучшать.</span>
                </span>
              </label>
              <label className="flex items-start gap-3 rounded-md border p-4 dark:border-slate-800">
                <input
                  type="checkbox"
                  checked={preferences.marketing}
                  onChange={(e) => setPreferences((current) => ({ ...current, marketing: e.target.checked }))}
                  className="mt-1"
                />
                <span>
                  <span className="block font-medium">Маркетинг</span>
                  <span className="text-sm text-muted-foreground">Нужен для будущих рекламных кампаний и персональных предложений.</span>
                </span>
              </label>
            </div>
            <div className="flex justify-end gap-2 border-t p-5 dark:border-slate-800">
              <Button variant="outline" onClick={() => setSettingsOpen(false)}>
                Отмена
              </Button>
              <Button className="bg-amber-500 text-slate-950 hover:bg-amber-400" onClick={() => save(preferences)}>
                Сохранить
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
