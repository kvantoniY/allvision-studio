'use client';

import { LayoutGrid } from 'lucide-react';
import type { PublicService, PublicServiceCategory } from '@allvision/shared';
import { cn } from '@/lib/utils';
import { ServiceTile } from './ServiceTile';
import { iconForCategory } from './catalog-utils';

type ServicesTabProps = {
  categories: PublicServiceCategory[];
  services: PublicService[];
  category: string | null;
  onCategoryChange: (code: string | null) => void;
};

/**
 * Каталог существующих AI-услуг. Сюда попадает пользователь, который пришёл
 * за инструментом, а не за подарком, поэтому здесь сохранена привычная
 * разбивка по категориям.
 */
export function ServicesTab({ categories, services, category, onCategoryChange }: ServicesTabProps) {
  const visibleCategories = category ? categories.filter((item) => item.code === category) : categories;

  return (
    <div className="space-y-10">
      <nav aria-label="Категории услуг" className="-mx-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex min-w-max gap-2 px-1">
          <button
            type="button"
            onClick={() => onCategoryChange(null)}
            className={cn(
              'inline-flex h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition',
              !category
                ? 'border-amber-400 bg-amber-400 text-slate-950 hover:bg-amber-300'
                : 'border-slate-700 bg-slate-900/60 text-slate-300 hover:border-slate-600 hover:text-white',
            )}
          >
            <LayoutGrid className="h-4 w-4" />
            <span>Все</span>
          </button>
          {categories.map((item) => {
            const Icon = iconForCategory(item.iconName);
            const isActive = category === item.code;
            return (
              <button
                key={item.code}
                type="button"
                onClick={() => onCategoryChange(isActive ? null : item.code)}
                className={cn(
                  'inline-flex h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition',
                  isActive
                    ? 'border-amber-400 bg-amber-400 text-slate-950 hover:bg-amber-300'
                    : 'border-slate-700 bg-slate-900/60 text-slate-300 hover:border-slate-600 hover:text-white',
                )}
              >
                <Icon className="h-4 w-4" />
                <span>{item.title}</span>
              </button>
            );
          })}
        </div>
      </nav>

      <div className="space-y-12">
        {visibleCategories.map((item) => {
          const Icon = iconForCategory(item.iconName);
          const items = services.filter((service) => service.category === item.code);
          if (items.length === 0 && !category) return null;
          return (
            <section key={item.code} id={item.code.toLowerCase().replace(/_/g, '-')} className="scroll-mt-24">
              <div className="mb-5 max-w-3xl">
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-md border border-slate-700 bg-slate-900 text-amber-300">
                    <Icon className="h-5 w-5" />
                  </span>
                  <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{item.title}</h2>
                </div>
                {item.description && <p className="mt-3 leading-7 text-slate-400">{item.description}</p>}
              </div>
              {items.length > 0 ? (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  {items.map((service) => (
                    <ServiceTile key={service.id} service={service} />
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-slate-700 bg-slate-900/60 p-8 text-sm text-slate-400">
                  В этой категории пока нет услуг под выбранный повод.
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
