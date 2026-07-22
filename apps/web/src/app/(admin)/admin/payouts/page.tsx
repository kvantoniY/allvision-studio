'use client';

import { useState } from 'react';
import { CheckCircle2, FileCheck2, HandCoins, Loader2, XCircle } from 'lucide-react';
import { EARNING_STATUS_LABELS, type EarningStatusValue } from '@allvision/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import {
  useListPayoutsQuery,
  usePayPayoutMutation,
  usePreparePayoutMutation,
  useRejectPayoutMutation,
} from '@/store/api/admin-payouts-api';

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function apiError(error: unknown): string {
  return (error as { data?: { error?: { message?: string } } })?.data?.error?.message ?? 'Операция не выполнена';
}

const STATUS_CLASS: Record<EarningStatusValue, string> = {
  PENDING: 'border-amber-500/30 bg-amber-500/10 text-amber-800',
  AVAILABLE: 'border-sky-500/30 bg-sky-500/10 text-sky-800',
  PAID: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800',
  REJECTED: 'border-destructive/30 bg-destructive/10 text-destructive',
};

export default function AdminPayoutsPage() {
  const now = new Date();
  const [periodStart, setPeriodStart] = useState(isoDate(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))));
  const [periodEnd, setPeriodEnd] = useState(isoDate(now));
  const query = useListPayoutsQuery({ periodStart, periodEnd });
  const [prepare, prepareState] = usePreparePayoutMutation();
  const [pay, payState] = usePayPayoutMutation();
  const [reject, rejectState] = useRejectPayoutMutation();
  const [proofs, setProofs] = useState<Record<string, File | undefined>>({});

  const prepareFor = async (teacherId: string) => {
    try {
      await prepare({ teacherId, period: { periodStart, periodEnd } }).unwrap();
      toast({ title: 'Выплата сформирована', description: 'Начисления закреплены за выбранным периодом.' });
    } catch (error) {
      toast({ title: 'Не удалось сформировать выплату', description: apiError(error), variant: 'destructive' });
    }
  };

  const payNow = async (payoutId: string) => {
    const proof = proofs[payoutId];
    if (!proof) return;
    if (!window.confirm('Подтвердить ручной перевод и отметить начисления выплаченными?')) return;
    try {
      await pay({ payoutId, proof }).unwrap();
      toast({ title: 'Выплата отмечена', description: 'Подтверждение сохранено в закрытом хранилище.' });
    } catch (error) {
      toast({ title: 'Не удалось отметить выплату', description: apiError(error), variant: 'destructive' });
    }
  };

  const rejectNow = async (payoutId: string) => {
    const reason = window.prompt('Причина отклонения или корректировки:')?.trim();
    if (!reason) return;
    try {
      await reject({ payoutId, reason }).unwrap();
      toast({ title: 'Выплата отклонена', description: 'Начисления помечены как корректировка.' });
    } catch (error) {
      toast({ title: 'Не удалось отклонить выплату', description: apiError(error), variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-6">
      <div><h1 className="flex items-center gap-2 text-3xl font-bold text-foreground"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-accent-foreground"><HandCoins className="h-6 w-6" /></span> Выплаты преподавателям</h1><p className="mt-2 text-sm text-muted-foreground">Ручная выплата доступных начислений по периоду. Регламентный день — 5-е число; подтверждение обязательно.</p></div>
      <Card className="border-border bg-card shadow-sm"><CardHeader><CardTitle className="text-base">Период начислений</CardTitle></CardHeader><CardContent className="flex flex-wrap items-end gap-3"><div><Label>С</Label><Input type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} className="mt-1 w-44" /></div><div><Label>По</Label><Input type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} className="mt-1 w-44" /></div>{query.isFetching && <Loader2 className="mb-2 h-5 w-5 animate-spin text-primary" />}</CardContent></Card>
      <div className="space-y-3">
        {query.data?.teachers.length === 0 && <Card className="border-dashed border-border bg-card"><CardContent className="p-8 text-center text-muted-foreground">За выбранный период начислений нет.</CardContent></Card>}
        {query.data?.teachers.map((teacher) => (
          <Card key={teacher.teacherId} className="border-border bg-card shadow-sm">
            <CardContent className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold text-foreground">{teacher.teacherName}</p><p className="mt-1 text-xs text-muted-foreground">Ожидает: {teacher.pendingRub.toLocaleString('ru-RU')} ₽ · доступно: {teacher.availableRub.toLocaleString('ru-RU')} ₽ ({teacher.availableCount}) · выплачено: {teacher.paidRub.toLocaleString('ru-RU')} ₽</p></div>{teacher.payout ? <Badge variant="outline" className={STATUS_CLASS[teacher.payout.status]}>{EARNING_STATUS_LABELS[teacher.payout.status]}</Badge> : <Button size="sm" disabled={teacher.availableCount === 0 || prepareState.isLoading} onClick={() => void prepareFor(teacher.teacherId)}>Сформировать {teacher.availableRub.toLocaleString('ru-RU')} ₽</Button>}</div>
              {teacher.payout && <div className="mt-4 rounded-xl border border-border bg-secondary/40 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm text-foreground">{teacher.payout.amountRub.toLocaleString('ru-RU')} ₽ · {teacher.payout.earningsCount} занятий · {teacher.payout.periodStart}—{teacher.payout.periodEnd}</p>{teacher.payout.confirmationFileUrl && <a href={teacher.payout.confirmationFileUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline"><FileCheck2 className="h-4 w-4" /> {teacher.payout.confirmationFileName}</a>}</div>
                {teacher.payout.status === 'AVAILABLE' && <div className="mt-3 flex flex-wrap items-center gap-2"><Input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="max-w-sm" onChange={(event) => setProofs((current) => ({ ...current, [teacher.payout!.id]: event.target.files?.[0] }))} /><Button size="sm" disabled={!proofs[teacher.payout.id] || payState.isLoading} onClick={() => void payNow(teacher.payout!.id)}><CheckCircle2 className="mr-1.5 h-4 w-4" /> Выплачено</Button><Button size="sm" variant="destructive" disabled={rejectState.isLoading} onClick={() => void rejectNow(teacher.payout!.id)}><XCircle className="mr-1.5 h-4 w-4" /> Корректировка</Button></div>}
                {teacher.payout.rejectionReason && <p className="mt-2 text-xs text-destructive">Причина: {teacher.payout.rejectionReason}</p>}
              </div>}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
