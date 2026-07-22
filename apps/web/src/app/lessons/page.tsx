'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CalendarClock, Check, Clock, Loader2, Video, Wallet, X } from 'lucide-react';
import { LESSON_STATUS_LABELS, type LessonPackageOption } from '@allvision/shared';
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

function BookingSection() {
  const children = useListChildrenQuery();
  const teachers = useGetTeachersQuery();
  const [book, { isLoading }] = useBookLessonMutation();
  const [childId, setChildId] = useState<string>('');
  const kids = children.data?.items ?? [];
  const activeChild = childId || kids[0]?.id || '';

  const doBook = async (slotId: string) => {
    if (!activeChild) {
      toast({ title: 'Добавьте профиль ребёнка', variant: 'destructive' });
      return;
    }
    try {
      await book({ childId: activeChild, slotId }).unwrap();
      toast({ title: 'Урок забронирован' });
    } catch (err) {
      toast({ title: 'Не удалось записать', description: apiErr(err), variant: 'destructive' });
    }
  };

  const list = teachers.data?.teachers ?? [];

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold">Записаться на урок</h2>
      {kids.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {kids.map((k) => (
            <button
              key={k.id}
              type="button"
              onClick={() => setChildId(k.id)}
              className={cn('rounded-full border px-3 py-1.5 text-sm', k.id === activeChild ? 'border-primary bg-accent text-accent-foreground' : 'border-border text-muted-foreground')}
            >
              {k.name}
            </button>
          ))}
        </div>
      )}
      {teachers.isLoading ? (
        <div className="h-20 animate-pulse rounded-xl bg-muted" />
      ) : list.length === 0 ? (
        <p className="rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">
          Пока нет преподавателей со свободными слотами.
        </p>
      ) : (
        list.map((t) => (
          <Card key={t.teacherId} className="border-border bg-card">
            <CardContent className="p-4">
              <p className="font-medium">{t.name}</p>
              {t.bio && <p className="mb-2 text-sm text-muted-foreground">{t.bio}</p>}
              <div className="flex flex-wrap gap-1.5">
                {t.slots.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    disabled={isLoading}
                    onClick={() => doBook(s.id)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 px-3 py-1.5 text-sm text-primary transition hover:bg-accent disabled:opacity-50"
                  >
                    <Clock className="h-3.5 w-3.5" /> {formatSlot(s.startsAt)} · {s.durationMin}м
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

function MyLessons() {
  const { data, isLoading } = useGetLessonsQuery();
  const [cancel] = useCancelLessonMutation();
  const lessons = data?.lessons ?? [];

  if (isLoading) return <div className="h-20 animate-pulse rounded-xl bg-muted" />;
  if (lessons.length === 0) return null;

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold">Мои уроки</h2>
      <div className="space-y-2">
        {lessons.map((l) => {
          const active = ACTIVE_STATUSES.has(l.status);
          return (
            <div key={l.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{l.childName} · {l.teacherName}</p>
                <p className="text-xs text-muted-foreground">{formatSlot(l.startsAt)} · {l.durationMin} мин</p>
              </div>
              <Badge variant="outline" className={cn(l.status === 'COMPLETED' && 'border-primary/40 text-primary')}>
                {LESSON_STATUS_LABELS[l.status]}
              </Badge>
              {['READY', 'IN_PROGRESS'].includes(l.status) && (
                <Link href={`/lesson/${l.id}`}><Button size="sm"><Video className="mr-1 h-3.5 w-3.5" /> Войти</Button></Link>
              )}
              {active && (
                <button
                  type="button"
                  aria-label="Отменить"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={async () => {
                    if (!window.confirm('Отменить урок? Кредит вернётся, если до занятия ≥ 8 часов.')) return;
                    const res = await cancel({ id: l.id }).unwrap().catch((err) => { toast({ title: 'Ошибка', description: apiErr(err), variant: 'destructive' }); return null; });
                    if (res) toast({ title: res.refunded ? 'Урок отменён, кредит возвращён' : 'Урок отменён (кредит сгорел)' });
                  }}
                >
                  <X className="h-4 w-4" />
                </button>
              )}
              {l.status === 'COMPLETED' && <Check className="h-4 w-4 text-primary" />}
            </div>
          );
        })}
      </div>
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
