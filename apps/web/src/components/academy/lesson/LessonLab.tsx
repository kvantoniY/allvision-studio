'use client';

import { useMemo, useState } from 'react';
import { Coins, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useGetChatModelsQuery } from '@/store/api/user-chat-api';
import {
  useGenerateLessonLabMutation,
  useGetLessonLabHistoryQuery,
  useGetLessonLabQuery,
} from '@/store/api/academy-booking-api';

/**
 * Нейролаборатория внутри урока: изолированный бюджет токенов (виден остаток), ребёнок выбирает
 * модель, пишет запрос и генерирует картинки/видео. Списание идёт из бюджета урока (не из семьи).
 */
export function LessonLab({ lessonId }: { lessonId: string }) {
  const lab = useGetLessonLabQuery(lessonId, { pollingInterval: 10000 });
  const models = useGetChatModelsQuery();
  const history = useGetLessonLabHistoryQuery(lessonId, { pollingInterval: 3000 });
  const [generate, { isLoading: generating }] = useGenerateLessonLabMutation();

  const [modelSlug, setModelSlug] = useState('');
  const [prompt, setPrompt] = useState('');

  const videoAllowed = lab.data?.videoAllowed ?? true;
  const available = useMemo(
    () => (models.data?.models ?? []).filter((m) => m.category === 'image' || (videoAllowed && m.category === 'video')),
    [models.data, videoAllowed],
  );
  const model = available.find((m) => m.slug === modelSlug) ?? available[0];
  const remaining = lab.data?.remaining ?? 0;
  const notStarted = lab.data?.granted === null;

  const run = async () => {
    if (!model) return;
    if (model.requiresPrompt && !prompt.trim()) {
      toast({ title: 'Напишите запрос', variant: 'destructive' });
      return;
    }
    try {
      await generate({
        lessonId,
        body: { modelSlug: model.slug, prompt: prompt.trim(), aspectRatio: model.supportedAspectRatios[0] ?? 'auto' },
      }).unwrap();
      setPrompt('');
      toast({ title: 'Генерация запущена' });
    } catch (err) {
      const msg = (err as { data?: { error?: { message?: string } } })?.data?.error?.message;
      toast({ title: 'Не удалось запустить', description: msg, variant: 'destructive' });
    }
  };

  return (
    <div className="flex h-full flex-col bg-gradient-to-b from-violet-50/60 to-background">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <span className="font-semibold">Нейролаборатория</span>
        <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-sm font-medium text-primary">
          <Coins className="h-3.5 w-3.5" /> {remaining} токенов
        </span>
      </div>

      {notStarted ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center text-sm text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          Лаборатория откроется, когда преподаватель начнёт урок.
        </div>
      ) : (
        <>
          {/* Форма запроса */}
          <div className="space-y-2 border-b border-border p-3">
            <select
              value={model?.slug ?? ''}
              onChange={(e) => setModelSlug(e.target.value)}
              className="h-9 w-full rounded-lg border border-border bg-background px-2 text-sm"
            >
              {available.map((m) => (
                <option key={m.slug} value={m.slug}>{m.functionTitle} {m.category === 'video' ? '· видео' : '· картинка'}</option>
              ))}
            </select>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={2}
              placeholder="Опиши, что нарисовать или снять…"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
            <Button className="w-full" onClick={run} disabled={generating || remaining <= 0 || !model}>
              {generating ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1.5 h-4 w-4" />}
              {remaining <= 0 ? 'Токены закончились' : 'Создать'}
            </Button>
          </div>

          {/* Результаты */}
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {(history.data?.items.length ?? 0) === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Здесь появятся ваши работы.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {history.data!.items.map((it) => (
                  <div key={it.id} className="overflow-hidden rounded-xl border border-border bg-card">
                    <div className="flex aspect-square items-center justify-center bg-muted">
                      {it.status === 'COMPLETED' && it.resultUrl ? (
                        it.isVideo ? (
                          <video src={it.resultUrl} controls className="h-full w-full object-cover" />
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={it.resultUrl} alt={it.prompt ?? ''} className="h-full w-full object-cover" />
                        )
                      ) : it.status === 'FAILED' ? (
                        <span className="px-2 text-center text-[11px] text-destructive">Не получилось</span>
                      ) : (
                        <div className="flex flex-col items-center gap-1 text-[11px] text-muted-foreground">
                          <Loader2 className="h-5 w-5 animate-spin text-primary" />
                          {it.progress}%
                        </div>
                      )}
                    </div>
                    {it.prompt && <p className={cn('truncate px-2 py-1 text-[11px] text-muted-foreground')}>{it.prompt}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
