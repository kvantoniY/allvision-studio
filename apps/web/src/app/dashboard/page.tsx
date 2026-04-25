'use client';

import { Coins } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/hooks/use-auth';

export default function DashboardPage() {
  const { user } = useAuth();
  if (!user) return null;

  return (
    <section className="container py-12 space-y-8">
      <div>
        <h1 className="text-3xl font-semibold">Добро пожаловать, {user.name ?? user.email}</h1>
        <p className="text-muted-foreground mt-1">Ваш личный кабинет Allvision Studio.</p>
      </div>

      <Card className="max-w-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Coins className="h-5 w-5" /> Баланс токенов
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-4xl font-bold">{user.tokenBalance}</div>
          <div className="text-sm text-muted-foreground mt-1">1 токен = 1 ₽</div>
        </CardContent>
      </Card>
    </section>
  );
}
