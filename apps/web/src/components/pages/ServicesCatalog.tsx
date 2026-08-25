'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Search, X } from 'lucide-react';
import {
  CATALOG_SECTION_DEFS,
  catalogSectionDef,
  isCatalogSection,
  isOccasionTag,
  type CatalogSection,
  type OccasionTag,
  type PublicService,
} from '@allvision/shared';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { AlbumsTab } from '@/components/catalog/AlbumsTab';
import { GreetingsTab } from '@/components/catalog/GreetingsTab';
import { OccasionChips } from '@/components/catalog/OccasionChips';
import { PopularTab } from '@/components/catalog/PopularTab';
import { ServiceTile } from '@/components/catalog/ServiceTile';
import { ServicesTab } from '@/components/catalog/ServicesTab';
import { SEARCH_SCORE_THRESHOLD, iconForCategory, scoreService } from '@/components/catalog/catalog-utils';
import { useListServicesQuery } from '@/store/api/services-api';
import { useGetServiceCategoriesQuery } from '@/store/api/public-api';
import { cn } from '@/lib/utils';

type ServicesCatalogProps = {
  initialTab?: string;
  initialCategory?: string;
  initialOccasion?: string;
};

/**
 * Витрина. Весь активный каталог приходит одним запросом (десятки услуг — небольшой ответ),
 * а вкладки, категории и поводы фильтруют его на клиенте: переключение вкладок мгновенное
 * и без сетевых задержек, что особенно заметно на телефоне.
 *
 * Состояние фильтров пишется в адрес через replaceState — реклама может вести сразу
 * на нужную вкладку (/services?tab=greetings), но клики по чипам не засоряют историю.
 */
export function ServicesCatalog({ initialTab, initialCategory, initialOccasion }: ServicesCatalogProps) {
  const [tab, setTab] = useState<CatalogSection>(isCatalogSection(initialTab) ? initialTab : 'popular');
  const [category, setCategory] = useState<string | null>(initialCategory ?? null);
  const [occasion, setOccasion] = useState<OccasionTag | null>(isOccasionTag(initialOccasion) ? initialOccasion : null);
  const [query, setQuery] = useState('');

  const { data: categoriesData } = useGetServiceCategoriesQuery();
  const { data, isLoading, isError } = useListServicesQuery();

  const categories = useMemo(() => categoriesData?.categories ?? [], [categoriesData]);
  const services = useMemo(() => data?.services ?? [], [data]);

  // Категория живёт в конкретной вкладке; услуги с неизвестной категорией (например,
  // категорию скрыли в админке) в контентные вкладки не попадают.
  const sectionByCategory = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of categories) map.set(item.code, item.section);
    return map;
  }, [categories]);

  const categoryLabels = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of categories) map.set(item.code, item.title);
    return map;
  }, [categories]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (tab !== 'popular') params.set('tab', tab);
    if (category) params.set('category', category);
    if (occasion) params.set('occasion', occasion);
    const search = params.toString();
    window.history.replaceState(null, '', search ? '/services?' + search : '/services');
  }, [tab, category, occasion]);

  const changeTab = useCallback((next: CatalogSection) => {
    setTab(next);
    // Категория принадлежит вкладке, поэтому при переходе сбрасывается. Повод — сквозной.
    setCategory(null);
    setQuery('');
  }, []);

  const byOccasion = useMemo(
    () => (occasion ? services.filter((service) => service.occasionTags.includes(occasion)) : services),
    [services, occasion],
  );

  const servicesInSection = useCallback(
    (section: CatalogSection, list: PublicService[]) =>
      list.filter((service) => sectionByCategory.get(service.category) === section),
    [sectionByCategory],
  );

  // Чипы поводов показываем только для тех, что реально встречаются во вкладке —
  // иначе половина фильтров ведёт в пустой экран.
  const availableOccasions = useMemo(() => {
    const scope = tab === 'popular'
      ? services
      : tab === 'albums'
        ? []
        : servicesInSection(tab, services);
    const set = new Set<string>();
    for (const service of scope) for (const tag of service.occasionTags) set.add(tag);
    return set;
  }, [tab, services, servicesInSection]);

  const trimmedQuery = query.trim();
  const isSearching = trimmedQuery.length > 0;

  const searchResults = useMemo(() => {
    if (!isSearching) return [] as PublicService[];
    return byOccasion
      .map((service) => ({
        service,
        score: scoreService(service, categoryLabels.get(service.category) ?? '', trimmedQuery),
      }))
      .filter((item) => item.score >= SEARCH_SCORE_THRESHOLD)
      .sort((a, b) => b.score - a.score)
      .map((item) => item.service);
  }, [isSearching, byOccasion, categoryLabels, trimmedQuery]);

  const activeSection = catalogSectionDef(tab);

  return (
    <div className="pb-16">
      <section className="container pt-10 md:pt-14">
        <div className="max-w-3xl">
          <h1 className="text-3xl font-black leading-tight tracking-tight sm:text-4xl md:text-6xl">
            {activeSection.heading}
          </h1>
          <p className="mt-4 text-base leading-7 text-slate-300 md:text-lg md:leading-8">{activeSection.subtitle}</p>
          <div className="relative mt-6 max-w-xl">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <Input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Поиск: оживить фото, поздравление, тренд..."
              aria-label="Поиск услуг"
              className="h-12 border-slate-700 bg-slate-900/80 pl-10 pr-10 text-base"
            />
            {isSearching && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Очистить поиск"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 transition hover:text-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </section>

      <section className="container sticky top-14 z-20 mt-6 border-b border-slate-800/80 bg-slate-950/85 py-3 backdrop-blur md:top-0">
        <nav aria-label="Разделы каталога" className="-mx-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex min-w-max gap-2 px-1">
            {CATALOG_SECTION_DEFS.map((section) => {
              const Icon = iconForCategory(section.iconName);
              const isActive = tab === section.code;
              return (
                <button
                  key={section.code}
                  type="button"
                  onClick={() => changeTab(section.code)}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'inline-flex h-11 shrink-0 items-center gap-2 rounded-full border px-5 text-sm font-semibold transition',
                    isActive
                      ? 'border-amber-400 bg-amber-400 text-slate-950'
                      : 'border-slate-700 bg-slate-900/60 text-slate-300 hover:border-slate-600 hover:text-white',
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span>{section.title}</span>
                </button>
              );
            })}
          </div>
        </nav>
      </section>

      {tab !== 'albums' && !isSearching && (
        <section className="container mt-5">
          <OccasionChips value={occasion} onChange={setOccasion} available={availableOccasions} />
        </section>
      )}

      {isError && (
        <section className="container mt-8">
          <Alert variant="destructive" className="max-w-2xl">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Не удалось загрузить каталог</AlertTitle>
            <AlertDescription>Обновите страницу или попробуйте позже.</AlertDescription>
          </Alert>
        </section>
      )}

      <div className="container mt-8">
        {isLoading ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {Array.from({ length: 10 }).map((_, index) => (
              <Skeleton key={index} className="aspect-[16/10] rounded-xl" />
            ))}
          </div>
        ) : isSearching ? (
          <section>
            <div className="mb-5 flex items-center gap-2">
              <Search className="h-5 w-5 text-amber-400" />
              <h2 className="text-xl font-bold tracking-tight sm:text-2xl">
                Результаты поиска{searchResults.length > 0 ? ' · ' + searchResults.length : ''}
              </h2>
            </div>
            {searchResults.length > 0 ? (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {searchResults.map((service) => (
                  <ServiceTile key={service.id} service={service} />
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-slate-700 bg-slate-900/60 p-8 text-sm text-slate-400">
                Ничего не найдено по запросу «{trimmedQuery}». Попробуйте другие слова.
              </div>
            )}
          </section>
        ) : tab === 'popular' ? (
          <PopularTab services={byOccasion} onBrowseAll={() => changeTab('services')} />
        ) : tab === 'services' ? (
          <ServicesTab
            categories={categories.filter((item) => item.section === 'services')}
            services={servicesInSection('services', byOccasion)}
            category={category}
            onCategoryChange={setCategory}
          />
        ) : tab === 'greetings' ? (
          <GreetingsTab services={servicesInSection('greetings', byOccasion)} />
        ) : (
          <AlbumsTab />
        )}
      </div>
    </div>
  );
}
