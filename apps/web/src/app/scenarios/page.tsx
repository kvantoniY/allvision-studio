'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { PublicScenarioTemplate } from '@allvision/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { TEMPLATE_CATEGORY_LABEL } from '@/components/studio/v3-labels';
import { useListPublicScenarioTemplatesQuery } from '@/store/api/public-scenario-templates-api';
import { cn } from '@/lib/utils';

const categoryOrder = ['all', 'wedding', 'birthday', 'newyear', 'family', 'memorial', 'kids', 'pets'];

function categoryLabel(category: string) {
  if (category === 'all') return 'Все';
  return TEMPLATE_CATEGORY_LABEL[category] ?? category;
}

function TemplateCard({ template, featured = false }: { template: PublicScenarioTemplate; featured?: boolean }) {
  return (
    <Link href={`/scenarios/${template.slug}`} className="group block">
      <article
        className={cn(
          'h-full overflow-hidden rounded-lg border bg-slate-900 transition hover:-translate-y-0.5 hover:border-violet-500/60',
          featured ? 'border-amber-400/60 shadow-[0_0_28px_-18px_rgba(251,191,36,0.9)]' : 'border-slate-800',
        )}
      >
        <div className="relative aspect-[4/3] bg-slate-950">
          {template.previewImage ? (
            <Image
              src={template.previewImage}
              alt={template.title}
              fill
              sizes="(min-width: 1024px) 33vw, 100vw"
              className="object-cover transition duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="grid h-full place-items-center text-slate-600">
              <Sparkles className="h-8 w-8" />
            </div>
          )}
          {featured && <Badge className="absolute left-3 top-3 bg-amber-400 text-slate-950">Featured</Badge>}
        </div>
        <div className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="bg-slate-800 text-slate-200">
              {categoryLabel(template.category)}
            </Badge>
            <Badge className="bg-violet-600 text-white">{template.priceTokens} токенов</Badge>
          </div>
          <div>
            <h2 className="text-lg font-semibold leading-tight text-white">{template.title}</h2>
            <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-400">{template.shortDesc}</p>
          </div>
        </div>
      </article>
    </Link>
  );
}

export default function ScenariosPage() {
  const [category, setCategory] = useState('all');
  const query = category === 'all' ? undefined : { category };
  const { data, isLoading } = useListPublicScenarioTemplatesQuery(query);
  const templates = useMemo(() => data?.templates ?? [], [data?.templates]);
  const featured = useMemo(() => templates.filter((template) => template.isFeatured), [templates]);

  return (
    <main className="container py-12 md:py-16">
      <div className="max-w-3xl">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-violet-400">Сценарии</p>
        <h1 className="mt-3 text-4xl font-bold md:text-6xl">Каталог сценариев для ваших эпизодов</h1>
        <p className="mt-5 text-lg leading-8 text-slate-400">
          Выберите шаблон, добавьте готовых персонажей и сцену, а Allvision Studio соберёт короткий эпизод с вашим сюжетом.
        </p>
      </div>

      <div className="mt-8 flex flex-wrap gap-2">
        {categoryOrder.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setCategory(item)}
            className={cn(
              'rounded-full border px-3 py-1.5 text-sm transition',
              category === item
                ? 'border-violet-500 bg-violet-600 text-white'
                : 'border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800',
            )}
          >
            {categoryLabel(item)}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-80 rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="mt-10 space-y-12">
          {category === 'all' && featured.length > 0 && (
            <section>
              <div className="mb-4 flex items-center justify-between gap-4">
                <h2 className="text-2xl font-semibold">Избранные</h2>
                <Button asChild variant="outline" size="sm">
                  <Link href="/dashboard/episodes/new">Создать эпизод</Link>
                </Button>
              </div>
              <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                {featured.map((template) => (
                  <TemplateCard key={template.id} template={template} featured />
                ))}
              </div>
            </section>
          )}

          <section>
            <h2 className="mb-4 text-2xl font-semibold">{category === 'all' ? 'Все сценарии' : categoryLabel(category)}</h2>
            {templates.length === 0 ? (
              <div className="rounded-lg border border-slate-800 bg-slate-900 p-8 text-center text-slate-400">
                В этой категории пока нет активных шаблонов.
              </div>
            ) : (
              <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                {templates.map((template) => (
                  <TemplateCard key={template.id} template={template} />
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
