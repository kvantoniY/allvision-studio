'use client';

import { useMemo, useState } from 'react';
import { FallbackImage } from '@/components/ui/fallback-image';
import Link from 'next/link';
import { AlertCircle, Baby, Cake, ChevronDown, Clapperboard, Flame, Gift, Heart, LayoutGrid, Search, Sparkles, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { PublicService, ServiceCategory } from '@allvision/shared';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useListServicesQuery } from '@/store/api/services-api';
import { useGetServiceCategoriesQuery } from '@/store/api/public-api';
import { categoryHref } from '@/lib/gift-factory';
import { cn } from '@/lib/utils';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:4000');

const iconMap: Record<string, LucideIcon> = {
  Heart, Sparkles, Clapperboard, Baby, Gift, Flame, Cake, LayoutGrid,
};

function iconForCategory(iconName: string | null | undefined): LucideIcon {
  if (iconName && iconMap[iconName]) return iconMap[iconName];
  return LayoutGrid;
}

function mediaUrl(value?: string | null) {
  if (!value) return null;
  if (value.startsWith('/static/')) return `${API_URL}${value}`;
  return value;
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9\s]/gi, ' ').replace(/\s+/g, ' ').trim();
}

function bigrams(value: string): string[] {
  const grams: string[] = [];
  for (let i = 0; i < value.length - 1; i += 1) grams.push(value.slice(i, i + 2));
  return grams;
}

// Коэффициент Сёренсена–Дайса по биграммам: 1 — идентичны, 0 — нет общего.
// Ловит опечатки и близкие по написанию слова ("похожие").
function diceSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const aGrams = bigrams(a);
  const bGrams = bigrams(b);
  const counts = new Map<string, number>();
  for (const gram of aGrams) counts.set(gram, (counts.get(gram) ?? 0) + 1);
  let intersection = 0;
  for (const gram of bGrams) {
    const count = counts.get(gram) ?? 0;
    if (count > 0) {
      intersection += 1;
      counts.set(gram, count - 1);
    }
  }
  return (2 * intersection) / (aGrams.length + bGrams.length);
}

// Релевантность услуги поисковому запросу: точные вхождения важнее,
// плюс fuzzy-совпадение по словам для опечаток и похожих формулировок.
function scoreService(service: PublicService, categoryLabel: string, query: string): number {
  const q = normalizeText(query);
  if (!q) return 0;
  const title = normalizeText(service.title);
  const haystack = normalizeText([service.title, service.shortDesc, service.description ?? '', categoryLabel].join(' '));
  const words = new Set(haystack.split(' ').filter((word) => word.length >= 2));

  let score = 0;
  if (title.includes(q)) score += 120;
  else if (haystack.includes(q)) score += 60;

  const queryTokens = q.split(' ').filter((token) => token.length >= 2);
  for (const token of queryTokens) {
    if (title.includes(token)) {
      score += 24;
      continue;
    }
    if (haystack.includes(token)) {
      score += 12;
      continue;
    }
    let best = 0;
    for (const word of words) {
      const sim = diceSimilarity(token, word);
      if (sim > best) best = sim;
    }
    if (best >= 0.6) score += best * 14;
    else if (best >= 0.42) score += best * 5;
  }
  return score;
}

const SEARCH_SCORE_THRESHOLD = 6;

function previewFrom(service: PublicService) {
  return mediaUrl(service.previewImage ?? service.coverImage ?? service.galleryImages[0]) ?? '/mock_preview.png';
}

function ServiceTile({ service }: { service: PublicService }) {
  const previewVideo = mediaUrl(service.previewVideo);
  const previewImage = previewFrom(service);
  const showVideo = service.previewMode === 'video'
    ? Boolean(previewVideo)
    : service.previewMode === 'image'
      ? false
      : Boolean(previewVideo);

  return (
    <Link href={`/services/${service.slug}`} className="group block">
      <div className="relative aspect-[16/10] overflow-hidden rounded-xl border border-slate-800 bg-slate-950 transition group-hover:border-amber-400/70">
        {showVideo && previewVideo ? (
          <video
            src={previewVideo}
            muted
            loop
            playsInline
            autoPlay
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
          />
        ) : (
          <FallbackImage
            src={previewImage}
            alt={service.title}
            className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
        {service.isFeatured && (
          <Badge className="absolute left-2.5 top-2.5 border-amber-300/60 bg-amber-400 px-2 py-0.5 text-[11px] text-slate-950">
            Популярное
          </Badge>
        )}
        <div className="absolute inset-x-3 bottom-2.5">
          <div className="w-full truncate text-sm font-semibold text-white drop-shadow-md">{service.title}</div>
        </div>
      </div>
    </Link>
  );
}

type ServicesCatalogProps = {
  initialCategory?: ServiceCategory;
};

export function ServicesCatalog({ initialCategory }: ServicesCatalogProps) {
  const requestedCategory = initialCategory;
  const { data: categoriesData } = useGetServiceCategoriesQuery();
  const dynamicCategories = (categoriesData?.categories ?? []).map((category) => ({
    value: category.code,
    label: category.title,
    description: category.description ?? category.title,
    href: categoryHref(category.code),
    icon: iconForCategory(category.iconName),
    anchor: category.code.toLowerCase().replace(/_/g, '-'),
  }));
  const validCategories = new Set(dynamicCategories.map((category) => category.value));
  const selectedCategory = requestedCategory && validCategories.has(requestedCategory) ? requestedCategory : undefined;
  const { data, isLoading, isError } = useListServicesQuery(selectedCategory ? { category: selectedCategory } : undefined);
  const services = data?.services ?? [];
  const featured = services.filter((service) => service.isFeatured);
  const activeCategory = dynamicCategories.find((category) => category.value === selectedCategory);
  const categories = dynamicCategories;

  const [query, setQuery] = useState('');
  const [showAllFeatured, setShowAllFeatured] = useState(false);
  const FEATURED_COLLAPSED = 5;
  const visibleFeatured = showAllFeatured ? featured : featured.slice(0, FEATURED_COLLAPSED);
  const trimmedQuery = query.trim();
  const isSearching = trimmedQuery.length > 0;
  const categoryLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const category of dynamicCategories) map.set(category.value, category.label);
    return map;
  }, [dynamicCategories]);
  const searchResults = useMemo(() => {
    if (!isSearching) return [] as PublicService[];
    return services
      .map((service) => ({ service, score: scoreService(service, categoryLabelMap.get(service.category) ?? '', trimmedQuery) }))
      .filter((item) => item.score >= SEARCH_SCORE_THRESHOLD)
      .sort((a, b) => b.score - a.score)
      .map((item) => item.service);
  }, [isSearching, services, categoryLabelMap, trimmedQuery]);

  return (
    <div className="pb-16">
      <section className="container pt-12 md:pt-16">
        <div className="max-w-3xl">
          <h1 className="text-4xl font-black leading-tight tracking-tight md:text-6xl">
            Цифровые услуги, которые удивят
          </h1>
          <p className="mt-5 text-lg leading-8 text-slate-300">
            Выберите повод, загрузите фото или пару деталей, а Allvision соберёт готовый ролик, открытку или мем за несколько минут.
          </p>
          <div className="relative mt-6 max-w-xl">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <Input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Поиск услуги: оживить фото, тренд, открытка..."
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

      {/* Переключатель категорий — полноширинной строкой над услугами */}
      <section className="container sticky top-0 z-20 mt-8 bg-background/80 py-3 backdrop-blur">
        <nav aria-label="Категории услуг" className="-mx-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex min-w-max gap-2 px-1">
            <Link
              href="/services"
              className={cn(
                'inline-flex h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition',
                !selectedCategory
                  ? 'border-amber-400 bg-amber-400 text-slate-950 hover:bg-amber-300'
                  : 'border-slate-700 bg-slate-900/60 text-slate-300 hover:border-slate-600 hover:text-white',
              )}
            >
              <LayoutGrid className="h-4 w-4" />
              <span>Все</span>
            </Link>
            {categories.map((category) => {
              const Icon = category.icon;
              const isActive = selectedCategory === category.value;
              return (
                <Link
                  key={category.value}
                  href={`/services?category=${category.value}`}
                  className={cn(
                    'inline-flex h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition',
                    isActive
                      ? 'border-amber-400 bg-amber-400 text-slate-950 hover:bg-amber-300'
                      : 'border-slate-700 bg-slate-900/60 text-slate-300 hover:border-slate-600 hover:text-white',
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span>{category.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      </section>

      {isError && (
        <section className="container">
          <Alert variant="destructive" className="max-w-2xl">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Не удалось загрузить каталог</AlertTitle>
            <AlertDescription>Проверьте API и seed пилотных услуг.</AlertDescription>
          </Alert>
        </section>
      )}

      {isLoading ? (
        <section className="container grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} className="h-[360px] rounded-lg" />
          ))}
        </section>
      ) : isSearching ? (
        <section className="container">
          <div className="mb-6 flex items-center gap-2">
            <Search className="h-5 w-5 text-amber-400" />
            <h2 className="text-2xl font-bold tracking-tight">
              Результаты поиска{searchResults.length > 0 ? ` · ${searchResults.length}` : ''}
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
              Ничего не найдено по запросу «{trimmedQuery}». Попробуйте другие слова или загляните в категории ниже.
            </div>
          )}
        </section>
      ) : (
        <>
          {featured.length > 0 && (
            <section className="container mt-6">
              <div className="mb-5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-amber-400" />
                  <h2 className="text-2xl font-bold tracking-tight">
                    {activeCategory ? `Популярное в категории «${activeCategory.label}»` : 'Популярные услуги'}
                  </h2>
                </div>
                {featured.length > FEATURED_COLLAPSED && (
                  <button
                    type="button"
                    onClick={() => setShowAllFeatured((value) => !value)}
                    className="inline-flex shrink-0 items-center gap-1 rounded-full border border-slate-700 px-3.5 py-1.5 text-sm font-medium text-slate-300 transition hover:border-slate-500 hover:text-white"
                  >
                    {showAllFeatured ? 'Свернуть' : 'Показать все'}
                    <ChevronDown className={cn('h-4 w-4 transition', showAllFeatured && 'rotate-180')} />
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {visibleFeatured.map((service) => (
                  <ServiceTile key={service.id} service={service} />
                ))}
              </div>
            </section>
          )}

          <div className="container mt-14 space-y-14">
            {categories
              .filter((category) => !selectedCategory || category.value === selectedCategory)
              .map((category) => {
              const Icon = category.icon;
              const items = services.filter((service) => service.category === category.value);
              return (
                <section key={category.value} id={category.anchor} className="scroll-mt-24">
                  <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <div className="max-w-3xl">
                      <div className="flex items-center gap-3">
                        <span className="grid h-10 w-10 place-items-center rounded-md border border-slate-700 bg-slate-900 text-amber-300">
                          <Icon className="h-5 w-5" />
                        </span>
                        <h2 className="text-3xl font-bold tracking-tight">{category.label}</h2>
                      </div>
                      <p className="mt-3 leading-7 text-slate-400">{category.description}</p>
                    </div>
                  </div>
                  {items.length > 0 ? (
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                      {items.map((service) => (
                        <ServiceTile key={service.id} service={service} />
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-slate-700 bg-slate-900/60 p-8 text-sm text-slate-400">
                      В этой категории пока нет активных услуг.
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
