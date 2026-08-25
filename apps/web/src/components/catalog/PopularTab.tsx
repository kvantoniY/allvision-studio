'use client';

import { Flame, Sparkles } from 'lucide-react';
import type { PublicService } from '@allvision/shared';
import { ServiceTile } from './ServiceTile';

type PopularTabProps = {
  /** Услуги вкладки: уже отфильтрованы по выбранному поводу. */
  services: PublicService[];
  onBrowseAll: () => void;
};

/**
 * Кураторская вкладка. Это посадочная страница рекламы, поэтому здесь нет фильтров
 * по категориям — только то, что мы сами вынесли вперёд, крупными карточками.
 * Порядок задаётся в админке через featuredOrder.
 */
export function PopularTab({ services, onBrowseAll }: PopularTabProps) {
  const featured = services
    .filter((service) => service.isFeatured)
    .slice()
    .sort((a, b) => a.featuredOrder - b.featuredOrder || a.sortOrder - b.sortOrder);
  // Если в «Популярном» пусто (например, у выбранного повода нет избранных услуг),
  // показываем остальные услуги этого повода, а не пустой экран.
  const fallback = services.filter((service) => !service.isFeatured);
  const items = featured.length > 0 ? featured : fallback;

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-800 bg-slate-900/50 p-8 text-center">
        <p className="text-sm text-slate-400">Для этого повода пока ничего не отобрано.</p>
        <button
          type="button"
          onClick={onBrowseAll}
          className="mt-4 inline-flex h-10 items-center rounded-full bg-amber-400 px-5 text-sm font-semibold text-slate-950 transition hover:bg-amber-300"
        >
          Смотреть все услуги
        </button>
      </div>
    );
  }

  const [lead, ...rest] = items;

  return (
    <div className="space-y-10">
      <section>
        <div className="mb-5 flex items-center gap-2">
          <Flame className="h-5 w-5 text-amber-400" />
          <h2 className="text-xl font-bold tracking-tight sm:text-2xl">Выбор Allvision</h2>
        </div>
        {/* Первая карточка крупнее остальных: на мобильном она занимает экран целиком
            и работает как обложка вкладки. */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="sm:col-span-2 lg:col-span-2 lg:row-span-2">
            <ServiceTile service={lead} size="large" showPrice />
          </div>
          {rest.slice(0, 4).map((service) => (
            <ServiceTile key={service.id} service={service} showPrice />
          ))}
        </div>
      </section>

      {rest.length > 4 && (
        <section>
          <div className="mb-5 flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-amber-400" />
            <h2 className="text-xl font-bold tracking-tight sm:text-2xl">Тоже часто дарят</h2>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {rest.slice(4).map((service) => (
              <ServiceTile key={service.id} service={service} showPrice />
            ))}
          </div>
        </section>
      )}

      <div className="flex justify-center">
        <button
          type="button"
          onClick={onBrowseAll}
          className="inline-flex h-11 items-center rounded-full border border-slate-700 px-6 text-sm font-semibold text-slate-200 transition hover:border-amber-400 hover:text-amber-300"
        >
          Смотреть весь каталог
        </button>
      </div>
    </div>
  );
}
