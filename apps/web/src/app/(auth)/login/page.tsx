import Link from 'next/link';
import { Suspense } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LoginForm } from '@/components/auth/LoginForm';

export default function LoginPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Вход</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Suspense>
          <LoginForm />
        </Suspense>
        <div className="text-sm text-muted-foreground flex justify-between">
          <Link href="/forgot-password" className="hover:underline">Забыли пароль?</Link>
          <Link href="/register" className="hover:underline">Регистрация</Link>
        </div>
      </CardContent>
    </Card>
  );
}
