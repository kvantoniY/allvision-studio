'use client';

import { useState } from 'react';
import { CalendarPlus, GraduationCap, Loader2, Trash2, Wallet } from 'lucide-react';
import {
  EARNING_STATUS_LABELS,
  LESSON_STATUS_LABELS,
  type EarningStatusValue,
  type LessonStatusValue,
} from '@allvision/shared';
import { AuthGuard } from '@/components/auth/auth-guard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import {
  useCreateSlotMutation,
  useDeleteSlotMutation,
  useGetTeacherEarningsQuery,
  useGetTeacherLessonsQuery,
  useGetTeacherSlotsQuery,
  useSetLessonStatusMutation,
} from '@/store/api/academy-booking-api';

function apiErr(err: unknown): string {
  const d = (err as { data?: { error?: { message?: string } } })?.data;
  return d?.error?.message ?? 'Ошибка';
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

const NEXT_STATUS: { value: LessonStatusValue; label: string }[] = [
  { value: 'READY', label: 'Готов' },
  { value: 'IN_PROGRESS', label: 'Идёт' },
  { value: 'COMPLETED', label: 'Завершён' },
  { value: 'NO_SHOW', label: 'Неявка' },
];

function SlotsPanel() {
  const { data, isLoading } = useGetTeacherSlotsQuery();
  const [createSlot, { isLoading: creating }] = useCreateSlotMutation();
  const [deleteSlot] = useDeleteSlotMutation();
  const [startsAt, setStartsAt] = useState('');
  const [duration, setDuration] = useState<25 | 45>(25);
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

  return (
    <Card className="border-border bg-card shadow-sm">
      <CardContent className="p-5">
        <h2 className="mb-3 flex items-center gap-2 font-semibold"><CalendarPlus className="h-4 w-4" /> Свободные слоты</h2>
        <div className="mb-4 flex flex-wrap items-end gap-2">
          <div className="space-y-1.5">
            <Label>Дата и время</Label>
            <Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className="w-56" />
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
          <Button onClick={add} disabled={creating || !startsAt}>
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

function LessonsPanel() {
  const { data, isLoading } = useGetTeacherLessonsQuery();
  const [setStatus] = useSetLessonStatusMutation();
  const lessons = data?.lessons ?? [];

  if (isLoading) return <div className="h-20 animate-pulse rounded-xl bg-muted" />;

  return (
    <Card className="border-border bg-card shadow-sm">
      <CardContent className="p-5">
        <h2 className="mb-3 font-semibold">Уроки</h2>
        {lessons.length === 0 ? (
          <p className="text-sm text-muted-foreground">Пока нет записей на уроки.</p>
        ) : (
          <div className="space-y-2">
            {lessons.map((l) => (
              <div key={l.id} className="rounded-xl border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{l.childName}{l.topicTitle ? ` · ${l.topicTitle}` : ''}</p>
                    <p className="text-xs text-muted-foreground">{fmt(l.startsAt)} · {l.durationMin} мин</p>
                  </div>
                  <Badge variant="outline">{LESSON_STATUS_LABELS[l.status]}</Badge>
                </div>
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
              </div>
            ))}
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
          <EarningsPanel />
        </div>
      </div>
    </AuthGuard>
  );
}
