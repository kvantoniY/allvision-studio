import Link from 'next/link';
import { Suspense } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoginForm } from '@/components/auth/LoginForm';

export default function LoginPage() {
  return (
    <Card className="border-border shadow-sm">
      <CardHeader>
        <CardTitle className="text-2xl">С возвращением</CardTitle>
        <CardDescription>Войдите в кабинет родителя Allvision Academy.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Suspense>
          <LoginForm />
        </Suspense>
        <div className="flex justify-between text-sm text-muted-foreground">
          <Link href="/forgot-password" className="hover:text-primary hover:underline">Забыли пароль?</Link>
          <Link href="/register" className="hover:text-primary hover:underline">Регистрация</Link>
        </div>
      </CardContent>
    </Card>
  );
}
