'use client';

import { PricingCards } from '@/components/public/PricingCards';
import { getPackageUsage } from '@/lib/public-content';
import { useGetTokenPackagesQuery } from '@/store/api/public-api';
import { Reveal } from './Reveal';

export function PricingSection() {
  const { data, isLoading } = useGetTokenPackagesQuery();

  return (
    <section className="container py-20">
      <Reveal className="mx-auto max-w-3xl text-center">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-indigo-500">Токены</p>
        <h2 className="mt-3 text-3xl font-bold md:text-5xl">Простая и честная оплата</h2>
        <p className="mt-4 text-lg leading-8 text-muted-foreground">
          Покупайте токены пакетами — 1 токен = 1 ₽. Ручные заказы оцениваются отдельно и согласуются до оплаты.
        </p>
      </Reveal>

      <Reveal className="mt-10">
        <PricingCards packages={data?.packages} isLoading={isLoading} fallbackHref="/pricing" />
      </Reveal>

      <Reveal className="mt-10 overflow-hidden rounded-lg border bg-card dark:border-slate-800">
        <div className="border-b p-5 dark:border-slate-800">
          <h3 className="text-xl font-semibold">Сколько это услуг?</h3>
          <p className="mt-2 text-sm text-muted-foreground">Примерная иллюстрация для автоматических услуг.</p>
        </div>
        <div className="divide-y dark:divide-slate-800">
          {(data?.packages ?? []).map((pkg) => (
            <div key={pkg.id} className="grid gap-2 p-5 sm:grid-cols-[160px_1fr]">
              <div className="font-semibold">{pkg.tokens} токенов</div>
              <div className="text-muted-foreground">{getPackageUsage(pkg.tokens)}</div>
            </div>
          ))}
        </div>
      </Reveal>
    </section>
  );
}
