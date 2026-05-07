'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Copy,
  Download,
  Image as ImageIcon,
  ListChecks,
  Maximize2,
  RotateCcw,
  Share2,
} from 'lucide-react';
import type { ProjectStatus } from '@allvision/shared';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
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

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

type StepProgressItem = {
  stepId: string;
  blockSlug: string;
  status: string;
  progress: number;
  output?: unknown;
  errorMessage?: string;
};

function progressMessage(progress: number): string {
  if (progress < 15) return 'Анализируем фото...';
  if (progress < 50) return 'Восстанавливаем детали...';
  if (progress < 85) return 'Улучшаем качество...';
  return 'Почти готово...';
}

function isActiveStatus(status?: ProjectStatus) {
  return status === 'PENDING' || status === 'PROCESSING';
}

function retryHrefFor(project: ProjectDetails) {
  if (!project.service) return '/services';
  if (project.service.slug === 'photo-animate') return '/services/photo-animate';
  if (project.service.slug === 'trends') return project.trendId ? `/trends/${project.trendId}` : '/trends';
  if (project.pipelineSnapshot) return `/services/${project.service.slug}`;
  return '/services/photo-restore';
}

function mediaUrl(value?: string | null) {
  if (!value) return null;
  if (value.startsWith('/static/')) return `${API_URL}${value}`;
  return value;
}

function parseStepProgress(value: unknown): StepProgressItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object' && !Array.isArray(item))
    .map((item) => ({
      stepId: typeof item.stepId === 'string' ? item.stepId : '',
      blockSlug: typeof item.blockSlug === 'string' ? item.blockSlug : '',
      status: typeof item.status === 'string' ? item.status : 'pending',
      progress: typeof item.progress === 'number' ? item.progress : 0,
      output: item.output,
      errorMessage: typeof item.errorMessage === 'string' ? item.errorMessage : undefined,
    }))
    .filter((item) => item.stepId && item.blockSlug);
}

function urlsFromInputs(value: unknown): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.values(value)
    .filter((item): item is string => typeof item === 'string')
    .filter((item) => item.startsWith('/static/') || item.startsWith('http://') || item.startsWith('https://'))
    .filter((item) => !/\.(mp4|webm|mov)(\?|$)/i.test(item))
    .map((item) => mediaUrl(item) ?? item);
}

function outputUrl(output: unknown): string | null {
  if (typeof output === 'string') return mediaUrl(output);
  if (!output || typeof output !== 'object' || Array.isArray(output)) return null;
  const raw = output as Record<string, unknown>;
  for (const key of ['url', 'resultVideo', 'resultImage', 'resultThumbnail', 'videoUrl', 'imageUrl']) {
    const value = raw[key];
    if (typeof value === 'string') return mediaUrl(value);
  }
  return null;
}

function outputMetadata(output: unknown): Record<string, unknown> {
  if (!output || typeof output !== 'object' || Array.isArray(output)) return {};
  const metadata = (output as Record<string, unknown>).metadata;
  return metadata && typeof metadata === 'object' && !Array.isArray(metadata)
    ? metadata as Record<string, unknown>
    : {};
}

function isVideoUrl(url: string) {
  return /\.(mp4|webm|mov)(\?|$)/i.test(url);
}

function stepLabel(slug: string) {
  const labels: Record<string, string> = {
    'image-restore': 'Восстановление фото',
    'image-upscale': 'Увеличение разрешения',
    'image-to-video': 'Анимация фото',
    'face-swap-video': 'Свап лица',
    'video-compose': 'Финальная сборка',
    'text-to-video': 'Видео по промпту',
  };
  return labels[slug] ?? slug;
}

function stepStatusLabel(status: string) {
  const labels: Record<string, string> = {
    queued: 'В очереди',
    pending: 'В очереди',
    processing: 'В работе',
    completed: 'Готово',
    failed: 'Ошибка',
  };
  return labels[status] ?? status;
}

function stepStatusClass(status: string) {
  return cn(
    'bg-slate-800',
    (status === 'queued' || status === 'pending') && 'text-slate-300',
    status === 'completed' && 'bg-emerald-500/15 text-emerald-200',
    status === 'processing' && 'bg-amber-500/15 text-amber-200',
    status === 'failed' && 'bg-destructive/15 text-destructive',
  );
}

function tierLabel(value?: string | null) {
  if (value === 'pro') return 'Pro';
  if (value === 'standard') return 'Standard';
  return 'Не выбрано';
}

function stringifyOutput(output: unknown) {
  try {
    return JSON.stringify(output, null, 2);
  } catch {
    return String(output);
  }
}

function StepProgressList({ steps, showOutputs = false }: { steps: StepProgressItem[]; showOutputs?: boolean }) {
  return (
    <div className="space-y-3">
      {steps.map((step, index) => {
        const url = outputUrl(step.output);
        const metadata = outputMetadata(step.output);
        const costUsd = typeof metadata.providerCostUsd === 'number' ? metadata.providerCostUsd : undefined;
        const piapiTaskId = typeof metadata.piapiTaskId === 'string' ? metadata.piapiTaskId : undefined;
        return (
          <div key={step.stepId} className="rounded-lg border border-slate-800 bg-slate-950 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-100">
                  Шаг {index + 1}: {stepLabel(step.blockSlug)}
                </div>
                <div className="mt-1 text-xs text-slate-500">{step.blockSlug}</div>
              </div>
              <Badge variant="secondary" className={stepStatusClass(step.status)}>
                {stepStatusLabel(step.status)}
              </Badge>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <Progress value={step.progress} />
              <span className="w-10 text-right text-xs text-slate-500">{step.progress}%</span>
            </div>
            {showOutputs && url && (
              <div className="mt-3 overflow-hidden rounded-md border border-slate-800 bg-slate-900">
                {isVideoUrl(url) ? (
                  <video src={url} controls className="max-h-56 w-full" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={url} alt={`Результат шага ${index + 1}`} className="max-h-56 w-full object-contain" />
                )}
              </div>
            )}
            {showOutputs && (costUsd !== undefined || piapiTaskId) && (
              <div className="mt-3 grid gap-2 rounded-md border border-slate-800 bg-slate-900 p-3 text-xs text-slate-400 sm:grid-cols-2">
                {costUsd !== undefined && (
                  <div>
                    <span className="text-slate-500">costUsd:</span> ${costUsd.toFixed(4)}
                  </div>
                )}
                {piapiTaskId && (
                  <div className="break-all">
                    <span className="text-slate-500">piapiTaskId:</span> {piapiTaskId}
                  </div>
                )}
              </div>
            )}
            {showOutputs && step.output !== undefined && (
              <pre className="mt-3 max-h-48 overflow-auto rounded-md bg-slate-900 p-3 text-xs leading-5 text-slate-400">
                {stringifyOutput(step.output)}
              </pre>
            )}
            {step.errorMessage && (
              <p className="mt-3 text-sm text-destructive">{step.errorMessage}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SourceThumbnails({ images }: { images: string[] }) {
  if (images.length === 0) {
    return <div className="text-sm text-slate-500">Исходные материалы не найдены</div>;
  }

  return (
    <div className="flex flex-wrap gap-3">
      {images.map((image, index) => (
        <div key={`${image}-${index}`} className="relative h-20 w-20 overflow-hidden rounded-md border border-slate-800 bg-slate-950">
          <Image
            src={image}
            alt={`Исходный файл ${index + 1}`}
            fill
            className="object-cover"
            sizes="80px"
          />
        </div>
      ))}
    </div>
  );
}

export function ProjectPageContent({ id, initialProject }: ProjectPageContentProps) {
  const [lastStatus, setLastStatus] = useState<ProjectStatus | undefined>(initialProject?.status);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
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
  const retryHref = retryHrefFor(project);
  const isPipelineProject = !!project.pipelineSnapshot;
  const pipelineSteps = live?.stepProgress ?? parseStepProgress(project.stepProgress);
  const inputUrls = urlsFromInputs(project.userInputs);
  const pipelineInputImages = inputUrls.length > 0
    ? inputUrls
    : project.inputImages.map((value) => mediaUrl(value) ?? value);
  const finalVideoUrl = mediaUrl(resultVideo);
  const finalImageUrl = mediaUrl(resultImage);
  const finalPosterUrl = mediaUrl(resultThumbnail);
  const finalOutputUrl = finalVideoUrl ?? finalImageUrl ?? finalPosterUrl;

  if (isPipelineProject) {
    const projectHeader = (
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
            {project.service?.title ?? 'Услуга удалена'} · создан {formatDateTime(project.createdAt)}
            {completedAt ? ` · готов ${formatDateTime(completedAt)}` : ''}
          </p>
        </div>
      </div>
    );

    if (status === 'FAILED') {
      return (
        <div className="space-y-6">
          {projectHeader}
          <Card className="border-slate-800 bg-slate-900">
            <CardContent className="space-y-5 p-6">
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Не удалось создать подарок</AlertTitle>
                <AlertDescription>
                  <p>{errorMessage ?? 'Произошла ошибка при генерации проекта.'}</p>
                  <p className="mt-2">Коины возвращены на баланс.</p>
                </AlertDescription>
              </Alert>
              <Button asChild className="bg-amber-500 text-slate-950 hover:bg-amber-400">
                <Link href={retryHref}>
                  <RotateCcw className="h-4 w-4" />
                  Попробовать снова
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      );
    }

    if (status === 'COMPLETED' && finalOutputUrl) {
      return (
        <div className="space-y-6">
          {projectHeader}

          <Card className="border-slate-800 bg-slate-900">
            <CardContent className="p-4">
              <div className="overflow-hidden rounded-lg border border-slate-800 bg-slate-950">
                {finalVideoUrl ? (
                  <video
                    src={finalVideoUrl}
                    poster={finalPosterUrl ?? undefined}
                    controls
                    className="max-h-[70vh] w-full bg-black"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsPreviewOpen(true)}
                    className="group relative block w-full"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={finalImageUrl ?? finalOutputUrl} alt="Готовый результат" className="max-h-[70vh] w-full object-contain" />
                    <span className="absolute right-3 top-3 inline-flex items-center gap-2 rounded-md bg-slate-950/80 px-3 py-2 text-sm text-white opacity-0 transition group-hover:opacity-100">
                      <Maximize2 className="h-4 w-4" />
                      Открыть
                    </span>
                  </button>
                )}
              </div>
            </CardContent>
          </Card>

          <TooltipProvider>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button asChild className="bg-amber-500 text-slate-950 hover:bg-amber-400">
                <a href={finalOutputUrl} download target="_blank" rel="noopener">
                  <Download className="h-4 w-4" />
                  Скачать
                </a>
              </Button>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button asChild variant="outline" className="border-slate-700 bg-slate-900">
                    <Link href={retryHref}>
                      <RotateCcw className="h-4 w-4" />
                      Сгенерировать ещё раз
                    </Link>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Перегенерация — скоро</TooltipContent>
              </Tooltip>
              <Button type="button" variant="outline" className="border-slate-700 bg-slate-900" onClick={() => setIsShareOpen(true)}>
                <Share2 className="h-4 w-4" />
                Поделиться
              </Button>
            </div>
          </TooltipProvider>

          <Card className="border-slate-800 bg-slate-900">
            <CardContent className="grid gap-6 p-5 lg:grid-cols-[0.8fr_1.2fr]">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-500">Услуга</div>
                  <div className="mt-1 font-semibold text-slate-100">{project.service?.title ?? project.title}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-500">Качество</div>
                  <div className="mt-1 font-semibold text-slate-100">{tierLabel(project.selectedTier)}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-500">Создан</div>
                  <div className="mt-1 font-semibold text-slate-100">{formatDateTime(project.createdAt)}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-500">Стоимость</div>
                  <div className="mt-1 font-semibold text-slate-100">{project.tokensCost} коинов</div>
                </div>
              </div>
              <div>
                <div className="mb-3 text-xs uppercase tracking-wide text-slate-500">Исходные материалы</div>
                <SourceThumbnails images={pipelineInputImages} />
              </div>
            </CardContent>
          </Card>

          <details className="rounded-lg border border-slate-800 bg-slate-900 p-5">
            <summary className="cursor-pointer text-lg font-bold text-slate-100">Детали генерации</summary>
            <div className="mt-5">
              <StepProgressList steps={pipelineSteps} showOutputs />
            </div>
          </details>

          {isShareOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
              <div className="w-full max-w-lg rounded-lg border border-slate-800 bg-slate-900 p-5 shadow-2xl">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-bold">Ссылка на результат</h2>
                    <p className="mt-2 text-sm leading-6 text-slate-400">
                      Это временный share-макет. Настройки приватности появятся позже.
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setIsShareOpen(false)}>
                    Закрыть
                  </Button>
                </div>
                <div className="mt-5 break-all rounded-md border border-slate-800 bg-slate-950 p-3 text-sm text-slate-300">
                  {finalOutputUrl}
                </div>
                <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                  <Button
                    type="button"
                    className="bg-amber-500 text-slate-950 hover:bg-amber-400"
                    onClick={() => void navigator.clipboard?.writeText(finalOutputUrl)}
                  >
                    <Copy className="h-4 w-4" />
                    Скопировать
                  </Button>
                  <Button asChild variant="outline" className="border-slate-700 bg-slate-950">
                    <a href={finalOutputUrl} target="_blank" rel="noopener">Открыть файл</a>
                  </Button>
                </div>
              </div>
            </div>
          )}

          {isPreviewOpen && finalImageUrl && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
              <div className="w-full max-w-6xl">
                <div className="mb-3 flex justify-end">
                  <Button variant="outline" className="border-slate-700 bg-slate-900" onClick={() => setIsPreviewOpen(false)}>
                    Закрыть
                  </Button>
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={finalImageUrl} alt="Готовый результат" className="mx-auto max-h-[86vh] rounded-lg object-contain" />
              </div>
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="space-y-6">
        {projectHeader}
        <Card className="border-slate-800 bg-slate-900">
          <CardContent className="p-5">
            <div className="mb-5 flex items-center justify-between text-sm">
              <span className="font-medium">Генерация подарка</span>
              <span className="text-slate-400">{progress}%</span>
            </div>
            <Progress value={progress} />
            <p className="mt-5 text-sm leading-6 text-slate-400">
              Это занимает обычно 3–15 минут, можно закрыть страницу — вернётесь позже, статус сохранится.
            </p>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-[0.75fr_1fr]">
          <Card className="border-slate-800 bg-slate-900">
            <CardContent className="p-5">
              <div className="mb-4 flex items-center gap-2">
                <ImageIcon className="h-5 w-5 text-amber-400" />
                <h2 className="text-lg font-bold">Исходные материалы</h2>
              </div>
              <SourceThumbnails images={pipelineInputImages} />
            </CardContent>
          </Card>
          <Card className="border-slate-800 bg-slate-900">
            <CardContent className="p-5">
              <div className="mb-5 flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <ListChecks className="h-5 w-5 text-amber-400" />
                  <h2 className="text-lg font-bold">Шаги обработки</h2>
                </div>
                <span className="text-sm text-slate-400">{progress}%</span>
              </div>
              <StepProgressList steps={pipelineSteps} />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

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
            {project.service?.title ?? 'Услуга удалена'} · создан {formatDateTime(project.createdAt)}
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
                    // eslint-disable-next-line @next/next/no-img-element
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
                    <p className="mt-2">Коины возвращены на баланс.</p>
                  </AlertDescription>
                </Alert>
                <Button asChild className="bg-amber-500 text-slate-950 hover:bg-amber-400">
                  <Link href={retryHref}>
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
