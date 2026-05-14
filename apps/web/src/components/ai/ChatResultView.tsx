'use client';

import { Download, ImageIcon, Loader2, RotateCcw, Sparkles, Video } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { PROJECT_STATUS_COLOR, PROJECT_STATUS_LABEL, formatDateTime } from '@/components/dashboard/labels';
import { SaveToStudioButton } from '@/components/studio/SaveToStudioButton';
import { cn } from '@/lib/utils';
import { useGetProjectQuery, useGetProjectStatusQuery } from '@/store/api/projects-api';

type ChatResultViewProps = {
  projectId?: string | null;
  onUseAsReference: (url: string) => void;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:4000');

function mediaUrl(value?: string | null) {
  if (!value) return null;
  if (value.startsWith('/static/')) return `${API_URL}${value}`;
  return value;
}

function isActive(status?: string) {
  return status === 'PENDING' || status === 'PROCESSING';
}

export function ChatResultView({ projectId, onUseAsReference }: ChatResultViewProps) {
  const projectQuery = useGetProjectQuery(projectId ?? '', { skip: !projectId });
  const project = projectQuery.data;
  const statusQuery = useGetProjectStatusQuery(projectId ?? '', {
    skip: !projectId || !isActive(project?.status),
    pollingInterval: 5000,
  });

  if (!projectId) {
    return (
      <Card className="h-full border-slate-800 bg-slate-900">
        <CardContent className="flex h-full min-h-[420px] flex-col items-center justify-center p-8 text-center">
          <Sparkles className="h-12 w-12 text-violet-300" />
          <h2 className="mt-5 text-2xl font-bold text-white">Allvision AI</h2>
          <p className="mt-3 max-w-lg text-sm leading-6 text-slate-400">
            Выберите фото или видео, модель, напишите промпт и при необходимости прикрепите референс из Студии или библиотеки сайта.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (projectQuery.isLoading && !project) {
    return (
      <Card className="h-full border-slate-800 bg-slate-900">
        <CardContent className="grid min-h-[420px] place-items-center p-8 text-slate-400">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  if (!project) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Чат не найден</AlertTitle>
        <AlertDescription>Возможно, проект был удален или принадлежит другому аккаунту.</AlertDescription>
      </Alert>
    );
  }

  const live = statusQuery.data;
  const status = live?.status ?? project.status;
  const progress = live?.progress ?? project.progress ?? 0;
  const resultImage = mediaUrl(live?.resultImage ?? project.resultImage);
  const resultVideo = mediaUrl(live?.resultVideo ?? project.resultVideo);
  const resultThumbnail = mediaUrl(live?.resultThumbnail ?? project.resultThumbnail);
  const resultUrl = resultVideo ?? resultImage ?? resultThumbnail;
  const failed = status === 'FAILED';
  const processing = isActive(status);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold text-white">{project.title}</h1>
            <Badge className={cn('rounded-md', PROJECT_STATUS_COLOR[status])}>
              {PROJECT_STATUS_LABEL[status]}
            </Badge>
          </div>
          <p className="mt-2 text-sm text-slate-500">
            Создан {formatDateTime(project.createdAt)} · {project.tokensCost} коинов
          </p>
        </div>
      </div>

      <Card className="border-slate-800 bg-slate-900">
        <CardContent className="space-y-3 p-5">
          <div className="text-xs uppercase tracking-wide text-slate-500">Промпт</div>
          <p className="whitespace-pre-wrap text-sm leading-6 text-slate-200">{project.inputText}</p>
        </CardContent>
      </Card>

      {processing && (
        <Card className="border-slate-800 bg-slate-900">
          <CardContent className="p-5">
            <div className="mb-3 flex items-center justify-between text-sm text-slate-300">
              <span>Генерация выполняется</span>
              <span>{progress}%</span>
            </div>
            <Progress value={progress} />
            <p className="mt-4 text-sm text-slate-500">
              Статус обновляется каждые 5 секунд. Можно перейти в другой раздел, проект продолжит выполняться.
            </p>
          </CardContent>
        </Card>
      )}

      {failed && (
        <Alert variant="destructive">
          <AlertTitle>Генерация не удалась</AlertTitle>
          <AlertDescription>
            {live?.errorMessage ?? project.errorMessage ?? 'Коины будут возвращены стандартным механизмом refund.'}
          </AlertDescription>
        </Alert>
      )}

      {!processing && !failed && (
        <Card className="border-slate-800 bg-slate-900">
          <CardContent className="p-4">
            <div className="overflow-hidden rounded-lg border border-slate-800 bg-slate-950">
              {resultVideo ? (
                <video src={resultVideo} poster={resultThumbnail ?? undefined} controls className="max-h-[70vh] w-full bg-black" />
              ) : resultImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={resultImage} alt="Результат Allvision AI" className="max-h-[70vh] w-full object-contain" />
              ) : (
                <div className="grid min-h-[320px] place-items-center text-slate-600">
                  {project.pipelineSnapshot ? <Video className="h-10 w-10" /> : <ImageIcon className="h-10 w-10" />}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {resultUrl && (
        <div className="flex flex-wrap gap-3">
          <Button asChild className="bg-amber-500 text-slate-950 hover:bg-amber-400">
            <a href={resultUrl} download target="_blank" rel="noopener">
              <Download className="h-4 w-4" />
              Скачать
            </a>
          </Button>
          {(resultImage || resultThumbnail) && (
            <Button type="button" variant="outline" className="border-slate-700 bg-slate-900" onClick={() => onUseAsReference(resultImage ?? resultThumbnail!)}>
              <RotateCcw className="h-4 w-4" />
              Использовать как референс
            </Button>
          )}
          {status === 'COMPLETED' && (
            <SaveToStudioButton projectId={project.id} defaultTitle={project.title.replace(/^Чат:\s*/, '')} />
          )}
        </div>
      )}
    </div>
  );
}
