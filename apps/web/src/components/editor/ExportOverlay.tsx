'use client';

import { Check, Download, Film, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { mediaUrl } from '@/components/editor/canvas/useMediaElements';
import { useListVideoExportsQuery } from '@/store/api/video-projects-api';

/**
 * Экран сборки поверх всей рабочей области.
 *
 * Пока ролик собирается, инструменты не нужны и только сбивают с толку: правки всё равно
 * не попадут в идущую сборку. Поэтому на время рендера редактор уступает место прогрессу,
 * а после — готовому файлу и списку прошлых версий, которые можно скачать и сравнить.
 */
export function ExportOverlay({
  projectId,
  running,
  progress,
  resultUrl,
  onBackToEditor,
}: {
  projectId: string;
  running: boolean;
  progress: number;
  resultUrl?: string | null;
  onBackToEditor: () => void;
}) {
  // Список обновляем, пока идёт сборка: свежая версия должна появиться сама.
  const { data } = useListVideoExportsQuery(projectId, { pollingInterval: running ? 5000 : 0 });
  const previous = (data?.items ?? []).filter((item) => item.status === 'COMPLETED' && item.resultVideo);
  const percent = Math.max(2, Math.min(100, Math.round(progress)));

  return (
    <div className="flex min-h-0 flex-1 items-start justify-center overflow-y-auto p-6">
      <div className="w-full max-w-2xl space-y-6">
        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 text-center">
          {running ? (
            <>
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
            </>
          ) : (
            <>
              <Check className="mx-auto h-8 w-8 text-emerald-400" />
              <h2 className="mt-4 text-lg font-semibold text-slate-100">Ролик готов</h2>
              <p className="mt-2 text-sm text-slate-400">Скачайте файл или вернитесь в редактор и доработайте.</p>
            </>
          )}

          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            {resultUrl && (
              <Button asChild className="bg-emerald-500 text-slate-950 hover:bg-emerald-400">
                <a href={mediaUrl(resultUrl) ?? resultUrl} download target="_blank" rel="noopener">
                  <Download className="h-4 w-4" />
                  Скачать
                </a>
              </Button>
            )}
            <Button type="button" variant="outline" onClick={onBackToEditor}>
              Вернуться к ролику
            </Button>
          </div>
        </section>

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
