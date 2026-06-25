'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Copy,
  Download,
  Image as ImageIcon,
  Loader2,
  Maximize2,
  RotateCcw,
  Share2,
} from 'lucide-react';
import { getUserFriendlyError, type ProjectStatus } from '@allvision/shared';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { ResultMedia } from '@/components/ui/result-media';
import { useLivelyProgress, useStuckHint } from '@/lib/use-lively-progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { PROJECT_STATUS_COLOR, PROJECT_STATUS_LABEL, formatDateTime } from '@/components/dashboard/labels';
import { GenerationRetentionNotice } from '@/components/generations/GenerationRetentionNotice';
import { DeleteGenerationButton } from '@/components/generations/DeleteGenerationButton';
import { ReportGenerationButton } from '@/components/generations/ReportGenerationButton';
import { SaveToStudioButton } from '@/components/studio/SaveToStudioButton';
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

function russianErrorFromRawMessage(message?: string | null) {
  const raw = message?.toLowerCase() ?? '';
  if (/violat|community guidelines|moderat|nsfw|content policy|policy violation|safety policy|unsafe content/.test(raw)) {
    return getUserFriendlyError('CONTENT_MODERATION');
  }
  if (/10001|upstream.*busy|too many requests|rate limit|try again later|temporar(?:y|ily).*busy|overloaded/.test(raw)) {
    return getUserFriendlyError('PIAPI_UPSTREAM_BUSY');
  }
  if (/queue unavailable|очеред/.test(raw)) return getUserFriendlyError('QUEUE_UNAVAILABLE');
  return null;
}

function projectFailureMessage(errorCode?: string | null, errorMessage?: string | null) {
  if (errorCode) return getUserFriendlyError(errorCode);
  return russianErrorFromRawMessage(errorMessage) ?? getUserFriendlyError(errorCode);
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:4000');
const warningAlertClass = 'border-amber-500 bg-amber-950 text-amber-50 [&>svg]:text-amber-300';

function progressMessage(progress: number): string {
  if (progress < 12) return 'Нейронка раскладывает идею по пикселям...';
  if (progress < 32) return 'Ищем лучший свет и настроение...';
  if (progress < 58) return 'Собираем детали в цельный кадр...';
  if (progress < 82) return 'Полируем результат без лишнего шума...';
  return 'Финальные штрихи, почти готово...';
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

function urlsFromInputs(value: unknown): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.values(value)
    .filter((item): item is string => typeof item === 'string')
    .filter((item) => item.startsWith('/static/') || item.startsWith('http://') || item.startsWith('https://'))
    .filter((item) => !/\.(mp4|webm|mov)(\?|$)/i.test(item))
    .map((item) => mediaUrl(item) ?? item);
}

function tierLabel(value?: string | null) {
  if (value === 'pro') return 'Pro';
  if (value === 'standard') return 'Standard';
  return 'Не выбрано';
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

function ProjectProgressBody({ progress, projectId }: { progress: number; projectId?: string }) {
  // Этот блок рендерится только в активных статусах (PENDING/PROCESSING), поэтому шкала «живая».
  const safeProgress = useLivelyProgress(progress, true, projectId);
  const stuck = useStuckHint(safeProgress, true);
  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-4 text-sm">
        <span className="flex min-w-0 items-center gap-2 font-medium text-slate-100">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-amber-300" />
          <span className="truncate">{progressMessage(safeProgress)}</span>
        </span>
        <span className="shrink-0 text-slate-400">{safeProgress}%</span>
      </div>
      <Progress value={safeProgress} />
      <p className="mt-5 text-sm leading-6 text-slate-400">
        {stuck
          ? 'Серверы сейчас загружены — приносим извинения. Результат почти готов, нужно подождать ещё немного. Страницу можно не закрывать.'
          : 'Можно закрыть страницу: генерация продолжится, а результат появится в проектах автоматически.'}
      </p>
    </>
  );
}

function ProjectProgressPanel({ progress, projectId }: { progress: number; projectId?: string }) {
  return (
    <Card className="border-slate-800 bg-slate-900">
      <CardContent className="p-5">
        <ProjectProgressBody progress={progress} projectId={projectId} />
      </CardContent>
    </Card>
  );
}

export function ProjectPageContent({ id, initialProject }: ProjectPageContentProps) {
  const [lastStatus, setLastStatus] = useState<ProjectStatus | undefined>(initialProject?.status);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const router = useRouter();
  const projectQuery = useGetProjectQuery(id);
  const project = projectQuery.data ?? initialProject;
  const statusForPolling = lastStatus ?? project?.status;
  const statusQuery = useGetProjectStatusQuery(id, {
    pollingInterval: isActiveStatus(statusForPolling) ? 2000 : 0,
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
  const errorCode = live?.errorCode ?? project.errorCode;
  const friendlyError = projectFailureMessage(errorCode, errorMessage);
  const completedAt = live?.completedAt ?? project.completedAt;
  const expiresAt = live?.expiresAt ?? project.expiresAt;
  const inputImage = project.inputImages?.[0];
  const resultUrl = resultImage ?? resultVideo ?? resultThumbnail;
  const retryHref = retryHrefFor(project);
  const isPipelineProject = !!project.pipelineSnapshot;
  const inputUrls = urlsFromInputs(project.userInputs);
  const pipelineInputImages = inputUrls.length > 0
    ? inputUrls
    : project.inputImages.map((value) => mediaUrl(value) ?? value);
  const finalVideoUrl = mediaUrl(resultVideo);
  const finalImageUrl = mediaUrl(resultImage);
  const finalPosterUrl = mediaUrl(resultThumbnail);
  const finalOutputUrl = finalVideoUrl ?? finalImageUrl ?? finalPosterUrl;
  const onDeleted = () => router.push('/dashboard/projects');

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
        <DeleteGenerationButton projectId={project.id} title={project.title} onDeleted={onDeleted} />
      </div>
    );

    if (status === 'FAILED') {
      return (
        <div className="space-y-6">
          {projectHeader}
          <Card className="border-slate-800 bg-slate-900">
            <CardContent className="space-y-5 p-6">
              <Alert className={warningAlertClass}>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Генерация не выполнена</AlertTitle>
                <AlertDescription>
                  <p>{friendlyError}</p>
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
                  <ResultMedia
                    key={finalVideoUrl}
                    type="video"
                    src={finalVideoUrl}
                    poster={finalPosterUrl ?? undefined}
                    videoControls
                    className="max-h-[70vh] w-full bg-black"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsPreviewOpen(true)}
                    className="group relative block w-full"
                  >
                    <ResultMedia
                      key={finalImageUrl ?? finalOutputUrl ?? ''}
                      type="image"
                      src={finalImageUrl ?? finalOutputUrl ?? ''}
                      imgAlt="Готовый результат"
                      className="max-h-[70vh] w-full object-contain"
                    />
                    <span className="absolute right-3 top-3 inline-flex items-center gap-2 rounded-md bg-slate-950/80 px-3 py-2 text-sm text-white opacity-0 transition group-hover:opacity-100">
                      <Maximize2 className="h-4 w-4" />
                      Открыть
                    </span>
                  </button>
                )}
              </div>
            </CardContent>
          </Card>

          <GenerationRetentionNotice expiresAt={expiresAt} />

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
              <SaveToStudioButton projectId={project.id} defaultTitle={project.title} />
              <ReportGenerationButton projectId={project.id} />
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
                  <div className="mt-1 font-semibold text-slate-100">{project.tokensCost} токенов</div>
                </div>
              </div>
              <div>
                <div className="mb-3 text-xs uppercase tracking-wide text-slate-500">Исходные материалы</div>
                <SourceThumbnails images={pipelineInputImages} />
              </div>
            </CardContent>
          </Card>

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
        <ProjectProgressPanel progress={progress} projectId={project.id} />

        <Card className="border-slate-800 bg-slate-900">
          <CardContent className="p-5">
            <div className="mb-4 flex items-center gap-2">
              <ImageIcon className="h-5 w-5 text-amber-400" />
              <h2 className="text-lg font-bold">Исходные материалы</h2>
            </div>
            <SourceThumbnails images={pipelineInputImages} />
          </CardContent>
        </Card>
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
        <DeleteGenerationButton projectId={project.id} title={project.title} onDeleted={onDeleted} />
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
              <ProjectProgressBody progress={progress} projectId={project.id} />
            ) : status === 'COMPLETED' ? (
              <div className="space-y-5">
                <div className="overflow-hidden rounded-lg border border-slate-800 bg-slate-950">
                  {resultImage ? (
                    <ResultMedia key={resultImage} type="image" src={resultImage} imgAlt="Результат улучшения" className="max-h-[520px] w-full object-contain" />
                  ) : resultVideo ? (
                    <ResultMedia key={resultVideo} type="video" src={resultVideo} videoControls className="max-h-[520px] w-full" />
                  ) : (
                    <div className="grid h-64 place-items-center text-slate-500">Результат пока недоступен</div>
                  )}
                </div>
                <GenerationRetentionNotice expiresAt={expiresAt} />
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
                  <SaveToStudioButton projectId={project.id} defaultTitle={project.title} />
                  <ReportGenerationButton projectId={project.id} />
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                <Alert className={warningAlertClass}>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Генерация не выполнена</AlertTitle>
                  <AlertDescription>
                    <p>{friendlyError}</p>
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
