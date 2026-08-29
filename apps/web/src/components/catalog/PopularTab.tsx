'use client';

import type { PublicService } from '@allvision/shared';
import { ServiceTile } from './ServiceTile';

type PopularTabProps = {
  /** Услуги вкладки: уже отфильтрованы по выбранному поводу и без работы с обложки. */
  services: PublicService[];
  onBrowseAll: () => void;
};

/**
 * Кураторская вкладка. Это посадочная страница рекламы, поэтому здесь нет фильтров
 * по категориям — только то, что мы сами вынесли вперёд. Порядок задаётся в админке
 * через featuredOrder.
 *
 * Карточки одного размера: мозаика из трёх размеров смотрелась рвано и не помогала
 * выбирать — акцент даёт обложка наверху страницы, а не крупная плитка в середине ленты.
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

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {items.map((service) => (
          <ServiceTile key={service.id} service={service} showPrice showFeaturedBadge={false} />
        ))}
      </div>

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
