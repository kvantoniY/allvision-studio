'use client';

import { AlertCircle } from 'lucide-react';
import { ServiceCard } from '@/components/public/ServiceCard';
import { Skeleton } from '@/components/ui/skeleton';
import { useGetServicesQuery } from '@/store/api/public-api';
import { Reveal } from './Reveal';

export function ServicesGrid() {
  const { data, isLoading, isError } = useGetServicesQuery();

  return (
    <section id="services" className="container py-20">
      <Reveal className="mx-auto max-w-3xl text-center">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-indigo-500">Услуги</p>
        <h2 className="mt-3 text-3xl font-bold md:text-5xl">Выберите, что хотите создать</h2>
        <p className="mt-4 text-lg leading-8 text-muted-foreground">
          Быстрые AI-обработки, трендовые ролики и персональные видео на заказ собраны в одном каталоге.
        </p>
      </Reveal>

      {isError && (
        <div className="mx-auto mt-10 flex max-w-2xl items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          <AlertCircle className="h-5 w-5" />
          Не удалось загрузить услуги. Проверьте, что API запущен и seed выполнен.
        </div>
      )}

      <div className="mt-10 grid auto-rows-fr gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading
          ? Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-[440px] rounded-lg" />)
          : data?.services.map((service, index) => (
              <Reveal key={service.id} delay={index * 0.04} className="h-full">
                <ServiceCard service={service} />
              </Reveal>
            ))}
      </div>
    </section>
  );
}
