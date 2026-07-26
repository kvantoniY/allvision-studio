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
  useGetLessonTopicOptionsQuery,
  useGetPublishedTemplatesQuery,
  useLazyGetInstanceSceneQuery,
} from '@/store/api/academy-lesson-instances-api';
import { useSetMeetingLinkMutation } from '@/store/api/academy-booking-api';

function apiErr(err: unknown): string {
  const d = (err as { data?: { error?: { message?: string } } })?.data;
  return d?.error?.message ?? 'Ошибка';
}

const TOPIC_STATUS_LABEL: Record<string, string> = {
  COMPLETED: 'пройдена', IN_PROGRESS: 'идёт', RECOMMENDED: 'следующая', LOCKED: '',
};

function PrepareModal({ lessonId, onClose }: { lessonId: string; onClose: () => void }) {
  const topicOptions = useGetLessonTopicOptionsQuery(lessonId);
  const [selectedTopic, setSelectedTopic] = useState<string | null | undefined>(undefined);
  const { data, isLoading } = useGetPublishedTemplatesQuery({ lessonId });
  const [createInstance, { isLoading: creating }] = useCreateInstanceMutation();
  const items = data?.items ?? [];

  // Тема по умолчанию — рекомендованная следующая по программе.
  const topics = topicOptions.data?.topics ?? [];
  const recommended = topicOptions.data?.recommendedTopicId ?? topicOptions.data?.currentTopicId ?? null;
  const effectiveTopic = selectedTopic === undefined ? recommended : selectedTopic;
  const hasProgram = topics.length > 0;

  // Шаблоны выбранной темы — вперёд; если тема выбрана, показываем сперва её уроки.
  const sorted = [...items].sort((a, b) => {
    const am = a.topicId === effectiveTopic ? 1 : 0;
    const bm = b.topicId === effectiveTopic ? 1 : 0;
    return bm - am;
  });

  const pick = async (templateVersionId: string) => {
    try {
      await createInstance({ lessonId, templateVersionId, topicId: effectiveTopic }).unwrap();
      const t = topics.find((x) => x.topicId === effectiveTopic);
      toast({ title: 'Урок подготовлен', description: t ? `Тема: ${t.title}` : 'Персонаж ребёнка подставится автоматически.' });
      onClose();
    } catch (err) {
      toast({ title: 'Не удалось', description: apiErr(err), variant: 'destructive' });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="academy-theme w-full max-w-md rounded-2xl bg-card p-5 text-foreground" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Подготовить урок</h2>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>

        {/* Тема программы (по умолчанию — следующая по порядку) */}
        {hasProgram && (
          <div className="mb-4 space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Тема ({topicOptions.data?.courseTitle})</label>
            <select
              value={effectiveTopic ?? ''}
              onChange={(e) => setSelectedTopic(e.target.value || null)}
              className="h-9 w-full rounded-lg border border-border bg-background px-2 text-sm"
            >
              {topics.map((t) => (
                <option key={t.topicId} value={t.topicId}>
                  {t.moduleTitle ? `${t.moduleTitle} · ` : ''}{t.title}
                  {t.isNextRecommended ? ' — следующая' : TOPIC_STATUS_LABEL[t.status] ? ` — ${TOPIC_STATUS_LABEL[t.status]}` : ''}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-muted-foreground">
              По умолчанию — следующая тема по программе. Можно пропустить вперёд (тема зачтётся пройденной) или вернуться к пройденной (перепрохождение, очки повторно не начисляются).
            </p>
          </div>
        )}

        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Шаблон урока</label>
        {isLoading ? (
          <div className="h-24 animate-pulse rounded-xl bg-muted" />
        ) : items.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Нет опубликованных шаблонов. Методист публикует их в конструкторе.</p>
        ) : (
          <div className="space-y-2">
            {sorted.map((t) => {
              const matchesTopic = Boolean(effectiveTopic && t.topicId === effectiveTopic);
              return (
              <button
                key={t.versionId}
                type="button"
                disabled={creating}
                onClick={() => pick(t.versionId)}
                className={cn('flex w-full items-center justify-between gap-2 rounded-xl border p-3 text-left transition hover:border-primary', matchesTopic ? 'border-primary/50 bg-accent/40' : 'border-border')}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{t.title}</span>
                  {t.topicTitle && <span className="block truncate text-[11px] text-muted-foreground">Тема: {t.topicTitle}</span>}
                </span>
                <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                  {matchesTopic && <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] text-primary-foreground">эта тема</span>}
                  v{t.version}
                </span>
              </button>
              );
            })}
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

function MeetingLinkField({ lessonId, meetingUrl }: { lessonId: string; meetingUrl: string | null }) {
  const [setMeetingLink, { isLoading }] = useSetMeetingLinkMutation();
  const [draft, setDraft] = useState(meetingUrl ?? '');
  const save = async () => {
    try {
      await setMeetingLink({ id: lessonId, url: draft.trim() }).unwrap();
      toast({ title: 'Ссылка на видеозвонок сохранена' });
    } catch (err) {
      toast({ title: 'Не удалось сохранить', description: apiErr(err), variant: 'destructive' });
    }
  };
  return (
    <div className="flex w-full flex-wrap items-center gap-1.5">
      <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground"><Video className="h-3.5 w-3.5" /> Видеозвонок:</span>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="https://telemost.yandex.ru/… (обязательно перед уроком)"
        className="h-8 min-w-[220px] flex-1 rounded-lg border border-border bg-background px-2 text-sm"
      />
      <Button size="sm" className="h-8" onClick={save} disabled={isLoading || draft.trim() === (meetingUrl ?? '')}>
        {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Сохранить'}
      </Button>
      {meetingUrl && <span className="inline-flex items-center gap-1 text-xs text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> добавлена</span>}
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
          <MeetingLinkField lessonId={lessonId} meetingUrl={data?.meetingUrl ?? null} />
        </>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setPrepareOpen(true)}><Wand2 className="mr-1 h-3.5 w-3.5" /> Подготовить урок</Button>
      )}
      {prepareOpen && <PrepareModal lessonId={lessonId} onClose={() => setPrepareOpen(false)} />}
      {previewOpen && instance && <PreviewModal instanceId={instance.id} onClose={() => setPreviewOpen(false)} />}
    </div>
  );
}
