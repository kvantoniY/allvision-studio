'use client';

import { useEffect, useState } from 'react';
import { BookOpen, CheckCircle2, Clock, FileText, Loader2, NotebookPen, Users, X } from 'lucide-react';
import { LESSON_STATUS_LABELS, type LessonStatusValue } from '@allvision/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  useGetTeacherStudentsQuery,
  useGetTeacherStudentDetailQuery,
  useSaveTeacherStudentNoteMutation,
} from '@/store/api/academy-booking-api';

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
}
function statusLabel(s: string): string {
  return LESSON_STATUS_LABELS[s as LessonStatusValue] ?? s;
}
const TOPIC_STATUS: Record<string, { label: string; cls: string }> = {
  COMPLETED: { label: 'пройдена', cls: 'text-emerald-700' },
  IN_PROGRESS: { label: 'идёт', cls: 'text-primary' },
  RECOMMENDED: { label: 'следующая', cls: 'text-primary' },
  LOCKED: { label: '', cls: 'text-muted-foreground' },
};

export function TeacherStudents() {
  const { data, isLoading } = useGetTeacherStudentsQuery();
  const [openChild, setOpenChild] = useState<string | null>(null);
  const students = data?.students ?? [];

  return (
    <Card className="border-border bg-card shadow-sm">
      <CardContent className="p-5">
        <h2 className="mb-3 flex items-center gap-2 font-semibold"><Users className="h-4 w-4" /> Мои ученики</h2>
        {isLoading ? (
          <div className="h-20 animate-pulse rounded-xl bg-muted" />
        ) : students.length === 0 ? (
          <p className="text-sm text-muted-foreground">Здесь появятся ученики, с которыми у вас были занятия.</p>
        ) : (
          <div className="space-y-2">
            {students.map((s) => (
              <button
                key={s.childId}
                type="button"
                onClick={() => setOpenChild(s.childId)}
                className="flex w-full items-center gap-3 rounded-xl border border-border p-3 text-left transition hover:border-primary/50"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground">
                  {s.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{s.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    Последнее занятие: {fmtDate(s.lastLessonAt)} · проведено {s.completed} из {s.total}
                  </span>
                </span>
                {s.note && <NotebookPen className="h-4 w-4 shrink-0 text-primary" aria-label="Есть заметка" />}
              </button>
            ))}
          </div>
        )}
      </CardContent>
      {openChild && <StudentDetailModal childId={openChild} onClose={() => setOpenChild(null)} />}
    </Card>
  );
}

function StudentDetailModal({ childId, onClose }: { childId: string; onClose: () => void }) {
  const { data, isLoading } = useGetTeacherStudentDetailQuery(childId);
  const [saveNote, { isLoading: saving }] = useSaveTeacherStudentNoteMutation();
  const [note, setNote] = useState('');

  useEffect(() => { if (data) setNote(data.note ?? ''); }, [data]);

  const save = async () => {
    try {
      await saveNote({ childId, note }).unwrap();
      toast({ title: 'Заметка сохранена' });
    } catch {
      toast({ title: 'Не удалось сохранить заметку', variant: 'destructive' });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="academy-theme max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-card p-5 text-foreground" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{data?.name ?? 'Ученик'}</h2>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>

        {isLoading || !data ? (
          <div className="h-40 animate-pulse rounded-xl bg-muted" />
        ) : (
          <div className="space-y-5">
            {/* Заметка */}
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium"><NotebookPen className="h-4 w-4 text-primary" /> Заметка по ученику</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="Что повторить, на что обратить внимание на следующем занятии…"
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
              />
              <div className="mt-1.5 flex items-center gap-2">
                <Button size="sm" onClick={save} disabled={saving || note === (data.note ?? '')}>
                  {saving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null} Сохранить
                </Button>
                {data.noteUpdatedAt && <span className="text-xs text-muted-foreground">обновлено {fmtDate(data.noteUpdatedAt)}</span>}
              </div>
            </div>

            {/* Прогресс по программе */}
            <div>
              <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><BookOpen className="h-4 w-4 text-primary" /> Программа и прогресс</h3>
              {data.progress.enrollments.length === 0 ? (
                <p className="text-sm text-muted-foreground">Ребёнок пока не записан на курс.</p>
              ) : (
                <div className="space-y-3">
                  {data.progress.enrollments.map((e) => (
                    <div key={e.enrollmentId} className="rounded-xl border border-border p-3">
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-sm font-medium">{e.subjectTitle} · {e.courseTitle}</span>
                        <span className="text-xs text-muted-foreground">{e.completedTopics}/{e.totalTopics} тем</span>
                      </div>
                      <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div className="h-full bg-primary" style={{ width: `${e.totalTopics ? Math.round((e.completedTopics / e.totalTopics) * 100) : 0}%` }} />
                      </div>
                      <ul className="space-y-0.5">
                        {e.topics.map((t) => {
                          const st = TOPIC_STATUS[t.status] ?? TOPIC_STATUS.LOCKED;
                          return (
                            <li key={t.topicId} className="flex items-center gap-2 text-xs">
                              {t.status === 'COMPLETED'
                                ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                                : <span className={cn('h-3.5 w-3.5 shrink-0 rounded-full border', t.isNextRecommended ? 'border-primary' : 'border-muted-foreground/40')} />}
                              <span className={cn('min-w-0 flex-1 truncate', t.status === 'COMPLETED' && 'text-muted-foreground')}>{t.title}</span>
                              {(t.isNextRecommended || st.label) && (
                                <span className={cn('shrink-0', st.cls)}>{t.isNextRecommended ? 'следующая' : st.label}</span>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
                  {data.progress.skills.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {data.progress.skills.map((s) => (
                        <span key={s.skillId} className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{s.title}: {s.levelLabel}</span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* История уроков */}
            <div>
              <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><Clock className="h-4 w-4 text-primary" /> История занятий</h3>
              {data.history.length === 0 ? (
                <p className="text-sm text-muted-foreground">Занятий пока не было.</p>
              ) : (
                <div className="space-y-1.5">
                  {data.history.map((l) => (
                    <div key={l.id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs">
                      <span className="w-24 shrink-0 text-muted-foreground">{fmtDate(l.startsAt)}</span>
                      <span className="min-w-0 flex-1 truncate">{l.topicTitle ?? '—'} · {l.teacherName}</span>
                      {l.hasReport && <FileText className="h-3.5 w-3.5 shrink-0 text-primary" aria-label="Есть отчёт" />}
                      <span className={cn('shrink-0', ['COMPLETED', 'REPORT_SENT'].includes(l.status) ? 'text-emerald-700' : 'text-muted-foreground')}>{statusLabel(l.status)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
