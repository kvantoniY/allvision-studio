'use client';

import Link from 'next/link';
import { ArrowRight, FileText, Sparkles } from 'lucide-react';
import { CUSTOM_ORDER_STATUS_HINTS, CUSTOM_ORDER_STATUS_LABELS, type CustomOrderStatus } from '@allvision/shared';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useListMyOrdersQuery, useListOrderTypesQuery } from '@/store/api/orders-api';
import { cn } from '@/lib/utils';

export const ORDER_STATUS_COLOR: Record<CustomOrderStatus, string> = {
  NEW: 'border-sky-400/40 bg-sky-500/15 text-sky-200',
  QUOTED: 'border-amber-400/40 bg-amber-500/15 text-amber-200',
  PAID: 'border-violet-400/40 bg-violet-500/15 text-violet-200',
  IN_PROGRESS: 'border-blue-400/40 bg-blue-500/15 text-blue-200',
  DELIVERED: 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200',
  CANCELLED: 'border-slate-500/40 bg-slate-600/20 text-slate-300',
};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

export function OrdersList() {
  const { data, isLoading } = useListMyOrdersQuery();
  const { data: typesData } = useListOrderTypesQuery();

  const orders = data?.items ?? [];
  const types = typesData?.items ?? [];

  return (
    <div className="container space-y-10 py-10">
      <header className="max-w-2xl">
        <h1 className="text-3xl font-black tracking-tight sm:text-4xl">Заказы</h1>
        <p className="mt-3 leading-7 text-slate-400">
          Поздравления, которые мы делаем под вас: вы оставляете бриф, мы уточняем детали,
          называем цену и берём в работу.
        </p>
      </header>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, index) => (
            <Skeleton key={index} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : orders.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-100">Мои заявки</h2>
          {orders.map((order) => (
            <Link
              key={order.id}
              href={`/orders/${order.id}`}
              className="flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4 transition hover:border-slate-700"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-slate-700 bg-slate-950 text-amber-300">
                <FileText className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="truncate font-semibold text-slate-100">{order.typeTitle}</h3>
                  <Badge className={cn('rounded-md', ORDER_STATUS_COLOR[order.status])}>
                    {CUSTOM_ORDER_STATUS_LABELS[order.status]}
                  </Badge>
                </div>
                <p className="mt-1 text-sm leading-6 text-slate-400">{CUSTOM_ORDER_STATUS_HINTS[order.status]}</p>
                <p className="mt-1 text-xs text-slate-600">
                  Заявка от {formatDate(order.createdAt)}
                  {order.quotedPriceCoins ? ` · ${order.quotedPriceCoins} токенов` : ''}
                </p>
              </div>
              <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-slate-500" />
            </Link>
          ))}
        </section>
      ) : null}

      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-amber-400" />
          <h2 className="text-lg font-semibold text-slate-100">
            {orders.length > 0 ? 'Заказать ещё' : 'Что можно заказать'}
          </h2>
        </div>
        {types.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-800 bg-slate-900/50 p-8 text-sm text-slate-400">
            Заказные форматы сейчас настраиваются. Загляните чуть позже.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {types.map((type) => (
              <Link
                key={type.id}
                href={`/orders/new/${type.slug}`}
                className="group flex h-full flex-col rounded-xl border border-slate-800 bg-slate-900/60 p-5 transition hover:border-amber-400/60"
              >
                <h3 className="font-semibold text-slate-100">{type.title}</h3>
                <p className="mt-2 flex-1 text-sm leading-6 text-slate-400">{type.shortDesc}</p>
                <div className="mt-4 flex items-center justify-between text-sm">
                  <span className="font-semibold text-amber-300">
                    {type.priceFromCoins === type.priceToCoins
                      ? `${type.priceFromCoins} токенов`
                      : `${type.priceFromCoins}–${type.priceToCoins} токенов`}
                  </span>
                  <span className="text-xs text-slate-500">от {type.leadTimeDays} дн.</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
