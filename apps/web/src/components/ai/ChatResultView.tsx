'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Download, ImageIcon, Loader2, Maximize2, RotateCcw, Sparkles, Video, Volume2, X } from 'lucide-react';
import { getUserFriendlyError } from '@allvision/shared';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ResultMedia } from '@/components/ui/result-media';
import { GenerationLoader } from '@/components/ui/generation-loader';
import { isAudioUrl } from '@/lib/media-kind';
import { useLivelyProgress, useStuckHint } from '@/lib/use-lively-progress';
import { PROJECT_STATUS_COLOR, PROJECT_STATUS_LABEL, formatDateTime } from '@/components/dashboard/labels';
import { DeleteGenerationButton } from '@/components/generations/DeleteGenerationButton';
import { GenerationRetentionNotice } from '@/components/generations/GenerationRetentionNotice';
import { ReportGenerationButton } from '@/components/generations/ReportGenerationButton';
import { SaveToStudioButton } from '@/components/studio/SaveToStudioButton';
import { ReferenceLightbox, type ReferenceLightboxItem } from '@/components/ai/ReferenceLightbox';
import { cn } from '@/lib/utils';
import type { ChatMessage, ChatReference } from '@/store/api/user-chat-api';

type ChatResultViewProps = {
  messages: ChatMessage[];
  isLoading?: boolean;
  onUseAsReference: (projectId: string, url: string, mediaKind: 'image' | 'video') => void;
  onReuseReference?: (url: string, mediaKind: 'image' | 'video') => void;
  onRetry: (message: ChatMessage) => void;
  onDeleted?: () => void;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:4000');
const warningAlertClass = 'border-amber-500 bg-amber-950 text-amber-50 [&>svg]:text-amber-300';

function mediaUrl(value?: string | null) {
  if (!value) return null;
  if (value.startsWith('/static/')) return `${API_URL}${value}`;
  return value;
}

function isActive(status?: string) {
  return status === 'PENDING' || status === 'PROCESSING';
}

function hasGeneratedAudio(userInputs: unknown) {
  if (!userInputs || typeof userInputs !== 'object' || Array.isArray(userInputs)) return false;
  const meta = (userInputs as Record<string, unknown>).chatGeneration;
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return false;
  return (meta as Record<string, unknown>).generateAudio === true;
}

function creativeProgressMessage(progress: number) {
  if (progress < 12) return 'Нейронка раскладывает идею по пикселям...';
  if (progress < 32) return 'Ищем лучший свет и настроение...';
  if (progress < 58) return 'Собираем детали в цельный кадр...';
  if (progress < 82) return 'Полируем результат без лишнего шума...';
  return 'Финальные штрихи, почти готово...';
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

function chatFailureMessage(errorCode?: string | null, errorMessage?: string | null) {
  if (errorCode) return getUserFriendlyError(errorCode);
  return russianErrorFromRawMessage(errorMessage) ?? getUserFriendlyError(errorCode);
}

export function ChatResultView({ messages, isLoading, onUseAsReference, onReuseReference, onRetry, onDeleted }: ChatResultViewProps) {
  if (isLoading) {
    return (
      <div className="grid min-h-[420px] place-items-center text-slate-400">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex h-full min-h-[320px] items-center justify-center">
        <div className="max-w-md text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-lg border border-violet-500/30 bg-violet-500/10">
            <Sparkles className="h-7 w-7 text-violet-300" />
          </div>
          <h2 className="mt-5 text-2xl font-bold text-white">Allvision AI</h2>
          <p className="mt-3 text-sm leading-6 text-slate-400">Новый чат готов.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {messages.map((message) => (
        <MessageCard
          key={message.id}
          message={message}
          onUseAsReference={onUseAsReference}
          onReuseReference={onReuseReference}
          onRetry={onRetry}
          onDeleted={onDeleted}
        />
      ))}
    </div>
  );
}

function MessageCard({
  message,
  onUseAsReference,
  onReuseReference,
  onRetry,
  onDeleted,
}: {
  message: ChatMessage;
  onUseAsReference: (projectId: string, url: string, mediaKind: 'image' | 'video') => void;
  onReuseReference?: (url: string, mediaKind: 'image' | 'video') => void;
  onRetry: (message: ChatMessage) => void;
  onDeleted?: () => void;
}) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [refLightbox, setRefLightbox] = useState<ReferenceLightboxItem | null>(null);
  const references = (message.references ?? []).filter((ref) => !ref.url.startsWith('data:'));
  const project = message.project;
  const status = project.status;
  const progress = project.progress ?? 0;
  const resultImage = mediaUrl(project.resultImage);
  const resultVideo = mediaUrl(project.resultVideo);
  const resultThumbnail = mediaUrl(project.resultThumbnail);
  const resultUrl = resultVideo ?? resultImage ?? resultThumbnail;
  // Звук приезжает в поле видео — отличаем его по расширению файла.
  const resultAudio = resultVideo && isAudioUrl(resultVideo) ? resultVideo : null;
  const failed = status === 'FAILED';
  const processing = isActive(status);
  const safeProgress = useLivelyProgress(progress, processing, project.id);
  const stuckHint = useStuckHint(safeProgress, processing);
  const friendlyError = chatFailureMessage(project.errorCode, project.errorMessage);
  const withAudio = hasGeneratedAudio(project.userInputs);

  return (
    <Card className="border-slate-800 bg-slate-900/80">
      <CardContent className="space-y-4 p-4 md:p-5">
        <div className="space-y-3 border-b border-slate-800 pb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={cn('rounded-md', PROJECT_STATUS_COLOR[status])}>
                {PROJECT_STATUS_LABEL[status]}
              </Badge>
              <Badge variant="outline" className="border-slate-700 text-slate-300">{message.modelSlug}</Badge>
              {message.aspectRatio && <Badge variant="outline" className="border-slate-700 text-slate-300">{message.aspectRatio}</Badge>}
              {withAudio && <Badge variant="outline" className="border-emerald-500/50 text-emerald-200">со звуком</Badge>}
              {message.inputRef && <Badge variant="outline" className="border-violet-500/50 text-violet-200">референс</Badge>}
            </div>
            <div className="text-xs text-slate-500">{formatDateTime(message.createdAt)}</div>
          </div>
          <p className="whitespace-pre-wrap text-sm leading-6 text-slate-200">{message.prompt}</p>
          {references.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-[11px] text-slate-500">Референсы:</span>
              {references.map((ref, index) => {
                const url = mediaUrl(ref.url) ?? ref.url;
                const canReuse = ref.mediaKind !== 'audio';
                return (
                  <div key={`${ref.url}-${index}`} className="group/ref relative h-12 w-12 overflow-hidden rounded-md border border-slate-700 bg-slate-950">
                    <button
                      type="button"
                      className="h-full w-full"
                      title="Открыть референс"
                      onClick={() => setRefLightbox({ url, mediaKind: ref.mediaKind, title: `Референс ${index + 1}` })}
                    >
                      {ref.mediaKind === 'image' ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={url} alt="" className="h-full w-full object-cover" />
                      ) : ref.mediaKind === 'video' ? (
                        <video src={url} className="h-full w-full object-cover" muted />
                      ) : (
                        <div className="grid h-full w-full place-items-center text-[9px] text-slate-400">AUDIO</div>
                      )}
                    </button>
                    {canReuse && onReuseReference && (
                      <button
                        type="button"
                        title="Переиспользовать этот референс"
                        aria-label="Переиспользовать этот референс"
                        onClick={() => onReuseReference(ref.url, ref.mediaKind as 'image' | 'video')}
                        className="absolute bottom-0.5 right-0.5 hidden h-5 w-5 place-items-center rounded bg-black/70 text-white group-hover/ref:grid"
                      >
                        <RotateCcw className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {processing && (
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
            <GenerationLoader
              progress={safeProgress}
              label={creativeProgressMessage(safeProgress)}
              hint={
                stuckHint
                  ? 'Серверы сейчас загружены — приносим извинения. Результат почти готов, нужно подождать ещё немного.'
                  : 'Можно закрыть вкладку: результат появится здесь сам.'
              }
            />
          </div>
        )}

        {failed && (
          <Alert className={warningAlertClass}>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Генерация не выполнена</AlertTitle>
            <AlertDescription>
              {friendlyError}
            </AlertDescription>
          </Alert>
        )}

        {!processing && !failed && resultAudio && (
          /*
           * Озвучка. Файл приходит тем же полем, что и видео (в контракте у звука нет
           * своего типа вывода), но <video> с mp3 рисует пустой чёрный прямоугольник —
           * человек видит «ничего не сгенерировалось». Поэтому звук отделён по
           * расширению файла и показывается нормальным аудио-плеером.
           */
          <div className="av-reveal relative overflow-hidden rounded-lg border border-violet-400/30 bg-slate-950 p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-violet-100">
              <Volume2 className="h-4 w-4 text-violet-300" />
              Озвучка готова
            </div>
            <audio src={resultAudio} controls preload="metadata" className="w-full" />
          </div>
        )}

        {!processing && !failed && !resultAudio && (
          <div className="av-reveal group relative overflow-hidden rounded-lg border border-slate-800 bg-slate-950">
            {resultVideo ? (
              <ResultMedia
                key={resultVideo}
                type="video"
                src={resultVideo}
                poster={resultThumbnail ?? undefined}
                videoControls
                className="max-h-[58vh] w-full bg-black"
              />
            ) : resultImage ? (
              <ResultMedia
                key={resultImage}
                type="image"
                src={resultImage}
                imgAlt="Результат Allvision AI"
                className="max-h-[58vh] w-full cursor-zoom-in object-contain"
                onImageClick={() => setLightboxOpen(true)}
              />
            ) : (
              <div className="grid min-h-[240px] place-items-center text-slate-600">
                {project.category === 'video' ? <Video className="h-10 w-10" /> : <ImageIcon className="h-10 w-10" />}
              </div>
            )}
            {(resultVideo || resultImage) && (
              <button
                type="button"
                onClick={() => setLightboxOpen(true)}
                className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/15 bg-black/55 text-white opacity-0 backdrop-blur transition hover:bg-black/75 focus:opacity-100 group-hover:opacity-100"
                title="Открыть на весь экран"
                aria-label="Открыть на весь экран"
              >
                <Maximize2 className="h-4 w-4" />
              </button>
            )}
          </div>
        )}

        {lightboxOpen && (resultVideo || resultImage) && (
          <MediaLightbox
            videoUrl={resultVideo}
            imageUrl={resultImage}
            posterUrl={resultThumbnail}
            downloadUrl={resultUrl}
            onClose={() => setLightboxOpen(false)}
          />
        )}

        {refLightbox && (
          <ReferenceLightbox
            item={refLightbox}
            onClose={() => setRefLightbox(null)}
            onReuse={refLightbox.mediaKind !== 'audio' && onReuseReference
              ? () => { onReuseReference(refLightbox.url, refLightbox.mediaKind as 'image' | 'video'); setRefLightbox(null); }
              : undefined}
          />
        )}

        {status === 'COMPLETED' && (
          <GenerationRetentionNotice expiresAt={project.expiresAt} />
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
          {/* Озвучку как видео-референс не предлагаем: это mp3, и модели ждут не его. */}
          {resultVideo && !resultAudio && (
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
          {status === 'COMPLETED' && (
            <ReportGenerationButton projectId={project.id} />
          )}
          {failed && (
            <Button type="button" variant="outline" className="border-slate-700 bg-slate-900" onClick={() => onRetry(message)}>
              Попробовать снова
            </Button>
          )}
          <DeleteGenerationButton projectId={project.id} title={project.title} onDeleted={onDeleted} />
        </div>
      </CardContent>
    </Card>
  );
}

function MediaLightbox({
  videoUrl,
  imageUrl,
  posterUrl,
  downloadUrl,
  onClose,
}: {
  videoUrl: string | null;
  imageUrl: string | null;
  posterUrl: string | null;
  downloadUrl: string | null;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex flex-col bg-black/95 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div className="flex shrink-0 items-center justify-end gap-2 p-3" onClick={(event) => event.stopPropagation()}>
        {downloadUrl && (
          <Button asChild size="sm" className="bg-amber-500 text-slate-950 hover:bg-amber-400">
            <a href={downloadUrl} download target="_blank" rel="noopener">
              <Download className="h-4 w-4" />
              Скачать
            </a>
          </Button>
        )}
        <Button type="button" variant="outline" size="icon" className="border-white/20 bg-white/10 text-white hover:bg-white/20" onClick={onClose} aria-label="Закрыть">
          <X className="h-5 w-5" />
        </Button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center p-3 sm:p-6">
        {videoUrl ? (
          <video
            src={videoUrl}
            poster={posterUrl ?? undefined}
            controls
            autoPlay
            className="max-h-full max-w-full rounded-md"
            onClick={(event) => event.stopPropagation()}
          />
        ) : imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt="Результат Allvision AI"
            className="max-h-full max-w-full rounded-md object-contain"
            onClick={(event) => event.stopPropagation()}
          />
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
