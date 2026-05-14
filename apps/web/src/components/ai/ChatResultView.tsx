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
import type { ChatMessage } from '@/store/api/user-chat-api';

type ChatResultViewProps = {
  messages: ChatMessage[];
  isLoading?: boolean;
  onUseAsReference: (projectId: string, url: string, mediaKind: 'image' | 'video') => void;
  onRetry: (message: ChatMessage) => void;
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

export function ChatResultView({ messages, isLoading, onUseAsReference, onRetry }: ChatResultViewProps) {
  if (isLoading) {
    return (
      <div className="grid min-h-[420px] place-items-center text-slate-400">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <Card className="border-slate-800 bg-slate-900">
        <CardContent className="flex min-h-[420px] flex-col items-center justify-center p-8 text-center">
          <Sparkles className="h-12 w-12 text-violet-300" />
          <h2 className="mt-5 text-2xl font-bold text-white">Allvision AI</h2>
          <p className="mt-3 max-w-lg text-sm leading-6 text-slate-400">
            Новый чат готов. Напишите промпт, выберите модель и при необходимости прикрепите референс.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {messages.map((message) => (
        <MessageCard
          key={message.id}
          message={message}
          onUseAsReference={onUseAsReference}
          onRetry={onRetry}
        />
      ))}
    </div>
  );
}

function MessageCard({
  message,
  onUseAsReference,
  onRetry,
}: {
  message: ChatMessage;
  onUseAsReference: (projectId: string, url: string, mediaKind: 'image' | 'video') => void;
  onRetry: (message: ChatMessage) => void;
}) {
  const project = message.project;
  const status = project.status;
  const progress = project.progress ?? 0;
  const resultImage = mediaUrl(project.resultImage);
  const resultVideo = mediaUrl(project.resultVideo);
  const resultThumbnail = mediaUrl(project.resultThumbnail);
  const resultUrl = resultVideo ?? resultImage ?? resultThumbnail;
  const failed = status === 'FAILED';
  const processing = isActive(status);

  return (
    <Card className="border-slate-800 bg-slate-900">
      <CardContent className="space-y-4 p-4 md:p-5">
        <div className="space-y-3 border-b border-slate-800 pb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={cn('rounded-md', PROJECT_STATUS_COLOR[status])}>
                {PROJECT_STATUS_LABEL[status]}
              </Badge>
              <Badge variant="outline" className="border-slate-700 text-slate-300">{message.modelSlug}</Badge>
              {message.aspectRatio && <Badge variant="outline" className="border-slate-700 text-slate-300">{message.aspectRatio}</Badge>}
              {message.inputRef && <Badge variant="outline" className="border-violet-500/50 text-violet-200">референс</Badge>}
            </div>
            <div className="text-xs text-slate-500">{formatDateTime(message.createdAt)}</div>
          </div>
          <p className="whitespace-pre-wrap text-sm leading-6 text-slate-200">{message.prompt}</p>
        </div>

        {processing && (
          <div>
            <div className="mb-3 flex items-center justify-between text-sm text-slate-300">
              <span>Генерация выполняется</span>
              <span>{progress}%</span>
            </div>
            <Progress value={progress} />
          </div>
        )}

        {failed && (
          <Alert variant="destructive">
            <AlertTitle>Генерация не удалась</AlertTitle>
            <AlertDescription>
              {project.errorMessage ?? 'Коины будут возвращены стандартным механизмом refund.'}
            </AlertDescription>
          </Alert>
        )}

        {!processing && !failed && (
          <div className="overflow-hidden rounded-lg border border-slate-800 bg-slate-950">
            {resultVideo ? (
              <video src={resultVideo} poster={resultThumbnail ?? undefined} controls className="max-h-[70vh] w-full bg-black" />
            ) : resultImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={resultImage} alt="Результат Allvision AI" className="max-h-[70vh] w-full object-contain" />
            ) : (
              <div className="grid min-h-[260px] place-items-center text-slate-600">
                {project.category === 'video' ? <Video className="h-10 w-10" /> : <ImageIcon className="h-10 w-10" />}
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          {resultUrl && (
            <Button asChild className="bg-amber-500 text-slate-950 hover:bg-amber-400">
              <a href={resultUrl} download target="_blank" rel="noopener">
                <Download className="h-4 w-4" />
                Скачать
              </a>
            </Button>
          )}
          {(resultImage || resultThumbnail) && (
            <Button
              type="button"
              variant="outline"
              className="border-slate-700 bg-slate-900"
              onClick={() => onUseAsReference(project.id, resultImage ?? resultThumbnail!, 'image')}
            >
              <RotateCcw className="h-4 w-4" />
              Использовать как референс
            </Button>
          )}
          {resultVideo && (
            <Button
              type="button"
              variant="outline"
              className="border-slate-700 bg-slate-900"
              onClick={() => onUseAsReference(project.id, resultVideo, 'video')}
            >
              <RotateCcw className="h-4 w-4" />
              Использовать как референс
            </Button>
          )}
          {status === 'COMPLETED' && (
            <SaveToStudioButton projectId={project.id} defaultTitle={project.title.replace(/^Чат:\s*/, '')} />
          )}
          {failed && (
            <Button type="button" variant="outline" className="border-slate-700 bg-slate-900" onClick={() => onRetry(message)}>
              Попробовать снова
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
