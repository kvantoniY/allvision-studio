'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Camera, Coins, Play, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useGetTrendQuery } from '@/store/api/public-api';
import { TrendUploader } from '@/components/services/TrendUploader';

type TrendDetailProps = {
  id: string;
};

export function TrendDetail({ id }: TrendDetailProps) {
  const { data, isLoading, isError } = useGetTrendQuery(id);
  const trend = data?.trend;

  if (isLoading) {
    return (
      <div className="container py-14">
        <Skeleton className="h-[620px] rounded-lg" />
      </div>
    );
  }

  if (isError || !trend) {
    return (
      <section className="container py-20">
        <div className="max-w-2xl rounded-lg border bg-card p-8 dark:border-slate-800">
          <h1 className="text-3xl font-bold">Тренд не найден</h1>
          <p className="mt-3 text-muted-foreground">Возможно, формат временно скрыт или ссылка устарела.</p>
          <Button asChild className="mt-6">
            <Link href="/trends">Вернуться к трендам</Link>
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section className="container py-14 md:py-20">
      <div className="grid gap-10 lg:grid-cols-[0.85fr_1fr] lg:items-center">
        <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900 p-3 shadow-xl shadow-violet-500/10">
          <div className="relative mx-auto aspect-[9/16] max-h-[720px] overflow-hidden rounded-md bg-slate-900">
            <Image src={trend.referenceImg ?? trend.previewVideo} alt={trend.title} width={600} height={1067} className="h-full w-full object-cover" />
            <div className="pointer-events-none absolute left-4 top-4 rounded-full bg-white/90 px-3 py-1 text-sm font-medium text-slate-950">
              <Play className="mr-1 inline h-4 w-4 fill-current" />
              Preview
            </div>
          </div>
        </div>

        <div>
          <div className="flex flex-wrap gap-2">
            {trend.tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="bg-slate-800 hover:bg-slate-700">
                #{tag}
              </Badge>
            ))}
          </div>
          <h1 className="mt-5 text-4xl font-black leading-none tracking-tight md:text-6xl">{trend.title}</h1>
          <p className="mt-5 text-lg leading-8 text-muted-foreground">{trend.description}</p>
          <div className="mt-7 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
              <Coins className="h-5 w-5 text-amber-500" />
              <div className="mt-3 text-sm text-muted-foreground">Стоимость</div>
              <div className="mt-1 text-2xl font-bold">{trend.priceTokens} токенов</div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
              <Sparkles className="h-5 w-5 text-indigo-500" />
              <div className="mt-3 text-sm text-muted-foreground">Формат</div>
              <div className="mt-1 text-2xl font-bold">9:16 video</div>
            </div>
          </div>
          <div className="mt-7 rounded-xl border border-slate-800 bg-slate-900 p-5">
            <div className="flex items-center gap-2 font-semibold">
              <Camera className="h-5 w-5 text-indigo-500" />
              Сцена
            </div>
            <p className="mt-3 leading-7 text-muted-foreground">{trend.prompt}</p>
          </div>
          <div className="mt-7">
            <TrendUploader trendId={trend.id} tokensCost={trend.priceTokens} />
          </div>
        </div>
      </div>
    </section>
  );
}
