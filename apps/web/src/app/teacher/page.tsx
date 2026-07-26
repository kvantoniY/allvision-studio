'use client';

import { useEffect, useState } from 'react';
import { CalendarPlus, FileText, Gift, GraduationCap, Loader2, Sparkles, Trash2, Wallet } from 'lucide-react';
import {
  EARNING_STATUS_LABELS,
  LESSON_STATUS_LABELS,
  type EarningStatusValue,
  type LessonStatusValue,
} from '@allvision/shared';
import { AuthGuard } from '@/components/auth/auth-guard';
import { LessonPrepare } from '@/components/academy/LessonPrepare';
import { TeacherStudents } from '@/components/academy/TeacherStudents';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import {
  useCancelLessonMutation,
  useCreateSlotMutation,
  useCreateSlotsBulkMutation,
  useDeleteSlotMutation,
  useGetTeacherEarningsQuery,
  useGetTeacherLessonsQuery,
  useGetTeacherSlotsQuery,
  useRescheduleLessonMutation,
  useSetLessonStatusMutation,
} from '@/store/api/academy-booking-api';
import {
  useGetTeacherRewardCatalogQuery,
  useGrantTeacherRewardMutation,
  useGrantTeacherXpMutation,
} from '@/store/api/academy-gamification-api';
import {
  useGetTeacherLessonReportQuery,
  useSaveTeacherLessonReportMutation,
} from '@/store/api/academy-operations-api';

function apiErr(err: unknown): string {
  const d = (err as { data?: { error?: { message?: string } } })?.data;
  return d?.error?.message ?? 'Ошибка';
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function TeacherRewardPanel({ childId, childName }: { childId: string; childName: string }) {
  const [open, setOpen] = useState(false);
  const { data, isFetching } = useGetTeacherRewardCatalogQuery(childId, { skip: !open });
  const [grantXp, { isLoading: grantingXp }] = useGrantTeacherXpMutation();
  const [grantReward, { isLoading: grantingReward }] = useGrantTeacherRewardMutation();
  const [rewardItemId, setRewardItemId] = useState('');
  const [childAssetId, setChildAssetId] = useState('');

  const addXp = async (amount: number, reason: 'EFFORT' | 'MISSION') => {
    try {
      await grantXp({ childId, body: { amount, reason, requestId: crypto.randomUUID() } }).unwrap();
      toast({ title: `+${amount} XP для ${childName}`, description: reason === 'EFFORT' ? 'Награда за старание начислена.' : 'Миссия отмечена выполненной.' });
    } catch (error) {
      toast({ title: 'Не удалось начислить XP', description: apiErr(error), variant: 'destructive' });
    }
  };

  const addReward = async () => {
    if (!rewardItemId) return;
    try {
      await grantReward({ childId, body: { rewardItemId, ...(childAssetId ? { childAssetId } : {}) } }).unwrap();
      toast({ title: `Награда для ${childName} выдана` });
      setRewardItemId('');
      setChildAssetId('');
    } catch (error) {
      toast({ title: 'Не удалось выдать награду', description: apiErr(error), variant: 'destructive' });
    }
  };

  return (
    <div className="rounded-xl border border-border bg-muted/40 p-3">
      <button type="button" className="flex w-full items-center justify-between text-left text-sm font-semibold" onClick={() => setOpen((value) => !value)}>
        <span className="flex items-center gap-2"><Gift className="h-4 w-4 text-primary" /> {childName}</span>
        <span className="text-xs text-muted-foreground">{open ? 'Скрыть' : 'XP и награды'}</span>
      </button>
      {open && (
        <div className="mt-3 space-y-3 border-t border-border pt-3">
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" disabled={grantingXp} onClick={() => void addXp(10, 'EFFORT')}>
              <Sparkles className="mr-1.5 h-3.5 w-3.5" /> +10 за старание
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={grantingXp} onClick={() => void addXp(20, 'MISSION')}>
              +20 за миссию
            </Button>
          </div>
          {isFetching ? (
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          ) : (
            <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <select value={rewardItemId} onChange={(event) => setRewardItemId(event.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
                <option value="">Выберите награду</option>
                {data?.rewards.map((reward) => <option key={reward.id} value={reward.id}>{reward.icon} {reward.title}</option>)}
              </select>
              <select value={childAssetId} onChange={(event) => setChildAssetId(event.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
                <option value="">Без персонального материала</option>
                {data?.assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.title} · {asset.kind}</option>)}
              </select>
              <Button type="button" size="sm" disabled={!rewardItemId || grantingReward} onClick={() => void addReward()}>
                Выдать
              </Button>
            </div>
          )}
          <p className="text-xs text-muted-foreground">Для персонального костюма выберите готовую генерацию из закрытой библиотеки ребёнка.</p>
        </div>
      )}
    </div>
  );
}

function LessonReportPanel({ lessonId, childId }: { lessonId: string; childId: string }) {
  const reportQuery = useGetTeacherLessonReportQuery(lessonId);
  const catalogQuery = useGetTeacherRewardCatalogQuery(childId);
  const [saveReport, saveState] = useSaveTeacherLessonReportMutation();
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState('');
  const [successes, setSuccesses] = useState('');
  const [recommendation, setRecommendation] = useState('');
  const [assetIds, setAssetIds] = useState<string[]>([]);

  useEffect(() => {
    const report = reportQuery.data?.report;
    if (!report) return;
    setSummary(report.summary);
    setSuccesses(report.successes);
    setRecommendation(report.recommendation);
    setAssetIds(report.resultAssets.map((asset) => asset.id));
  }, [reportQuery.data?.report]);

  const submit = async () => {
    try {
      await saveReport({ lessonId, body: { summary, successes, recommendation, resultAssetIds: assetIds } }).unwrap();
      toast({ title: 'Отчёт отправлен родителю' });
      setOpen(false);
    } catch (error) {
      toast({ title: 'Не удалось отправить отчёт', description: apiErr(error), variant: 'destructive' });
    }
  };

  return (
    <div className="mt-3 rounded-xl bg-orange-50 p-3">
      <button type="button" className="flex w-full items-center justify-between text-left text-sm font-semibold text-orange-900" onClick={() => setOpen((value) => !value)}>
        <span className="flex items-center gap-2"><FileText className="h-4 w-4" /> {reportQuery.data?.report ? 'Отчёт родителю отправлен' : 'Заполнить отчёт родителю'}</span>
        <span className="text-xs">{open ? 'Скрыть' : reportQuery.data?.report ? 'Изменить' : 'Открыть'}</span>
      </button>
      {open && (
        <div className="mt-3 space-y-3 border-t border-orange-200 pt-3">
          <div><Label>Что прошли</Label><Textarea value={summary} onChange={(event) => setSummary(event.target.value)} maxLength={4000} placeholder="Кратко опишите занятие" /></div>
          <div><Label>Успехи ребёнка</Label><Textarea value={successes} onChange={(event) => setSuccesses(event.target.value)} maxLength={4000} placeholder="Что особенно хорошо получилось" /></div>
          <div><Label>Рекомендация</Label><Textarea value={recommendation} onChange={(event) => setRecommendation(event.target.value)} maxLength={4000} placeholder="Что можно повторить дома" /></div>
          {(catalogQuery.data?.assets.length ?? 0) > 0 && (
            <div><Label>Результаты из персональной библиотеки</Label><div className="mt-2 grid gap-1.5 sm:grid-cols-2">{catalogQuery.data?.assets.map((asset) => <label key={asset.id} className="flex items-center gap-2 rounded-lg border border-orange-200 bg-white px-3 py-2 text-xs"><input type="checkbox" checked={assetIds.includes(asset.id)} onChange={(event) => setAssetIds((current) => event.target.checked ? [...new Set([...current, asset.id])] : current.filter((id) => id !== asset.id))} /> {asset.title}</label>)}</div></div>
          )}
          <Button type="button" disabled={saveState.isLoading || summary.trim().length < 3 || successes.trim().length < 3 || recommendation.trim().length < 3} onClick={() => void submit()}>
            {saveState.isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Отправить отчёт
          </Button>
        </div>
      )}
    </div>
  );
}

const NEXT_STATUS: { value: LessonStatusValue; label: string }[] = [
  { value: 'READY', label: 'Готов' },
  { value: 'IN_PROGRESS', label: 'Идёт' },
  { value: 'COMPLETED', label: 'Завершён' },
  { value: 'NO_SHOW', label: 'Неявка' },
];

/** Время приёма: 08:00–21:30 с шагом 30 минут. */
const SLOT_TIMES = Array.from({ length: 28 }, (_, i) => {
  const minutes = 8 * 60 + i * 30;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
});

function SlotsPanel() {
  const { data, isLoading } = useGetTeacherSlotsQuery();
  const [createSlot, { isLoading: creating }] = useCreateSlotMutation();
  const [createSlotsBulk, { isLoading: bulkCreating }] = useCreateSlotsBulkMutation();
  const [deleteSlot] = useDeleteSlotMutation();
  const [startsAt, setStartsAt] = useState('');
  const [duration, setDuration] = useState<25 | 45>(25);
  // Сетка: день + выбранные времена + повтор по неделям.
  const [gridDate, setGridDate] = useState(() => new Date().toLocaleDateString('sv-SE'));
  const [gridTimes, setGridTimes] = useState<string[]>([]);
  const [repeatWeeks, setRepeatWeeks] = useState(1);
  const slots = data?.slots ?? [];

  const add = async () => {
    if (!startsAt) return;
    try {
      await createSlot({ startsAt: new Date(startsAt).toISOString(), durationMin: duration }).unwrap();
      setStartsAt('');
      toast({ title: 'Слот добавлен' });
    } catch (err) {
      toast({ title: 'Не удалось', description: apiErr(err), variant: 'destructive' });
    }
  };

  const addGrid = async () => {
    if (!gridDate || gridTimes.length === 0) return;
    const [year, month, day] = gridDate.split('-').map(Number);
    const iso: string[] = [];
    for (let week = 0; week < repeatWeeks; week += 1) {
      for (const time of gridTimes) {
        const [hour, minute] = time.split(':').map(Number);
        iso.push(new Date(year, month - 1, day + week * 7, hour, minute).toISOString());
      }
    }
    try {
      const result = await createSlotsBulk({ startsAt: iso, durationMin: duration }).unwrap();
      setGridTimes([]);
      toast({
        title: `Добавлено слотов: ${result.created}`,
        description: result.skipped > 0 ? `Пропущено дублей: ${result.skipped}` : undefined,
      });
    } catch (err) {
      toast({ title: 'Не удалось добавить', description: apiErr(err), variant: 'destructive' });
    }
  };

  return (
    <Card className="border-border bg-card shadow-sm">
      <CardContent className="p-5">
        <h2 className="mb-3 flex items-center gap-2 font-semibold"><CalendarPlus className="h-4 w-4" /> Свободные слоты</h2>

        <div className="mb-4 rounded-xl border border-border p-3">
          <p className="mb-3 text-sm font-medium">Расписание сеткой</p>
          <div className="mb-3 flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label>День</Label>
              <Input type="date" value={gridDate} onChange={(e) => setGridDate(e.target.value)} className="w-44" />
            </div>
            <div className="space-y-1.5">
              <Label>Длительность</Label>
              <div className="flex gap-1">
                {([25, 45] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDuration(d)}
                    className={`rounded-md border px-3 py-2 text-sm ${duration === d ? 'border-primary bg-accent text-accent-foreground' : 'border-border text-muted-foreground'}`}
                  >
                    {d}м
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Повторить недель</Label>
              <div className="flex gap-1">
                {[1, 2, 4, 8].map((w) => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => setRepeatWeeks(w)}
                    className={`rounded-md border px-3 py-2 text-sm ${repeatWeeks === w ? 'border-primary bg-accent text-accent-foreground' : 'border-border text-muted-foreground'}`}
                  >
                    {w}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="mb-3 flex flex-wrap gap-1">
            {SLOT_TIMES.map((time) => {
              const selected = gridTimes.includes(time);
              return (
                <button
                  key={time}
                  type="button"
                  onClick={() => setGridTimes((prev) => (selected ? prev.filter((t) => t !== time) : [...prev, time]))}
                  className={`rounded-md border px-2 py-1 text-xs ${selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:border-primary/40'}`}
                >
                  {time}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={addGrid} disabled={bulkCreating || gridTimes.length === 0}>
              {bulkCreating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Добавить {gridTimes.length * repeatWeeks || ''} слотов
            </Button>
            <span className="text-xs text-muted-foreground">
              Выберите время — слоты создадутся на выбранный день недели на {repeatWeeks} нед. вперёд.
            </span>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-end gap-2">
          <div className="space-y-1.5">
            <Label>Один слот вручную</Label>
            <Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className="w-56" />
          </div>
          <Button variant="outline" onClick={add} disabled={creating || !startsAt}>
            {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Добавить
          </Button>
        </div>
        {isLoading ? (
          <div className="h-16 animate-pulse rounded-xl bg-muted" />
        ) : slots.length === 0 ? (
          <p className="text-sm text-muted-foreground">Добавьте свободное время, чтобы родители могли записаться.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {slots.map((s) => (
              <span key={s.id} className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm ${s.isBooked ? 'border-primary/40 bg-accent text-accent-foreground' : 'border-border'}`}>
                {fmt(s.startsAt)} · {s.durationMin}м
                {s.isBooked ? (
                  <Badge variant="outline" className="ml-1 border-primary/40 text-primary">занят</Badge>
                ) : (
                  <button type="button" aria-label="Удалить" className="text-muted-foreground hover:text-destructive" onClick={() => deleteSlot(s.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </span>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const RESCHEDULABLE_STATUSES = ['BOOKED', 'AWAITING_PREP', 'GENERATING', 'READY'];

/** Перенос и отмена урока преподавателем. */
function LessonManage({ lessonId, startsAt }: { lessonId: string; startsAt: string }) {
  const [reschedule, { isLoading: moving }] = useRescheduleLessonMutation();
  const [cancel, { isLoading: cancelling }] = useCancelLessonMutation();
  const [open, setOpen] = useState(false);
  const [when, setWhen] = useState('');

  const doMove = async () => {
    if (!when) return;
    try {
      await reschedule({ id: lessonId, startsAt: new Date(when).toISOString() }).unwrap();
      toast({ title: 'Урок перенесён' });
      setOpen(false);
      setWhen('');
    } catch (err) {
      toast({ title: 'Не удалось перенести', description: apiErr(err), variant: 'destructive' });
    }
  };

  const doCancel = async () => {
    if (!window.confirm('Отменить урок? Занятие вернётся родителю на баланс, если до начала ≥ 8 часов.')) return;
    try {
      const res = await cancel({ id: lessonId }).unwrap();
      toast({ title: res.refunded ? 'Урок отменён, занятие возвращено' : 'Урок отменён' });
    } catch (err) {
      toast({ title: 'Не удалось отменить', description: apiErr(err), variant: 'destructive' });
    }
  };

  return (
    <div className="mt-2 space-y-2">
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setOpen((v) => !v); setWhen(startsAt.slice(0, 16)); }}>Перенести</Button>
        <Button size="sm" variant="outline" className="h-7 text-xs text-destructive hover:text-destructive" disabled={cancelling} onClick={doCancel}>Отменить</Button>
      </div>
      {open && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/40 p-2">
          <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="h-8 w-52" />
          <Button size="sm" className="h-8" disabled={moving || !when} onClick={doMove}>
            {moving && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />} Перенести
          </Button>
          <Button size="sm" variant="ghost" className="h-8" onClick={() => setOpen(false)}>Отмена</Button>
        </div>
      )}
    </div>
  );
}

function LessonsPanel() {
  const { data, isLoading } = useGetTeacherLessonsQuery();
  const [setStatus] = useSetLessonStatusMutation();
  const lessons = data?.lessons ?? [];
  const children = [...new Map(lessons.map((lesson) => [lesson.childId, lesson.childName])).entries()];

  if (isLoading) return <div className="h-20 animate-pulse rounded-xl bg-muted" />;

  return (
    <Card className="border-border bg-card shadow-sm">
      <CardContent className="p-5">
        <h2 className="mb-3 font-semibold">Уроки</h2>
        {lessons.length === 0 ? (
          <p className="text-sm text-muted-foreground">Пока нет записей на уроки.</p>
        ) : (
          <div className="space-y-5">
            <div className="space-y-2">{lessons.map((l) => (
              <div key={l.id} className="rounded-xl border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{l.childName}{l.topicTitle ? ` · ${l.topicTitle}` : ''}</p>
                    <p className="text-xs text-muted-foreground">{fmt(l.startsAt)} · {l.durationMin} мин</p>
                  </div>
                  <Badge variant="outline">{LESSON_STATUS_LABELS[l.status]}</Badge>
                </div>
                {['BOOKED', 'AWAITING_PREP', 'GENERATING', 'READY'].includes(l.status) && <LessonPrepare lessonId={l.id} />}
                {['BOOKED', 'AWAITING_PREP', 'GENERATING', 'READY', 'IN_PROGRESS'].includes(l.status) && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {NEXT_STATUS.map((s) => (
                      <button
                        key={s.value}
                        type="button"
                        onClick={async () => {
                          await setStatus({ id: l.id, status: s.value }).unwrap().catch((err) => toast({ title: 'Ошибка', description: apiErr(err), variant: 'destructive' }));
                        }}
                        className="rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:border-primary/50 hover:text-primary"
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                )}
                {RESCHEDULABLE_STATUSES.includes(l.status) && <LessonManage lessonId={l.id} startsAt={l.startsAt} />}
                {['COMPLETED', 'REPORT_SENT'].includes(l.status) && <LessonReportPanel lessonId={l.id} childId={l.childId} />}
              </div>
            ))}</div>
            <div className="space-y-2 border-t border-border pt-4">
              <p className="text-sm font-semibold">Мотивация учеников</p>
              {children.map(([childId, childName]) => <TeacherRewardPanel key={childId} childId={childId} childName={childName} />)}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EarningsPanel() {
  const { data } = useGetTeacherEarningsQuery();
  const earnings = data?.earnings ?? [];
  const total = earnings.reduce((s, e) => s + e.amountRub, 0);
  return (
    <Card className="border-border bg-card shadow-sm">
      <CardContent className="p-5">
        <h2 className="mb-3 flex items-center gap-2 font-semibold"><Wallet className="h-4 w-4" /> Доход</h2>
        {earnings.length === 0 ? (
          <p className="text-sm text-muted-foreground">Доход появится после проведённых уроков.</p>
        ) : (
          <div className="space-y-1.5">
            {earnings.map((e) => (
              <div key={e.status} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{EARNING_STATUS_LABELS[e.status as EarningStatusValue] ?? e.status}</span>
                <span className="font-medium">{e.amountRub.toLocaleString('ru-RU')} ₽ · {e.count}</span>
              </div>
            ))}
            <div className="mt-2 flex items-center justify-between border-t border-border pt-2 text-sm font-semibold">
              <span>Всего</span>
              <span>{total.toLocaleString('ru-RU')} ₽</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function TeacherPage() {
  return (
    <AuthGuard>
      <div className="academy-theme min-h-screen">
        <div className="mx-auto max-w-3xl space-y-6 px-4 py-10">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">
              <GraduationCap className="h-3.5 w-3.5" /> Кабинет преподавателя
            </div>
            <h1 className="text-3xl font-bold tracking-tight">Расписание и уроки</h1>
          </div>
          <SlotsPanel />
          <LessonsPanel />
          <TeacherStudents />
          <EarningsPanel />
        </div>
      </div>
    </AuthGuard>
  );
}
