'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CalendarClock, Check, ChevronLeft, ChevronRight, Clock, Loader2, Video, Wallet, X } from 'lucide-react';
import { LESSON_STATUS_LABELS, type LessonDto, type LessonPackageOption } from '@allvision/shared';
import { AuthGuard } from '@/components/auth/auth-guard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useListChildrenQuery } from '@/store/api/family-api';
import {
  useBookLessonMutation,
  useCancelLessonMutation,
  useGetBalanceQuery,
  useGetLessonsQuery,
  useGetPackagesQuery,
  useGetTeachersQuery,
  usePurchasePackageMutation,
} from '@/store/api/academy-booking-api';

function apiErr(err: unknown): string {
  const d = (err as { data?: { error?: { message?: string } } })?.data;
  return d?.error?.message ?? 'Ошибка, попробуйте ещё раз';
}

function formatSlot(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

const ACTIVE_STATUSES = new Set(['BOOKED', 'AWAITING_PREP', 'GENERATING', 'READY', 'IN_PROGRESS']);

function BalanceCard({ onBuy }: { onBuy: () => void }) {
  const { data } = useGetBalanceQuery();
  const balance = data?.balance ?? [];
  const total = balance.reduce((sum, b) => sum + b.available, 0);
  return (
    <Card className="border-border bg-card shadow-sm">
      <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-accent-foreground">
            <Wallet className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm text-muted-foreground">Баланс занятий</p>
            <p className="text-lg font-semibold">
              {total > 0
                ? balance.map((b) => `${b.available} × ${b.durationMin} мин`).join(' · ')
                : 'Нет оплаченных занятий'}
            </p>
          </div>
        </div>
        <Button onClick={onBuy}>Купить абонемент</Button>
      </CardContent>
    </Card>
  );
}

function PackagesModal({ onClose }: { onClose: () => void }) {
  const { data } = useGetPackagesQuery();
  const [purchase, { isLoading }] = usePurchasePackageMutation();
  const [pending, setPending] = useState<string | null>(null);
  const packages = data?.packages ?? [];
  const byDuration = (d: number) => packages.filter((p) => p.durationMin === d);

  const buy = async (p: LessonPackageOption) => {
    setPending(`${p.durationMin}-${p.count}`);
    try {
      const result = await purchase({ durationMin: p.durationMin as 25 | 45, count: p.count }).unwrap();
      window.location.href = result.confirmationUrl;
    } catch (err) {
      toast({ title: 'Не удалось оформить', description: apiErr(err), variant: 'destructive' });
      setPending(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="academy-theme max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-card p-5 text-foreground" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Абонементы</h2>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>
        {[25, 45].map((d) => (
          <div key={d} className="mb-5">
            <p className="mb-2 text-sm font-medium">Занятия по {d} минут</p>
            <div className="grid grid-cols-2 gap-2">
              {byDuration(d).map((p) => {
                const key = `${p.durationMin}-${p.count}`;
                return (
                  <button
                    key={key}
                    type="button"
                    disabled={isLoading}
                    onClick={() => buy(p)}
                    className="rounded-xl border border-border p-3 text-left transition hover:border-primary/50"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{p.count} занятий</span>
                      {p.discountPct > 0 && <Badge className="bg-accent text-accent-foreground hover:bg-accent">−{p.discountPct}%</Badge>}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{p.priceRub.toLocaleString('ru-RU')} ₽</p>
                    <p className="text-xs text-muted-foreground">{p.pricePerLessonRub.toLocaleString('ru-RU')} ₽ / занятие</p>
                    {pending === key && <Loader2 className="mt-1 h-4 w-4 animate-spin text-primary" />}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Локальный ключ дня YYYY-MM-DD (не UTC — календарь показывает время пользователя). */
function dayKey(date: Date): string {
  return date.toLocaleDateString('sv-SE');
}

function monthTitle(date: Date): string {
  return date.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
}

/** Сетка месяца от понедельника: 6 недель по 7 дней, чтобы высота не прыгала. */
function monthGrid(month: Date): Date[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7; // Пн = 0
  const start = new Date(first.getFullYear(), first.getMonth(), 1 - offset);
  return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
}

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

function StepLabel({ n, text }: { n: number; text: string }) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{n}</span>
      <span className="text-sm font-semibold">{text}</span>
    </div>
  );
}

function BookingSection() {
  const children = useListChildrenQuery();
  const teachers = useGetTeachersQuery();
  const balance = useGetBalanceQuery();
  const [book, { isLoading }] = useBookLessonMutation();
  const [childId, setChildId] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const [selectedDay, setSelectedDay] = useState('');
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));

  const kids = children.data?.items ?? [];
  const list = teachers.data?.teachers ?? [];
  const activeChild = childId || kids[0]?.id || '';
  const child = kids.find((k) => k.id === activeChild);
  const activeTeacher = list.find((t) => t.teacherId === teacherId) ?? list[0];

  // Свободные слоты выбранного преподавателя, разложенные по дням.
  const slotsByDay = new Map<string, typeof list[number]['slots']>();
  for (const slot of activeTeacher?.slots ?? []) {
    const key = dayKey(new Date(slot.startsAt));
    const bucket = slotsByDay.get(key);
    if (bucket) bucket.push(slot);
    else slotsByDay.set(key, [slot]);
  }

  const daySlots = slotsByDay.get(selectedDay) ?? [];
  const availableByDuration = new Map((balance.data?.balance ?? []).map((b) => [b.durationMin, b.available]));

  const doBook = async (slotId: string, durationMin: number) => {
    if (!activeChild) {
      toast({ title: 'Сначала добавьте профиль ребёнка', variant: 'destructive' });
      return;
    }
    try {
      await book({ childId: activeChild, slotId }).unwrap();
      toast({ title: 'Урок забронирован', description: 'Найдите его в списке «Мои уроки» ниже.' });
      setSelectedDay('');
    } catch (err) {
      toast({
        title: availableByDuration.get(durationMin) ? 'Не удалось записать' : `Нет оплаченных занятий на ${durationMin} мин`,
        description: apiErr(err),
        variant: 'destructive',
      });
    }
  };

  if (teachers.isLoading) return <div className="h-40 animate-pulse rounded-2xl bg-muted" />;

  if (kids.length === 0) {
    return (
      <Card className="border-border bg-card">
        <CardContent className="p-5 text-sm text-muted-foreground">
          Чтобы записаться на урок, сначала добавьте профиль ребёнка в разделе{' '}
          <Link href="/family" className="font-medium text-primary hover:underline">Семья</Link>.
        </CardContent>
      </Card>
    );
  }

  if (list.length === 0) {
    return (
      <Card className="border-border bg-card">
        <CardContent className="p-5 text-sm text-muted-foreground">
          Пока нет преподавателей со свободным расписанием. Мы добавим слоты в ближайшее время.
        </CardContent>
      </Card>
    );
  }

  const today = dayKey(new Date());

  return (
    <Card className="border-border bg-card shadow-sm">
      <CardContent className="space-y-6 p-5">
        <h2 className="text-lg font-semibold">Записаться на урок</h2>

        {kids.length > 1 && (
          <div>
            <StepLabel n={1} text="Кто занимается" />
            <div className="flex flex-wrap gap-1.5">
              {kids.map((k) => (
                <button
                  key={k.id}
                  type="button"
                  onClick={() => setChildId(k.id)}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-sm transition',
                    k.id === activeChild ? 'border-primary bg-accent text-accent-foreground' : 'border-border text-muted-foreground hover:border-primary/40',
                  )}
                >
                  {k.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {child && !child.readyForLessons && (
          <div className="rounded-xl border border-primary/40 bg-accent/40 p-4">
            <p className="text-sm font-semibold">Перед записью подготовьте профиль {child.name}</p>
            <ul className="mt-2 space-y-1.5 text-sm">
              <li className="flex items-center gap-2">
                {child.photoConsentsComplete
                  ? <Check className="h-4 w-4 shrink-0 text-primary" />
                  : <span className="h-4 w-4 shrink-0 rounded-full border-2 border-muted-foreground" />}
                <span className={cn(!child.photoConsentsComplete && 'text-muted-foreground')}>Приняты все согласия</span>
              </li>
              <li className="flex items-center gap-2">
                {child.characterStatus === 'APPROVED'
                  ? <Check className="h-4 w-4 shrink-0 text-primary" />
                  : <span className="h-4 w-4 shrink-0 rounded-full border-2 border-muted-foreground" />}
                <span className={cn(child.characterStatus !== 'APPROVED' && 'text-muted-foreground')}>
                  Создан и утверждён AI-персонаж
                  {child.characterStatus === 'GENERATING' && ' (генерация идёт)'}
                  {child.characterStatus === 'READY' && ' — осталось утвердить'}
                  {child.characterStatus === 'FAILED' && ' — генерация не удалась'}
                </span>
              </li>
            </ul>
            <Link href="/family" className="mt-3 inline-block text-sm font-medium text-primary hover:underline">
              Перейти в раздел «Семья» →
            </Link>
          </div>
        )}

        <div className={cn(child && !child.readyForLessons && 'pointer-events-none opacity-50')}>
          <StepLabel n={kids.length > 1 ? 2 : 1} text="Преподаватель" />
          <div className="grid gap-2 sm:grid-cols-2">
            {list.map((t) => {
              const selected = t.teacherId === activeTeacher?.teacherId;
              return (
                <button
                  key={t.teacherId}
                  type="button"
                  onClick={() => { setTeacherId(t.teacherId); setSelectedDay(''); }}
                  className={cn(
                    'rounded-xl border p-3 text-left transition',
                    selected ? 'border-primary bg-accent/50' : 'border-border hover:border-primary/40',
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground">
                      {t.name.slice(0, 1).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{t.name}</p>
                      <p className="text-xs text-muted-foreground">{t.slots.length} свободных слотов</p>
                    </div>
                  </div>
                  {t.bio && <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{t.bio}</p>}
                  {t.subjects.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {t.subjects.slice(0, 3).map((s) => (
                        <span key={s} className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{s}</span>
                      ))}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className={cn(child && !child.readyForLessons && 'pointer-events-none opacity-50')}>
          <StepLabel n={kids.length > 1 ? 3 : 2} text="Свободная дата" />
          <div className="rounded-xl border border-border p-3">
            <div className="mb-3 flex items-center justify-between">
              <button
                type="button"
                aria-label="Предыдущий месяц"
                onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
                className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm font-medium capitalize">{monthTitle(month)}</span>
              <button
                type="button"
                aria-label="Следующий месяц"
                onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
                className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[11px] text-muted-foreground">
              {WEEKDAYS.map((d) => <span key={d}>{d}</span>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {monthGrid(month).map((date) => {
                const key = dayKey(date);
                const inMonth = date.getMonth() === month.getMonth();
                const count = slotsByDay.get(key)?.length ?? 0;
                const selected = key === selectedDay;
                return (
                  <button
                    key={key}
                    type="button"
                    disabled={count === 0}
                    onClick={() => setSelectedDay(key)}
                    className={cn(
                      'relative flex h-10 flex-col items-center justify-center rounded-lg text-sm transition',
                      !inMonth && 'opacity-40',
                      count === 0 && 'cursor-default text-muted-foreground',
                      count > 0 && !selected && 'border border-primary/40 font-medium text-primary hover:bg-accent',
                      selected && 'bg-primary font-semibold text-primary-foreground',
                      key === today && !selected && 'ring-1 ring-inset ring-border',
                    )}
                  >
                    {date.getDate()}
                    {count > 0 && !selected && <span className="absolute bottom-1 h-1 w-1 rounded-full bg-primary" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {selectedDay && (
          <div>
            <StepLabel n={kids.length > 1 ? 4 : 3} text="Время занятия" />
            {daySlots.length === 0 ? (
              <p className="text-sm text-muted-foreground">На этот день слотов не осталось.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {daySlots.map((s) => {
                  const credits = availableByDuration.get(s.durationMin) ?? 0;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      disabled={isLoading}
                      onClick={() => doBook(s.id, s.durationMin)}
                      title={credits > 0 ? undefined : `Нет оплаченных занятий на ${s.durationMin} мин`}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition disabled:opacity-50',
                        credits > 0 ? 'border-primary/40 text-primary hover:bg-accent' : 'border-border text-muted-foreground hover:border-primary/40',
                      )}
                    >
                      <Clock className="h-3.5 w-3.5" />
                      {new Date(s.startsAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                      <span className="text-xs opacity-70">· {s.durationMin} мин</span>
                    </button>
                  );
                })}
              </div>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              При записи списывается одно оплаченное занятие соответствующей длительности.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const CANCELLED_STATUSES = new Set(['CANCELLED_BY_PARENT', 'CANCELLED_BY_TEACHER', 'CANCELLED_BY_SYSTEM', 'NO_SHOW']);
const DONE_STATUSES = new Set(['COMPLETED', 'REPORT_SENT']);

function LessonRow({ lesson, onCancel }: { lesson: LessonDto; onCancel?: (lesson: LessonDto) => void }) {
  const live = lesson.status === 'IN_PROGRESS';
  const done = DONE_STATUSES.has(lesson.status);
  const cancelled = CANCELLED_STATUSES.has(lesson.status);
  const start = new Date(lesson.startsAt);
  // «Скоро» — можно заходить в комнату заранее, чтобы не опаздывать.
  const soon = !live && start.getTime() - Date.now() < 15 * 60 * 1000 && start.getTime() > Date.now() - 60 * 60 * 1000;

  return (
    <div className={cn('flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3', live ? 'border-primary bg-accent/40' : 'border-border')}>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 truncate text-sm font-medium">
          {lesson.childName}
          {live && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary-foreground" /> Урок идёт
            </span>
          )}
        </p>
        <p className="text-xs text-muted-foreground">
          {formatSlot(lesson.startsAt)} · {lesson.durationMin} мин · {lesson.teacherName}
          {lesson.topicTitle ? ` · ${lesson.topicTitle}` : ''}
        </p>
      </div>

      {done ? (
        <span className="inline-flex items-center gap-1 text-sm text-primary">
          <Check className="h-4 w-4" />
          {lesson.status === 'REPORT_SENT' ? 'Отчёт готов' : 'Проведён'}
        </span>
      ) : cancelled ? (
        <span className="text-sm text-muted-foreground">{LESSON_STATUS_LABELS[lesson.status]}</span>
      ) : (
        <Badge variant="outline">{LESSON_STATUS_LABELS[lesson.status]}</Badge>
      )}

      {(live || soon || lesson.status === 'READY') && (
        <Link href={`/lesson/${lesson.id}`}>
          <Button size="sm" variant={live ? 'default' : 'outline'}>
            <Video className="mr-1 h-3.5 w-3.5" /> {live ? 'Присоединиться' : 'Войти'}
          </Button>
        </Link>
      )}

      {onCancel && ACTIVE_STATUSES.has(lesson.status) && !live && (
        <button type="button" aria-label="Отменить" className="text-muted-foreground hover:text-destructive" onClick={() => onCancel(lesson)}>
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

function LessonGroup({ title, count, hint, children }: { title: string; count: number; hint?: string; children: React.ReactNode }) {
  if (count === 0) return null;
  return (
    <div className="space-y-2">
      <div className="flex items-baseline gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{count}</span>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function MyLessons() {
  // Поллинг: статус «урок идёт» ставит сервер при входе преподавателя в комнату.
  const { data, isLoading } = useGetLessonsQuery(undefined, { pollingInterval: 20000 });
  const [cancel] = useCancelLessonMutation();
  const lessons = data?.lessons ?? [];

  const doCancel = async (lesson: LessonDto) => {
    if (!window.confirm('Отменить урок? Занятие вернётся на баланс, если до начала ≥ 8 часов.')) return;
    const res = await cancel({ id: lesson.id }).unwrap().catch((err) => {
      toast({ title: 'Ошибка', description: apiErr(err), variant: 'destructive' });
      return null;
    });
    if (res) toast({ title: res.refunded ? 'Урок отменён, занятие возвращено на баланс' : 'Урок отменён (занятие сгорело)' });
  };

  if (isLoading) return <div className="h-20 animate-pulse rounded-xl bg-muted" />;

  const live = lessons.filter((l) => l.status === 'IN_PROGRESS');
  const upcoming = lessons
    .filter((l) => l.status !== 'IN_PROGRESS' && ACTIVE_STATUSES.has(l.status))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const past = lessons
    .filter((l) => DONE_STATUSES.has(l.status) || CANCELLED_STATUSES.has(l.status))
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt));
  const completedCount = past.filter((l) => DONE_STATUSES.has(l.status)).length;

  if (lessons.length === 0) {
    return (
      <Card className="border-border bg-card">
        <CardContent className="p-5 text-sm text-muted-foreground">
          Занятий пока нет. Запишитесь на первое — оно появится здесь.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Идёт сейчас', value: live.length },
          { label: 'Предстоящие', value: upcoming.length },
          { label: 'Проведено', value: completedCount },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border border-border bg-card p-3 text-center">
            <p className="text-2xl font-semibold">{stat.value}</p>
            <p className="text-xs text-muted-foreground">{stat.label}</p>
          </div>
        ))}
      </div>

      <LessonGroup title="Идёт сейчас" count={live.length} hint="преподаватель уже в классе">
        {live.map((l) => <LessonRow key={l.id} lesson={l} />)}
      </LessonGroup>

      <LessonGroup title="Предстоящие занятия" count={upcoming.length}>
        {upcoming.map((l) => <LessonRow key={l.id} lesson={l} onCancel={doCancel} />)}
      </LessonGroup>

      <LessonGroup title="Прошедшие занятия" count={past.length}>
        {past.map((l) => <LessonRow key={l.id} lesson={l} />)}
      </LessonGroup>
    </div>
  );
}

export default function LessonsPage() {
  const [buyOpen, setBuyOpen] = useState(false);
  return (
    <AuthGuard>
      <div className="academy-theme min-h-screen">
        <div className="mx-auto max-w-3xl space-y-6 px-4 py-10">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">
              <CalendarClock className="h-3.5 w-3.5" /> Занятия
            </div>
            <h1 className="text-3xl font-bold tracking-tight">Уроки и абонементы</h1>
          </div>
          <BalanceCard onBuy={() => setBuyOpen(true)} />
          <BookingSection />
          <MyLessons />
        </div>
        {buyOpen && <PackagesModal onClose={() => setBuyOpen(false)} />}
      </div>
    </AuthGuard>
  );
}
