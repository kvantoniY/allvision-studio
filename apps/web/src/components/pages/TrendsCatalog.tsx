'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Play, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { trendTags } from '@/lib/public-content';
import { cn } from '@/lib/utils';
import { useGetTrendsQuery } from '@/store/api/public-api';

export function TrendsCatalog() {
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const { data, isLoading } = useGetTrendsQuery(selectedTags);
  const activeTags = useMemo(() => new Set(selectedTags), [selectedTags]);

  const toggleTag = (tag: string) => {
    setSelectedTags((current) => (current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]));
  };

  return (
    <section className="container py-14 md:py-20">
      <div className="max-w-3xl">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-indigo-500">Тренды</p>
        <h1 className="mt-3 text-4xl font-bold md:text-6xl">Трендовые форматы — станьте звездой</h1>
        <p className="mt-5 text-lg leading-8 text-muted-foreground">
          Выберите сцену, загрузите фото и получите вертикальный ролик для сторис, поздравления или веселого поста.
        </p>
      </div>

      <div className="mt-8 flex flex-wrap gap-2">
        {trendTags.map((tag) => (
          <button
            key={tag}
            type="button"
            onClick={() => toggleTag(tag)}
            className={cn(
              'cursor-pointer rounded-full border px-3 py-1.5 text-sm transition',
              activeTags.has(tag)
                ? 'border-indigo-500 bg-slate-800 text-indigo-100'
                : 'border-slate-800 bg-slate-900 text-muted-foreground hover:bg-slate-800 hover:text-foreground',
            )}
          >
            #{tag}
          </button>
        ))}
        {selectedTags.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setSelectedTags([])}>
            <X className="h-4 w-4" />
            Сбросить
          </Button>
        )}
      </div>

      <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {isLoading
          ? Array.from({ length: 8 }).map((_, index) => <Skeleton key={index} className="aspect-[9/16] rounded-lg" />)
          : data?.trends.map((trend) => (
              <Link key={trend.id} href={`/trends/${trend.id}`} className="group block">
                <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900 transition-all duration-300 hover:-translate-y-1 hover:border-violet-500/50 hover:shadow-2xl hover:shadow-violet-500/10">
                  <div className="relative aspect-[9/16] bg-slate-900">
                    <Image
                      src={trend.referenceImg ?? trend.previewVideo}
                      alt={trend.title}
                      width={600}
                      height={1067}
                      className="h-full w-full object-cover"
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-slate-950/20 transition group-hover:bg-slate-950/5">
                      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90 text-slate-950 transition group-hover:scale-110">
                        <Play className="h-5 w-5 fill-current" />
                      </span>
                    </div>
                  </div>
                  <div className="space-y-3 p-4">
                    <div>
                      <h2 className="font-semibold">{trend.title}</h2>
                      <p className="mt-1 text-sm text-muted-foreground">{trend.priceTokens} токенов</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {trend.tags.map((tag) => (
                        <Badge key={tag} variant="secondary" className="cursor-pointer bg-slate-800 text-[11px] hover:bg-slate-700">
                          #{tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
      </div>
    </section>
  );
}
