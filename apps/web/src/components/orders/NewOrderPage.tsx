'use client';

import Link from 'next/link';
import { AlertCircle, ArrowLeft, Clock, Wallet } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { BriefForm } from '@/components/orders/BriefForm';
import { useListOrderTypesQuery } from '@/store/api/orders-api';

export function NewOrderPage({ slug }: { slug: string }) {
  const { data, isLoading } = useListOrderTypesQuery();
  const orderType = data?.items.find((item) => item.slug === slug);

  if (isLoading) {
    return (
      <div className="container max-w-3xl space-y-4 py-10">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (!orderType) {
    return (
      <div className="container py-10">
        <Alert variant="destructive" className="max-w-2xl">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Такой заказ недоступен</AlertTitle>
          <AlertDescription>
            Возможно, формат сняли с продажи. <Link href="/orders" className="underline">Посмотреть другие</Link>.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container max-w-3xl space-y-8 py-8">
      <div className="flex items-start gap-3">
        <Link
          href="/orders"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-slate-700 text-slate-300 transition hover:border-slate-500 hover:text-white"
          aria-label="К списку заказов"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{orderType.title}</h1>
          <p className="mt-2 leading-7 text-slate-400">{orderType.description}</p>
          <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
            <span className="inline-flex items-center gap-1.5 font-semibold text-amber-300">
              <Wallet className="h-4 w-4" />
              {orderType.priceFromCoins === orderType.priceToCoins
                ? `${orderType.priceFromCoins} коинов`
                : `${orderType.priceFromCoins}–${orderType.priceToCoins} коинов`}
            </span>
            <span className="inline-flex items-center gap-1.5 text-slate-400">
              <Clock className="h-4 w-4" />
              от {orderType.leadTimeDays} дней
            </span>
          </div>
        </div>
      </div>

      <BriefForm orderType={orderType} />
    </div>
  );
}
