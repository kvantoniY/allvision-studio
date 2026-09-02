'use client';

import { AlertTriangle, Download, Film, Loader2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { mediaUrl } from '@/components/editor/canvas/useMediaElements';
import { useListVideoExportsQuery } from '@/store/api/video-projects-api';

/**
 * Экран сборки поверх всей рабочей области.
 *
 * Пока ролик собирается, инструменты не нужны и только сбивают с толку: правки всё равно
 * не попадут в идущую сборку. Поэтому на время рендера редактор уступает место прогрессу,
 * а после — готовому файлу и списку прошлых версий, которые можно скачать и сравнить.
 *
 * Состояний ровно три, и они различаются явно. Раньше экран считал «не идёт» синонимом
 * «готово» и показывал зелёную галочку даже после провала: человек видел «Ролик готов»,
 * а в истории проектов — «Не выполнено».
 */
export function ExportOverlay({
  projectId,
  running,
  failed,
  errorMessage,
  progress,
  resultUrl,
  onRetry,
  onBackToEditor,
}: {
  projectId: string;
  running: boolean;
  failed: boolean;
  errorMessage?: string | null;
  progress: number;
  resultUrl?: string | null;
  onRetry: () => void;
  onBackToEditor: () => void;
}) {
  // Список обновляем, пока идёт сборка: свежая версия должна появиться сама.
  const { data } = useListVideoExportsQuery(projectId, { pollingInterval: running ? 5000 : 0 });
  const previous = (data?.items ?? []).filter((item) => item.status === 'COMPLETED' && item.resultVideo);
  const percent = Math.max(2, Math.min(100, Math.round(progress)));
  const src = resultUrl ? mediaUrl(resultUrl) ?? resultUrl : null;

  return (
    <div className="flex min-h-0 flex-1 items-start justify-center overflow-y-auto p-4 sm:p-6">
      <div className="w-full max-w-3xl space-y-5">
        {running && (
          <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-amber-300" />
            <h2 className="mt-4 text-lg font-semibold text-slate-100">Собираем ролик</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">
              Склейка идёт на сервере. Страницу можно закрыть — готовый файл дождётся здесь же
              и в списке ваших проектов.
            </p>
            <div className="mx-auto mt-5 h-2 w-full max-w-sm overflow-hidden rounded-full bg-slate-800">
              <div className="h-full rounded-full bg-amber-400 transition-all" style={{ width: `${percent}%` }} />
            </div>
            <p className="mt-2 font-mono text-xs text-slate-500">{percent}%</p>
            <Button type="button" variant="outline" className="mt-5" onClick={onBackToEditor}>
              Вернуться к ролику
            </Button>
          </section>
        )}

        {failed && (
          <section className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-6 text-center">
            <AlertTriangle className="mx-auto h-8 w-8 text-rose-300" />
            <h2 className="mt-4 text-lg font-semibold text-slate-100">Ролик не собрался</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-slate-300">
              Токены за сборку вернулись на баланс. Попробуйте ещё раз — ролик и все правки на месте.
            </p>
            {errorMessage && (
              <details className="mx-auto mt-3 max-w-md text-left">
                <summary className="cursor-pointer text-xs text-slate-400 transition hover:text-slate-200">
                  Подробности для поддержки
                </summary>
                <p className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-slate-800 bg-slate-950/60 p-2 font-mono text-[11px] leading-4 text-slate-400">
                  {errorMessage}
                </p>
              </details>
            )}
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
              <Button type="button" onClick={onRetry}>
                <RotateCcw className="h-4 w-4" />
                Собрать заново
              </Button>
              <Button type="button" variant="outline" onClick={onBackToEditor}>
                Вернуться к ролику
              </Button>
            </div>
          </section>
        )}

        {!running && !failed && (
          <section className="space-y-4">
            {/*
              * Готовый ролик показываем крупно и сразу: это результат работы, а не строка
              * в списке. Плеер обычный, со своими элементами управления — свой городить
              * незачем, здесь нечего синхронизировать.
              */}
            <div className="overflow-hidden rounded-2xl border border-slate-800 bg-black">
              {src ? (
                <video
                  key={src}
                  src={src}
                  controls
                  playsInline
                  preload="metadata"
                  className="mx-auto max-h-[62dvh] w-full bg-black object-contain"
                />
              ) : (
                <div className="grid h-64 place-items-center text-sm text-slate-500">Файл готовится…</div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2">
              {src && (
                <Button asChild className="bg-emerald-500 text-slate-950 hover:bg-emerald-400">
                  <a href={src} download target="_blank" rel="noopener">
                    <Download className="h-4 w-4" />
                    Скачать
                  </a>
                </Button>
              )}
              <Button type="button" variant="outline" onClick={onBackToEditor}>
                Вернуться к редактированию
              </Button>
              <Button type="button" variant="ghost" onClick={onRetry}>
                <RotateCcw className="h-4 w-4" />
                Собрать заново
              </Button>
            </div>
          </section>
        )}

        {previous.length > 0 && (
          <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
            <h3 className="mb-3 text-sm font-semibold text-slate-100">Прошлые сборки</h3>
            <div className="space-y-1.5">
              {previous.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2"
                >
                  <Film className="h-4 w-4 shrink-0 text-slate-500" />
                  <span className="min-w-0 flex-1 truncate text-xs text-slate-400">
                    {new Date(item.completedAt ?? item.createdAt).toLocaleString('ru-RU')}
                  </span>
                  <a
                    href={mediaUrl(item.resultVideo) ?? item.resultVideo ?? '#'}
                    download
                    target="_blank"
                    rel="noopener"
                    className="shrink-0 text-xs text-amber-300 transition hover:text-amber-200"
                  >
                    Скачать
                  </a>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
