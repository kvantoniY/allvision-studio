'use client';

import { AlertCircle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ServiceCard } from '@/components/public/ServiceCard';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useGetServicesQuery } from '@/store/api/public-api';

const filters = [
  { value: 'all', label: 'Все' },
  { value: 'AUTO', label: 'Автоматические' },
  { value: 'MANUAL', label: 'На заказ' },
  { value: 'kids', label: 'Для детей' },
];

export function ServicesCatalog() {
  const [filter, setFilter] = useState('all');
  const { data, isLoading, isError } = useGetServicesQuery();

  const services = useMemo(() => {
    const all = data?.services ?? [];
    if (filter === 'all') return all;
    if (filter === 'kids') return all.filter((service) => service.category === 'FAIRY_TALE' || service.slug === 'cartoon-custom');
    return all.filter((service) => service.processingType === filter);
  }, [data?.services, filter]);

  return (
    <section className="container py-14 md:py-20">
      <div className="max-w-3xl">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-indigo-500">Каталог</p>
        <h1 className="mt-3 text-4xl font-black leading-none tracking-tight md:text-6xl">Все услуги Allvision Studio</h1>
        <p className="mt-5 text-lg leading-8 text-muted-foreground">
          Выберите быстрый AI-формат или ручной заказ под конкретную идею. На карточках сразу видно, сколько стоит запуск и как устроена обработка.
        </p>
      </div>

      <Tabs value={filter} onValueChange={setFilter} className="mt-8">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-2 bg-transparent p-0">
          {filters.map((item) => (
            <TabsTrigger key={item.value} value={item.value} className="rounded-md border border-slate-800 bg-slate-900 px-4 py-2 transition hover:bg-slate-800 data-[state=active]:border-indigo-500 data-[state=active]:bg-slate-800">
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {isError && (
        <div className="mt-8 flex max-w-2xl items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          <AlertCircle className="h-5 w-5" />
          Не удалось загрузить услуги. Проверьте API и seed.
        </div>
      )}

      <div className="mt-8 grid auto-rows-fr gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading
          ? Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-[520px] rounded-lg" />)
          : services.map((service) => <ServiceCard key={service.id} service={service} detailed />)}
      </div>
    </section>
  );
}
