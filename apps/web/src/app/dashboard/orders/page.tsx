'use client';

import { useState } from 'react';
import { FileText } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { OrderCard } from '@/components/dashboard/OrderCard';
import type { Order, OrderStatus } from '@allvision/shared';

const ACTIVE: OrderStatus[] = ['NEW', 'NEGOTIATING', 'PRICE_SET', 'PAID', 'IN_PROGRESS', 'REVIEW'];

type Tab = 'all' | 'active' | 'completed' | 'cancelled';

export default function OrdersPage() {
  const [tab, setTab] = useState<Tab>('all');
  // Этап 1.4 — пусто. Загрузка появится на 1.7.
  const orders: Order[] = [];

  const visible = orders.filter((o) => {
    if (tab === 'all') return true;
    if (tab === 'active') return ACTIVE.includes(o.status);
    if (tab === 'completed') return o.status === 'COMPLETED';
    if (tab === 'cancelled') return o.status === 'CANCELLED';
    return true;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Мои заказы</h1>
        <p className="mt-1 text-sm text-slate-400">
          Ручные услуги: мультфильмы, реалистичные видео и видео-сказки.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList>
          <TabsTrigger value="all">Все</TabsTrigger>
          <TabsTrigger value="active">Активные</TabsTrigger>
          <TabsTrigger value="completed">Завершённые</TabsTrigger>
          <TabsTrigger value="cancelled">Отменённые</TabsTrigger>
        </TabsList>
      </Tabs>

      {visible.length === 0 ? (
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="p-6">
            <EmptyState
              size="lg"
              icon={<FileText className="h-full w-full" />}
              title="Заказов пока нет"
              description="Закажите персональный мультфильм или реалистичное видео — наша команда воплотит вашу идею"
              actions={[
                { label: 'Заказать мультфильм', href: '/services/cartoon-custom' },
                { label: 'Заказать видео', href: '/services/realistic-custom', variant: 'outline' },
              ]}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {visible.map((o) => (
            <OrderCard key={o.id} order={o} />
          ))}
        </div>
      )}
    </div>
  );
}
