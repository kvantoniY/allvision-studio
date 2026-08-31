'use client';

import { useEffect, useState } from 'react';
import { Check, Loader2, Plus, RefreshCw, XCircle } from 'lucide-react';
import { useListProjectsQuery } from '@/store/api/projects-api';
import { mediaUrl } from '@/components/editor/canvas/useMediaElements';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Библиотека генераций внутри редактора.
 *
 * Раньше единственным местом, где виден ход генерации, была заглушка на кадре: стоило уйти
 * в другую сцену — и понять, считается ли что-нибудь, было нельзя. Здесь виден весь список
 * с прогрессом, и любой готовый кадр можно поставить в текущую сцену ещё раз.
 */
export function GenerationLibrary({ onInsert }: { onInsert: (url: string, kind: 'image' | 'video') => void }) {
  // Пока в списке есть незавершённые генерации, обновляемся часто: прогресс должен идти.
  const [hasRunning, setHasRunning] = useState(true);
  const { data, isLoading, refetch } = useListProjectsQuery(
    { page: 1, limit: 24 },
    // Пока что-то считается — опрашиваем часто; когда всё готово, опрос прекращается,
    // иначе вкладка дёргала бы сервер вечно.
    { pollingInterval: hasRunning ? 3000 : 0 },
  );
  const items = data?.items ?? [];
  const running = items.filter((item) => item.status === 'PENDING' || item.status === 'PROCESSING');

  useEffect(() => {
    setHasRunning(running.length > 0);
  }, [running.length]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-100">Мои генерации</h3>
        <button
          type="button"
          onClick={() => void refetch()}
          aria-label="Обновить список"
          className="grid h-7 w-7 place-items-center rounded border border-slate-700 text-slate-400 transition hover:text-slate-100"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>

      {running.length > 0 && (
        <p className="text-[11px] text-violet-300">
          В работе: {running.length}. Кадр встанет в сцену сам, страницу можно не держать открытой.
        </p>
      )}

      {isLoading && <p className="text-xs text-slate-500">Загружаем…</p>}
      {!isLoading && items.length === 0 && (
        <p className="text-xs text-slate-500">Здесь появятся ваши генерации — из редактора, чата и услуг.</p>
      )}

      <div className="space-y-1.5">
        {items.map((item) => {
          const url = item.resultVideo ?? item.resultImage;
          const kind: 'image' | 'video' = item.resultVideo ? 'video' : 'image';
          const preview = mediaUrl(item.resultThumbnail ?? item.resultImage ?? null);
          const done = item.status === 'COMPLETED' && Boolean(url);
          const failed = item.status === 'FAILED';
          return (
            <div
              key={item.id}
              className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/60 p-1.5"
            >
              <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded bg-slate-950">
                {preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={preview} alt="" className="h-full w-full object-cover" />
                ) : failed ? (
                  <XCircle className="h-4 w-4 text-rose-400" />
                ) : done ? (
                  <Check className="h-4 w-4 text-emerald-400" />
                ) : (
                  <Loader2 className="h-4 w-4 animate-spin text-violet-300" />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] text-slate-300">{item.title}</p>
                <p
                  className={cn(
                    'text-[10px]',
                    failed ? 'text-rose-300' : done ? 'text-slate-500' : 'text-violet-300',
                  )}
                >
                  {failed
                    ? 'Не получилось — токены вернулись'
                    : done
                      ? kind === 'video' ? 'Видео' : 'Кадр'
                      : `${item.status === 'PENDING' ? 'В очереди' : 'Генерируем'} — ${item.progress}%`}
                </p>
              </div>

              {done && url && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 shrink-0 px-2 text-[11px]"
                  onClick={() => onInsert(url, kind)}
                >
                  <Plus className="h-3.5 w-3.5" />
                  В сцену
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
