'use client';

/* eslint-disable @next/next/no-img-element */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowLeft, Download, Loader2, RefreshCw, ShieldOff, Trash2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { EpisodeVideoPlayer } from '@/components/episodes/EpisodeVideoPlayer';
import { toast } from '@/hooks/use-toast';
import {
  type EpisodeWithRelations,
  useDeleteEpisodeMutation,
  useGetEpisodeQuery,
  useGetEpisodeStatusQuery,
  useRegenerateEpisodeMutation,
  useRemoveEpisodeWatermarkMutation,
} from '@/store/api/episodes-api';
import { cn } from '@/lib/utils';

type PageProps = {
  params: { id: string };
};

const statusLabel: Record<string, string> = {
  PENDING: 'В очереди',
  PROCESSING_IMAGE: 'Создаём кадр',
  PROCESSING_VIDEO: 'Анимируем',
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

function processingMessage(status: string) {
  if (status === 'PROCESSING_IMAGE') return 'Создаём кадр с вашими героями в сцене...';
  if (status === 'PROCESSING_VIDEO') return 'Анимируем эпизод...';
  return 'Готовим генерацию...';
}

export default function EpisodeDetailPage({ params }: PageProps) {
  const router = useRouter();
  const { data, isLoading, refetch } = useGetEpisodeQuery(params.id);
  const baseEpisode = data?.episode;
  const [removeWatermark, removeState] = useRemoveEpisodeWatermarkMutation();
  const [regenerate, regenerateState] = useRegenerateEpisodeMutation();
  const [deleteEpisode, deleteState] = useDeleteEpisodeMutation();
  const [confirm, setConfirm] = useState<'watermark' | 'regenerate' | 'delete' | null>(null);

  const currentStatus = baseEpisode?.status ?? 'PENDING';
  const isProcessing = ['PENDING', 'PROCESSING_IMAGE', 'PROCESSING_VIDEO'].includes(currentStatus);
  const { data: statusData } = useGetEpisodeStatusQuery(params.id, {
    pollingInterval: isProcessing ? 3000 : 0,
    skip: !baseEpisode,
  });

  useEffect(() => {
    if (!statusData || !baseEpisode) return;
    if (statusData.status !== baseEpisode.status || statusData.progress !== baseEpisode.progress) {
      refetch();
    }
  }, [baseEpisode, refetch, statusData]);

  const episode = useMemo(() => {
    if (!baseEpisode || !statusData) return baseEpisode;
    return { ...baseEpisode, ...statusData };
  }, [baseEpisode, statusData]);

  const runWatermarkRemoval = async () => {
    if (!episode) return;
    try {
      await removeWatermark(episode.id).unwrap();
      setConfirm(null);
      toast({ title: 'Водяной знак убран' });
      refetch();
    } catch {
      toast({ title: 'Не удалось убрать водяной знак', variant: 'destructive' });
    }
  };

  const runRegenerate = async () => {
    if (!episode) return;
    try {
      await regenerate(episode.id).unwrap();
      setConfirm(null);
      toast({ title: 'Перегенерация запущена' });
      refetch();
    } catch {
      toast({ title: 'Не удалось запустить перегенерацию', variant: 'destructive' });
    }
  };

  const runDelete = async () => {
    if (!episode) return;
    try {
      await deleteEpisode(episode.id).unwrap();
      setConfirm(null);
      toast({ title: 'Эпизод удалён' });
      router.push('/dashboard/episodes');
    } catch {
      toast({ title: 'Не удалось удалить эпизод', variant: 'destructive' });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-[520px] rounded-lg" />
      </div>
    );
  }

  if (!episode) {
    return (
      <div className="space-y-4">
        <Button asChild variant="ghost" size="sm">
          <Link href="/dashboard/episodes">
            <ArrowLeft className="h-4 w-4" />
            К эпизодам
          </Link>
        </Button>
        <Card className="border-slate-800 bg-slate-900">
          <CardContent className="p-8 text-center text-slate-400">Эпизод не найден.</CardContent>
        </Card>
      </div>
    );
  }

  const terminal = episode.status === 'COMPLETED' || episode.status === 'FAILED';

  return (
    <>
      <div className="space-y-6">
        <Button asChild variant="ghost" size="sm">
          <Link href="/dashboard/episodes">
            <ArrowLeft className="h-4 w-4" />
            К эпизодам
          </Link>
        </Button>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">{episode.title}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge className={cn(statusClass[episode.status])}>{statusLabel[episode.status]}</Badge>
              <span className="text-sm text-slate-400">{episode.template?.title ?? 'Сценарий удалён'}</span>
            </div>
          </div>
          {terminal && (
            <Button type="button" variant="destructive" onClick={() => setConfirm('delete')}>
              <Trash2 className="h-4 w-4" />
              Удалить
            </Button>
          )}
        </div>

        {isProcessing && (
          <Card className="border-slate-800 bg-slate-900">
            <CardContent className="space-y-5 p-6">
              <div className="flex items-center gap-3">
                <Loader2 className="h-5 w-5 animate-spin text-violet-300" />
                <div>
                  <h2 className="font-semibold">{processingMessage(episode.status)}</h2>
                  <p className="text-sm text-slate-400">Страница обновляется автоматически каждые несколько секунд.</p>
                </div>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-violet-500 transition-all"
                  style={{ width: `${Math.max(3, Math.min(100, episode.progress))}%` }}
                />
              </div>
              <div className="text-sm text-slate-400">{episode.progress}%</div>
            </CardContent>
          </Card>
        )}

        {episode.status === 'COMPLETED' && (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
            <div className="space-y-4">
              <EpisodeVideoPlayer
                src={episode.resultVideo}
                poster={episode.resultThumbnail ?? episode.resultImage}
                watermarkRemoved={episode.watermarkRemoved}
              />
              <div className="flex flex-wrap gap-3">
                <Button asChild variant="outline">
                  <a href={episode.resultVideo ?? '#'} download>
                    <Download className="h-4 w-4" />
                    Скачать
                  </a>
                </Button>
                {!episode.watermarkRemoved && (
                  <Button type="button" variant="outline" onClick={() => setConfirm('watermark')}>
                    <ShieldOff className="h-4 w-4" />
                    Убрать водяной знак за 60 токенов
                  </Button>
                )}
                <Button type="button" variant="outline" onClick={() => setConfirm('regenerate')}>
                  <RefreshCw className="h-4 w-4" />
                  Перегенерировать за 30 токенов
                </Button>
              </div>
            </div>

            <EpisodeMeta episode={episode} />
          </div>
        )}

        {episode.status === 'FAILED' && (
          <Alert variant="destructive" className="border-red-500/40 bg-red-500/10">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Генерация не удалась</AlertTitle>
            <AlertDescription>
              {episode.errorMessage ?? 'Попробуйте запустить генерацию ещё раз.'} Токены {episode.tokensCost} возвращены.
              <div className="mt-4">
                <Button type="button" onClick={() => setConfirm('regenerate')}>
                  Перегенерировать за 30 токенов
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}
      </div>

      <ConfirmDialog
        open={confirm === 'watermark'}
        onOpenChange={(open) => setConfirm(open ? 'watermark' : null)}
        title="Убрать водяной знак?"
        description="С баланса будет списано 60 токенов, а overlay исчезнет в плеере Allvision Studio."
        confirmText="Убрать за 60"
        busy={removeState.isLoading}
        onConfirm={runWatermarkRemoval}
      />
      <ConfirmDialog
        open={confirm === 'regenerate'}
        onOpenChange={(open) => setConfirm(open ? 'regenerate' : null)}
        title="Перегенерировать эпизод?"
        description="С баланса будет списано 30 токенов. Новый рендер снова появится с водяным знаком."
        confirmText="Перегенерировать"
        busy={regenerateState.isLoading}
        onConfirm={runRegenerate}
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        onOpenChange={(open) => setConfirm(open ? 'delete' : null)}
        title="Удалить эпизод?"
        description="Эпизод и его результат будут удалены без восстановления."
        busy={deleteState.isLoading}
        onConfirm={runDelete}
      />
    </>
  );
}

function EpisodeMeta({ episode }: { episode: EpisodeWithRelations }) {
  return (
    <aside className="space-y-4 rounded-lg border border-slate-800 bg-slate-900 p-5">
      <div>
        <div className="text-sm text-slate-400">Сценарий</div>
        <div className="mt-1 font-semibold">{episode.template?.title ?? 'Сценарий удалён'}</div>
      </div>
      <div>
        <div className="text-sm text-slate-400">Длительность</div>
        <div className="mt-1 font-semibold">{episode.durationSeconds} сек</div>
      </div>
      <div>
        <div className="text-sm text-slate-400">Стиль</div>
        <div className="mt-1 font-semibold">{episode.style ?? 'cinematic'}</div>
      </div>
      {episode.scene && (
        <div>
          <div className="text-sm text-slate-400">Сцена</div>
          <div className="mt-1 font-semibold">{episode.scene.name}</div>
          <p className="mt-1 text-sm text-slate-500">{episode.scene.description}</p>
        </div>
      )}
      <div>
        <div className="text-sm text-slate-400">Персонажи</div>
        <div className="mt-3 grid gap-3">
          {episode.characters.map(({ character, role }) => {
            const image = character.referenceImages[character.primaryImageId] ?? character.referenceImages[0];
            return (
              <div key={character.id} className="flex items-center gap-3 rounded-md bg-slate-950 p-2">
                {image && <img src={image} alt="" className="h-12 w-12 rounded object-cover" />}
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{character.name}</div>
                  <div className="text-xs text-slate-500">{role ?? 'main'}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
