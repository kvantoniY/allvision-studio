'use client';

import Image from 'next/image';
import Link from 'next/link';
import { AlertCircle, ArrowRight, Baby, Cake, Clapperboard, Flame, Gift, Heart, LayoutGrid, Sparkles } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { PublicService } from '@allvision/shared';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useListServicesQuery } from '@/store/api/services-api';
import { useGetServiceCategoriesQuery } from '@/store/api/public-api';
import { categoryHref, giftServicePriceFrom } from '@/lib/gift-factory';
import { Reveal } from './Reveal';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:4000');

const iconMap: Record<string, LucideIcon> = {
  Heart, Sparkles, Clapperboard, Baby, Gift, Flame, Cake, LayoutGrid,
};

function iconForCategory(iconName: string | null | undefined): LucideIcon {
  if (iconName && iconMap[iconName]) return iconMap[iconName];
  return LayoutGrid;
}

const toneCycle = [
  'border-rose-300/40 bg-rose-500/10 text-rose-200 hover:border-rose-300/70',
  'border-cyan-300/40 bg-cyan-500/10 text-cyan-200 hover:border-cyan-300/70',
  'border-lime-300/40 bg-lime-500/10 text-lime-200 hover:border-lime-300/70',
  'border-amber-300/40 bg-amber-500/10 text-amber-200 hover:border-amber-300/70',
  'border-violet-300/40 bg-violet-500/10 text-violet-200 hover:border-violet-300/70',
];

function mediaUrl(value?: string | null) {
  if (!value) return null;
  if (value.startsWith('/static/')) return `${API_URL}${value}`;
  return value;
}

function servicePreview(service: PublicService) {
  return mediaUrl(service.previewImage ?? service.coverImage ?? service.galleryImages[0]) ?? '/mock_preview.png';
}

export function ServicesGrid() {
  const { data, isLoading, isError } = useListServicesQuery({ featured: true });
  const { data: categoriesData } = useGetServiceCategoriesQuery();
  const featured = data?.services ?? [];
  const categories = categoriesData?.categories ?? [];

  return (
    <section id="services" className="container py-20">
      <Reveal className="mx-auto max-w-3xl text-center">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-indigo-500">Категории услуг</p>
        <h2 className="mt-3 text-3xl font-bold md:text-5xl">Сначала повод, потом формат</h2>
        <p className="mt-4 text-lg leading-8 text-muted-foreground">
          Выберите направление, которое ближе к вашему сюрпризу. Внутри — готовые решения с понятной ценой и сроком.
        </p>
      </Reveal>

      {isError && (
        <div className="mx-auto mt-10 flex max-w-2xl items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          <AlertCircle className="h-5 w-5" />
          Не удалось загрузить услуги. Проверьте, что API запущен и seed выполнен.
        </div>
      )}

      <div className="mt-10 grid auto-rows-fr gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {categories.map((category, index) => {
          const Icon = iconForCategory(category.iconName);
          const tone = toneCycle[index % toneCycle.length];
          return (
            <Reveal key={category.code} delay={index * 0.04} className="h-full">
              <Link href={categoryHref(category.code)} className="group block h-full">
                <Card className={`h-full border bg-slate-950 transition duration-300 hover:-translate-y-1 ${tone}`}>
                  <CardContent className="flex h-full flex-col gap-5 p-5">
                    <span className="grid h-12 w-12 place-items-center rounded-md border border-current/25 bg-white/5">
                      <Icon className="h-6 w-6" />
                    </span>
                    <div className="flex-1">
                      <h3 className="text-xl font-bold text-white">{category.title}</h3>
                      <p className="mt-3 text-sm leading-6 text-slate-300">{category.description ?? ''}</p>
                    </div>
                    <div className="flex items-center justify-between text-sm font-medium">
                      <span>Открыть категорию</span>
                      <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </Reveal>
          );
        })}
      </div>

      <Reveal className="mt-14">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium uppercase tracking-[0.18em] text-amber-500">
              <Sparkles className="h-4 w-4" />
              Популярные услуги
            </div>
            <h3 className="mt-2 text-2xl font-bold md:text-3xl">Готовые сценарии, которые чаще всего выбирают</h3>
          </div>
          <Link href="/services" className="text-sm font-medium text-indigo-500 hover:underline">
            Весь каталог
          </Link>
        </div>
        <div className="grid auto-rows-fr gap-5 md:grid-cols-2 lg:grid-cols-3">
          {isLoading
            ? Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-[340px] rounded-lg" />)
            : featured.slice(0, 3).map((service) => (
                <Link key={service.id} href={`/services/${service.slug}`} className="group">
                  <Card className="h-full overflow-hidden border-slate-800 bg-slate-900 transition duration-300 hover:-translate-y-1 hover:border-amber-400/70">
                    <div className="relative aspect-[16/10] overflow-hidden bg-slate-950">
                      <Image
                        src={servicePreview(service)}
                        alt={service.title}
                        fill
                        sizes="(max-width: 1024px) 100vw, 33vw"
                        className="object-cover transition duration-500 group-hover:scale-105"
                      />
                      <Badge className="absolute left-3 top-3 border-amber-300/60 bg-amber-400 text-slate-950">
                        Популярное
                      </Badge>
                    </div>
                    <CardContent className="p-5">
                      <h4 className="text-lg font-bold text-white">{service.title}</h4>
                      <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-400">{service.shortDesc}</p>
                      <div className="mt-5 flex items-center justify-between gap-3">
                        <span className="text-sm font-semibold text-amber-300">
                          от {giftServicePriceFrom(service)} токенов
                        </span>
                        <ArrowRight className="h-4 w-4 text-amber-300 transition group-hover:translate-x-1" />
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
        </div>
      </Reveal>
    </section>
  );
}
