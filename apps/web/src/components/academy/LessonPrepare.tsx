'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Eye, Loader2, Video, Wand2, X } from 'lucide-react';
import type { AcademyScene } from '@allvision/shared';
import { AcademyScenePlayer } from '@/components/academy/scene-player';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { SceneGenerationsPanel } from '@/components/academy/SceneGenerationsPanel';
import {
  useCreateInstanceMutation,
  useGetInstanceByLessonQuery,
  useGetPublishedTemplatesQuery,
  useLazyGetInstanceSceneQuery,
} from '@/store/api/academy-lesson-instances-api';

function apiErr(err: unknown): string {
  const d = (err as { data?: { error?: { message?: string } } })?.data;
  return d?.error?.message ?? 'Ошибка';
}

function PrepareModal({ lessonId, onClose }: { lessonId: string; onClose: () => void }) {
  const { data, isLoading } = useGetPublishedTemplatesQuery({ lessonId });
  const [createInstance, { isLoading: creating }] = useCreateInstanceMutation();
  const items = data?.items ?? [];
  const hasTopic = Boolean(data?.lessonTopicId);

  const pick = async (templateVersionId: string) => {
    try {
      await createInstance({ lessonId, templateVersionId }).unwrap();
      toast({ title: 'Урок подготовлен', description: 'Персонаж ребёнка подставится автоматически.' });
      onClose();
    } catch (err) {
      toast({ title: 'Не удалось', description: apiErr(err), variant: 'destructive' });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="academy-theme w-full max-w-md rounded-2xl bg-card p-5 text-foreground" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Выбрать шаблон урока</h2>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>
        {isLoading ? (
          <div className="h-24 animate-pulse rounded-xl bg-muted" />
        ) : items.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Нет опубликованных шаблонов. Методист публикует их в конструкторе.</p>
        ) : (
          <div className="space-y-2">
            {hasTopic && (
              <p className="text-xs text-muted-foreground">Уроки темы этого занятия показаны первыми и отмечены.</p>
            )}
            {items.map((t) => (
              <button
                key={t.versionId}
                type="button"
                disabled={creating}
                onClick={() => pick(t.versionId)}
                className={cn('flex w-full items-center justify-between gap-2 rounded-xl border p-3 text-left transition hover:border-primary', t.matchesLessonTopic ? 'border-primary/50 bg-accent/40' : 'border-border')}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{t.title}</span>
                  {t.topicTitle && <span className="block truncate text-[11px] text-muted-foreground">Тема: {t.topicTitle}</span>}
                </span>
                <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                  {t.matchesLessonTopic && <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] text-primary-foreground">тема урока</span>}
                  v{t.version}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PreviewModal({ instanceId, onClose }: { instanceId: string; onClose: () => void }) {
  const [fetchScene, { data, isFetching, error }] = useLazyGetInstanceSceneQuery();
  const [role, setRole] = useState<'student' | 'teacher'>('teacher');
  const [scene, setScene] = useState<AcademyScene | null>(null);

  useEffect(() => {
    void fetchScene(instanceId).unwrap().then((r) => setScene(r.scene)).catch(() => undefined);
  }, [instanceId, fetchScene]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="academy-theme w-full max-w-3xl rounded-2xl bg-card p-4 text-foreground" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Предпросмотр урока</h2>
          <div className="flex items-center gap-2">
            {(['teacher', 'student'] as const).map((r) => (
              <button key={r} type="button" onClick={() => setRole(r)} className={`rounded-full border px-2.5 py-1 text-xs ${role === r ? 'border-primary bg-accent text-accent-foreground' : 'border-border'}`}>
                {r === 'teacher' ? 'Учитель' : 'Ученик'}
              </button>
            ))}
            <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
          </div>
        </div>
        {isFetching || (!scene && !error) ? (
          <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : error ? (
          <p className="py-8 text-center text-sm text-destructive">Не удалось загрузить сцену урока.</p>
        ) : scene ? (
          <>
            <AcademyScenePlayer scene={scene} role={role} />
            {data && !data.hasCharacter && (
              <p className="mt-2 text-xs text-muted-foreground">Персонаж ребёнка ещё не создан — в сцене показан универсальный вид.</p>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}

export function LessonPrepare({ lessonId }: { lessonId: string }) {
  const { data } = useGetInstanceByLessonQuery(lessonId);
  const [prepareOpen, setPrepareOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const instance = data?.instance ?? null;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {instance ? (
        <>
          <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" /> Подготовлен: {instance.title} v{instance.version}
          </span>
          <Link href={`/lesson/${lessonId}`}><Button size="sm"><Video className="mr-1 h-3.5 w-3.5" /> Войти в урок</Button></Link>
          <Button size="sm" variant="outline" onClick={() => setPreviewOpen(true)}><Eye className="mr-1 h-3.5 w-3.5" /> Предпросмотр</Button>
          <Button size="sm" variant="ghost" onClick={() => setPrepareOpen(true)}>Сменить шаблон</Button>
          <SceneGenerationsPanel key={`${instance.id}:${instance.version}`} instanceId={instance.id} />
        </>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setPrepareOpen(true)}><Wand2 className="mr-1 h-3.5 w-3.5" /> Подготовить урок</Button>
      )}
      {prepareOpen && <PrepareModal lessonId={lessonId} onClose={() => setPrepareOpen(false)} />}
      {previewOpen && instance && <PreviewModal instanceId={instance.id} onClose={() => setPreviewOpen(false)} />}
    </div>
  );
}
