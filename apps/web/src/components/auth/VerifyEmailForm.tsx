'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useConfirmEmailVerificationMutation } from '@/store/api/auth-api';

export function VerifyEmailForm() {
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const [confirmEmail, state] = useConfirmEmailVerificationMutation();
  const startedRef = useRef(false);

  useEffect(() => {
    if (!token || startedRef.current) return;
    startedRef.current = true;
    void confirmEmail(token);
  }, [confirmEmail, token]);

  if (!token) {
    return (
      <Alert variant="destructive">
        <AlertDescription>В ссылке нет токена подтверждения. Запросите новое письмо в профиле.</AlertDescription>
      </Alert>
    );
  }

  if (state.isLoading || state.isUninitialized) {
    return (
      <Alert>
        <AlertDescription>Подтверждаем email...</AlertDescription>
      </Alert>
    );
  }

  if (state.isError) {
    const message = (state.error as { data?: { error?: { message?: string } } })?.data?.error?.message
      ?? 'Ссылка недействительна или истекла.';
    return (
      <div className="space-y-4">
        <Alert variant="destructive">
          <AlertDescription>{message}</AlertDescription>
        </Alert>
        <Button asChild variant="outline" className="w-full">
          <Link href="/profile">Открыть профиль</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Alert>
        <AlertDescription>Email подтверждён. Теперь можно восстановить пароль через почту.</AlertDescription>
      </Alert>
      <Button asChild className="w-full">
        <Link href="/profile">Перейти в профиль</Link>
      </Button>
    </div>
  );
}
