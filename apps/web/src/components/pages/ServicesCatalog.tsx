'use client';

import Image from 'next/image';
import Link from 'next/link';
import { AlertCircle, ArrowRight, Baby, Cake, Clapperboard, Flame, Gift, Heart, LayoutGrid, Sparkles } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { PublicService, ServiceCategory } from '@allvision/shared';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useListServicesQuery } from '@/store/api/services-api';
import { useGetServiceCategoriesQuery } from '@/store/api/public-api';
import { categoryHref, giftServicePriceFrom } from '@/lib/gift-factory';
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

function priceFrom(service: PublicService) {
  return giftServicePriceFrom(service);
}

function previewFrom(service: PublicService) {
  return mediaUrl(service.previewImage ?? service.coverImage ?? service.galleryImages[0]) ?? 'https://picsum.photos/seed/allvision-service/900/600';
}

function ServiceTile({ service, featured = false }: { service: PublicService; featured?: boolean }) {
  const previewVideo = mediaUrl(service.previewVideo);
  const previewImage = previewFrom(service);

  return (
    <Card className="group flex h-full overflow-hidden border-slate-800 bg-slate-900 transition duration-300 hover:-translate-y-1 hover:border-amber-400/70 hover:shadow-xl hover:shadow-amber-500/10">
      <Link href={`/services/${service.slug}`} className="flex w-full flex-col">
        <div className={cn('relative overflow-hidden bg-slate-950', featured ? 'aspect-[16/9]' : 'aspect-[4/3]')}>
          {previewVideo ? (
            <video
              src={previewVideo}
              muted
              loop
              playsInline
              autoPlay
              className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
            />
          ) : (
            <Image
              src={previewImage}
              alt={service.title}
              fill
              sizes={featured ? '(max-width: 1024px) 100vw, 33vw' : '(max-width: 1024px) 100vw, 25vw'}
              className="object-cover transition duration-500 group-hover:scale-105"
            />
          )}
          {service.isFeatured && (
            <Badge className="absolute left-3 top-3 border-amber-300/60 bg-amber-400 text-slate-950">
              Популярное
            </Badge>
          )}
        </div>
        <CardContent className="flex flex-1 flex-col p-5">
          <div className="flex flex-1 flex-col gap-3">
            <h3 className="text-xl font-bold tracking-tight text-slate-50">{service.title}</h3>
            <p className="line-clamp-3 text-sm leading-6 text-slate-400">{service.shortDesc}</p>
          </div>
          <div className="mt-5 flex items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-500">Цена</div>
              <div className="text-lg font-bold text-amber-400">от {priceFrom(service)} коинов</div>
            </div>
            <span className="grid h-10 w-10 place-items-center rounded-md border border-slate-700 bg-slate-800 text-slate-100 transition group-hover:border-amber-400 group-hover:text-amber-300">
              <ArrowRight className="h-4 w-4" />
            </span>
          </div>
        </CardContent>
      </Link>
    </Card>
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

  return (
    <div className="pb-16">
      <section className="container py-12 md:py-16">
        <div className="grid gap-8 lg:grid-cols-[1fr_0.7fr] lg:items-end">
          <div className="max-w-4xl">
            <Badge className="border-amber-400/40 bg-amber-400/10 text-amber-200 hover:bg-amber-400/10">
              AI-фабрика услуг
            </Badge>
            <h1 className="mt-5 text-4xl font-black leading-tight tracking-tight md:text-6xl">
              Цифровые услуги, которые удивят
            </h1>
            <p className="mt-5 text-lg leading-8 text-slate-300">
              Выберите повод, загрузите фото или пару деталей, а Allvision соберёт готовый ролик, открытку или мем за несколько минут.
            </p>
          </div>
          <nav aria-label="Категории услуг" className="min-w-0 lg:justify-self-end">
            <div className="rounded-lg border border-slate-800 bg-slate-900/85 p-1 shadow-lg shadow-black/15">
              <div className="flex max-w-full gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <Link
                  href="/services"
                  className={cn(
                    'inline-flex h-10 shrink-0 items-center gap-2 rounded-md px-3 text-sm font-semibold text-slate-300 transition hover:bg-slate-800 hover:text-white',
                    !selectedCategory && 'bg-amber-400 text-slate-950 hover:bg-amber-300 hover:text-slate-950',
                  )}
                >
                  <LayoutGrid className="h-4 w-4" />
                  <span>Все</span>
                </Link>
                {categories.map((category) => {
                  const Icon = category.icon;
                  return (
                    <Link
                      key={category.value}
                      href={`/services?category=${category.value}`}
                      className={cn(
                        'inline-flex h-10 shrink-0 items-center gap-2 rounded-md px-3 text-sm font-semibold text-slate-300 transition hover:bg-slate-800 hover:text-white',
                        selectedCategory === category.value && 'bg-amber-400 text-slate-950 hover:bg-amber-300 hover:text-slate-950',
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      <span>{category.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          </nav>
        </div>
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
      ) : (
        <>
          {featured.length > 0 && (
            <section className="container">
              <div className="mb-5 flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-amber-400" />
                <h2 className="text-2xl font-bold tracking-tight">
                  {activeCategory ? `Популярное в категории «${activeCategory.label}»` : 'Популярные услуги'}
                </h2>
              </div>
              <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                {featured.map((service) => (
                  <ServiceTile key={service.id} service={service} featured />
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
                    <div className="grid auto-rows-fr gap-6 sm:grid-cols-2 lg:grid-cols-4">
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
