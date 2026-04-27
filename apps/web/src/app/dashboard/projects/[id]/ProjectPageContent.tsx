'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AlertCircle, ArrowLeft, Download, Image as ImageIcon, RotateCcw } from 'lucide-react';
import type { ProjectStatus } from '@allvision/shared';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { PROJECT_STATUS_COLOR, PROJECT_STATUS_LABEL, formatDateTime } from '@/components/dashboard/labels';
import {
  type ProjectDetails,
  useGetProjectQuery,
  useGetProjectStatusQuery,
} from '@/store/api/projects-api';
import { cn } from '@/lib/utils';

type ProjectPageContentProps = {
  id: string;
  initialProject: ProjectDetails | null;
};

function getErrorCode(error: unknown): string | undefined {
  return (error as { data?: { error?: { code?: string } } })?.data?.error?.code;
}

function progressMessage(progress: number): string {
  if (progress < 15) return 'Анализируем фото...';
  if (progress < 50) return 'Восстанавливаем детали...';
  if (progress < 85) return 'Улучшаем качество...';
  return 'Почти готово ✨';
}

function isActiveStatus(status?: ProjectStatus) {
  return status === 'PENDING' || status === 'PROCESSING';
}

export function ProjectPageContent({ id, initialProject }: ProjectPageContentProps) {
  const [lastStatus, setLastStatus] = useState<ProjectStatus | undefined>(initialProject?.status);
  const projectQuery = useGetProjectQuery(id);
  const project = projectQuery.data ?? initialProject;
  const statusForPolling = lastStatus ?? project?.status;
  const statusQuery = useGetProjectStatusQuery(id, {
    pollingInterval: isActiveStatus(statusForPolling) ? 3000 : 0,
    skip: !project,
  });

  useEffect(() => {
    if (project?.status) setLastStatus(project.status);
  }, [project?.status]);

  useEffect(() => {
    if (statusQuery.data?.status) setLastStatus(statusQuery.data.status);
  }, [statusQuery.data?.status]);

  if (projectQuery.isLoading && !project) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-80" />
        <div className="grid gap-6 lg:grid-cols-[1fr_0.9fr]">
          <Skeleton className="h-[420px] rounded-lg" />
          <Skeleton className="h-[420px] rounded-lg" />
        </div>
      </div>
    );
  }

  if (projectQuery.error && getErrorCode(projectQuery.error) === 'PROJECT_NOT_FOUND') {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Проект не найден</AlertTitle>
        <AlertDescription>Возможно, он был удалён или принадлежит другому аккаунту.</AlertDescription>
      </Alert>
    );
  }

  if (!project) return null;

  const live = statusQuery.data;
  const status = live?.status ?? project.status;
  const progress = live?.progress ?? project.progress ?? 0;
  const resultImage = live?.resultImage ?? project.resultImage;
  const resultVideo = live?.resultVideo ?? project.resultVideo;
  const resultThumbnail = live?.resultThumbnail ?? project.resultThumbnail;
  const errorMessage = live?.errorMessage ?? project.errorMessage;
  const completedAt = live?.completedAt ?? project.completedAt;
  const inputImage = project.inputImages?.[0];
  const resultUrl = resultImage ?? resultVideo ?? resultThumbnail;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-3 mb-2 text-slate-400 hover:text-slate-100">
            <Link href="/dashboard/projects">
              <ArrowLeft className="h-4 w-4" />
              К проектам
            </Link>
          </Button>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold">{project.title}</h1>
            <Badge className={cn('rounded-md', PROJECT_STATUS_COLOR[status])}>
              {PROJECT_STATUS_LABEL[status]}
            </Badge>
          </div>
          <p className="mt-2 text-sm text-slate-400">
            {project.service.name} · создан {formatDateTime(project.createdAt)}
            {completedAt ? ` · готов ${formatDateTime(completedAt)}` : ''}
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_0.9fr]">
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="p-4">
            <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-slate-950">
              {inputImage ? (
                <Image
                  src={inputImage}
                  alt="Исходное фото"
                  fill
                  className="object-contain"
                  sizes="(max-width: 1024px) 100vw, 50vw"
                />
              ) : (
                <div className="grid h-full place-items-center text-slate-600">
                  <ImageIcon className="h-12 w-12" />
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="p-5">
            {status === 'PENDING' || status === 'PROCESSING' ? (
              <div className="space-y-5">
                <div>
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="font-medium">{progressMessage(progress)}</span>
                    <span className="text-slate-400">{progress}%</span>
                  </div>
                  <Progress value={progress} />
                </div>
                <p className="text-sm leading-6 text-slate-400">
                  Страница обновляет статус каждые 3 секунды. Можно спокойно перейти в другой раздел кабинета.
                </p>
              </div>
            ) : status === 'COMPLETED' ? (
              <div className="space-y-5">
                <div className="overflow-hidden rounded-lg border border-slate-800 bg-slate-950">
                  {resultImage ? (
                    <img src={resultImage} alt="Результат улучшения" className="max-h-[520px] w-full object-contain" />
                  ) : resultVideo ? (
                    <video src={resultVideo} controls className="max-h-[520px] w-full" />
                  ) : (
                    <div className="grid h-64 place-items-center text-slate-500">Результат пока недоступен</div>
                  )}
                </div>
                <div className="flex flex-col gap-3 sm:flex-row">
                  {resultUrl && (
                    <Button asChild className="bg-amber-500 text-slate-950 hover:bg-amber-400">
                      <a href={resultUrl} download target="_blank" rel="noopener">
                        <Download className="h-4 w-4" />
                        Скачать результат
                      </a>
                    </Button>
                  )}
                  <Button asChild variant="outline">
                    <Link href="/dashboard/projects">К списку проектов</Link>
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Обработка не удалась</AlertTitle>
                  <AlertDescription>
                    <p>{errorMessage ?? 'Произошла ошибка при обработке проекта.'}</p>
                    <p className="mt-2">Токены возвращены на баланс.</p>
                  </AlertDescription>
                </Alert>
                <Button asChild className="bg-amber-500 text-slate-950 hover:bg-amber-400">
                  <Link href="/services/photo-restore">
                    <RotateCcw className="h-4 w-4" />
                    Попробовать снова
                  </Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
