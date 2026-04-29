'use client';

/* eslint-disable @next/next/no-img-element */

import Link from 'next/link';
import { useState } from 'react';
import { ArrowRight, Film, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import { useListEpisodesQuery } from '@/store/api/episodes-api';
import { cn } from '@/lib/utils';

const statusLabel: Record<string, string> = {
  PENDING: 'В очереди',
  PROCESSING_IMAGE: 'Кадр',
  PROCESSING_VIDEO: 'Видео',
  COMPLETED: 'Готов',
  FAILED: 'Ошибка',
};

const statusClass: Record<string, string> = {
  PENDING: 'bg-slate-700 text-white',
  PROCESSING_IMAGE: 'bg-sky-600 text-white',
  PROCESSING_VIDEO: 'bg-violet-600 text-white',
  COMPLETED: 'bg-emerald-600 text-white',
  FAILED: 'bg-red-600 text-white',
};

export default function EpisodesPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useListEpisodesQuery({ page, limit: 12 });
  const items = data?.items ?? [];
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Мои эпизоды</h1>
          <p className="mt-1 text-slate-400">Истории с вашими персонажами и сценами.</p>
        </div>
        <Button asChild>
          <Link href="/dashboard/episodes/new">
            <Plus className="h-4 w-4" />
            Создать эпизод
          </Link>
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-80 rounded-lg" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Card className="border-slate-800 bg-slate-900">
          <CardContent>
            <EmptyState
              size="lg"
              icon={<Film className="h-full w-full" />}
              title="Эпизоды появятся здесь"
              description="Выберите сценарий, добавьте готовых персонажей и сцену, затем запустите генерацию."
              actions={[{ label: 'Выбрать сценарий', href: '/scenarios' }]}
            />
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {items.map((episode) => {
              const image = episode.resultThumbnail ?? episode.resultImage ?? null;
              const fallback = episode.template ? `https://picsum.photos/seed/${episode.template.slug}/800/600` : null;
              return (
                <Link key={episode.id} href={`/dashboard/episodes/${episode.id}`} className="group block">
                  <Card className="h-full overflow-hidden border-slate-800 bg-slate-900 transition hover:-translate-y-0.5 hover:border-violet-500/60">
                    <div className="relative aspect-video bg-slate-950">
                      {image || fallback ? (
                        <img src={image ?? fallback ?? undefined} alt="" className="h-full w-full object-cover transition group-hover:scale-105" />
                      ) : (
                        <div className="grid h-full place-items-center text-slate-600">
                          <Film className="h-10 w-10" />
                        </div>
                      )}
                      <Badge className={cn('absolute left-3 top-3', statusClass[episode.status])}>
                        {statusLabel[episode.status]}
                      </Badge>
                    </div>
                    <CardContent className="space-y-3 p-4">
                      <div>
                        <h2 className="font-semibold text-white">{episode.title}</h2>
                        <p className="mt-1 text-sm text-slate-400">{episode.template?.title ?? 'Сценарий удалён'}</p>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-400">{episode.durationSeconds} сек</span>
                        <span className="inline-flex items-center gap-1 text-violet-300">
                          Открыть
                          <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3">
              <Button variant="outline" disabled={page === 1} onClick={() => setPage((current) => current - 1)}>
                Назад
              </Button>
              <span className="text-sm text-slate-400">
                {page} / {totalPages}
              </span>
              <Button variant="outline" disabled={page === totalPages} onClick={() => setPage((current) => current + 1)}>
                Далее
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
