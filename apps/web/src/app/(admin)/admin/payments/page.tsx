'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, RefreshCw, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import {
  type AdminPaymentStatus,
  useConfirmAdminPaymentMutation,
  useListAdminPaymentsQuery,
  useRecheckAdminPaymentMutation,
} from '@/store/api/admin-payments-api';
import {
  useGetPaymentsHealthQuery,
  useProbeRobokassaMutation,
} from '@/store/api/admin-diagnostics-api';

type StatusFilter = 'all' | AdminPaymentStatus;

const STATUS_LABEL: Record<AdminPaymentStatus, string> = {
  PENDING: 'Ожидает',
  SUCCEEDED: 'Оплачен',
  FAILED: 'Ошибка',
  CANCELLED: 'Отменён',
};

const STATUS_COLOR: Record<AdminPaymentStatus, string> = {
  PENDING: 'bg-yellow-600',
  SUCCEEDED: 'bg-emerald-600',
  FAILED: 'bg-red-600',
  CANCELLED: 'bg-zinc-600',
};

export default function AdminPaymentsPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [bulkRunning, setBulkRunning] = useState(false);
  const [probeInvId, setProbeInvId] = useState('');
  const [probeResult, setProbeResult] = useState<{ ok: boolean; text: string } | null>(null);
  const { toast } = useToast();

  const [rowBusyId, setRowBusyId] = useState<string | null>(null);
  const [rowBusyAction, setRowBusyAction] = useState<'recheck' | 'confirm' | null>(null);

  const health = useGetPaymentsHealthQuery();
  const payments = useListAdminPaymentsQuery({
    page,
    limit: 50,
    status: status === 'all' ? undefined : status,
    search: search.trim() || undefined,
  });
  const [recheckAdmin] = useRecheckAdminPaymentMutation();
  const [confirmAdmin] = useConfirmAdminPaymentMutation();
  const [probeRobokassa, probeState] = useProbeRobokassaMutation();

  const handleRowRecheck = async (paymentId: string) => {
    setRowBusyId(paymentId);
    setRowBusyAction('recheck');
    try {
      const result = await recheckAdmin(paymentId).unwrap();
      toast({
        title: `Статус: ${result.status}`,
        description: result.tokensAdded ? `Зачислено: ${result.tokensAdded}` : undefined,
      });
    } catch (e) {
      toast({ title: 'Не удалось проверить', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setRowBusyId(null);
      setRowBusyAction(null);
    }
  };

  const handleRowConfirm = async (paymentId: string, amountRub: number, email: string) => {
    if (!window.confirm(`Подтвердить платёж на ${(amountRub / 100).toLocaleString('ru-RU')} ₽ от ${email} и зачислить токены?`)) return;
    setRowBusyId(paymentId);
    setRowBusyAction('confirm');
    try {
      const result = await confirmAdmin(paymentId).unwrap();
      toast({
        title: 'Платёж подтверждён',
        description: result.tokensAdded ? `Зачислено токенов: ${result.tokensAdded}` : undefined,
      });
    } catch (e) {
      toast({ title: 'Не удалось подтвердить', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setRowBusyId(null);
      setRowBusyAction(null);
    }
  };

  const totalPages = Math.max(1, Math.ceil((payments.data?.total ?? 0) / (payments.data?.limit ?? 50)));

  const bulkRecheckPending = async () => {
    if (bulkRunning) return;
    if (!window.confirm('Запустить проверку всех PENDING платежей через Робокассу?')) return;
    setBulkRunning(true);
    let updated = 0;
    let failed = 0;
    try {
      let p = 1;
      while (true) {
        const batch = await fetch(`/api/admin/payments?status=PENDING&page=${p}&limit=50`, {
          credentials: 'include',
        }).then((res) => res.json());
        const items = batch.items as Array<{ id: string }>;
        if (!items.length) break;
        for (const item of items) {
          try {
            await recheckAdmin(item.id).unwrap();
            updated += 1;
          } catch {
            failed += 1;
          }
        }
        if (items.length < 50) break;
        p += 1;
      }
      toast({ title: `Готово`, description: `проверено: ${updated}, ошибок: ${failed}` });
    } finally {
      setBulkRunning(false);
    }
  };

  const onProbe = async () => {
    if (!probeInvId.trim()) return;
    setProbeResult(null);
    try {
      const res = await probeRobokassa(probeInvId.trim()).unwrap();
      setProbeResult({
        ok: res.ok,
        text: res.ok
          ? `OK · providerStatus = ${res.providerStatus} (${res.elapsedMs}ms)`
          : `FAIL · ${res.errorCode ?? 'ERROR'}: ${res.error ?? ''} (${res.elapsedMs}ms)`,
      });
    } catch (e) {
      setProbeResult({ ok: false, text: `Запрос упал: ${(e as Error).message}` });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Платежи</h1>
        <p className="mt-2 text-sm text-slate-400">
          Все рублёвые платежи, статусы Робокассы, ручная проверка и подтверждение проблемных платежей.
        </p>
      </div>

      {health.data ? <HealthPanel data={health.data} /> : null}

      <Card className="border-zinc-800 bg-zinc-950">
        <CardHeader>
          <CardTitle className="text-base">Быстрые действия</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Button onClick={bulkRecheckPending} disabled={bulkRunning} className="gap-2">
            <RefreshCw className={`h-4 w-4 ${bulkRunning ? 'animate-spin' : ''}`} />
            {bulkRunning ? 'Проверяем PENDING...' : 'Проверить все PENDING через Робокассу'}
          </Button>
          <div className="flex items-center gap-2">
            <Input
              value={probeInvId}
              onChange={(event) => setProbeInvId(event.target.value)}
              placeholder="InvId"
              className="w-40"
            />
            <Button variant="outline" onClick={onProbe} disabled={probeState.isLoading || !probeInvId.trim()}>
              {probeState.isLoading ? 'Опрос...' : 'Проверить InvId'}
            </Button>
            {probeResult ? (
              <span className={probeResult.ok ? 'text-sm text-emerald-300' : 'text-sm text-red-300'}>
                {probeResult.text}
              </span>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 rounded-lg border border-zinc-800 bg-zinc-950 p-4 md:grid-cols-3">
        <select
          value={status}
          onChange={(event) => {
            setPage(1);
            setStatus(event.target.value as StatusFilter);
          }}
          className="h-10 rounded-md border border-zinc-800 bg-zinc-900 px-3 text-sm text-slate-100"
        >
          <option value="all">Все статусы</option>
          <option value="PENDING">Ожидает</option>
          <option value="SUCCEEDED">Оплачен</option>
          <option value="FAILED">Ошибка</option>
          <option value="CANCELLED">Отменён</option>
        </select>
        <div className="relative md:col-span-2">
          <Search className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
          <Input
            value={search}
            onChange={(event) => {
              setPage(1);
              setSearch(event.target.value);
            }}
            placeholder="Поиск по ID платежа, InvId или email"
            className="pl-9"
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-zinc-800">
        <table className="min-w-full divide-y divide-zinc-800 text-left text-sm">
          <thead className="bg-zinc-950 text-xs uppercase text-slate-400">
            <tr>
              <th className="px-4 py-3">Дата</th>
              <th className="px-4 py-3">Пользователь</th>
              <th className="px-4 py-3">Сумма</th>
              <th className="px-4 py-3">Назначение</th>
              <th className="px-4 py-3">InvId</th>
              <th className="px-4 py-3">Статус</th>
              <th className="px-4 py-3">Зачислено</th>
              <th className="px-4 py-3 text-right">Действия</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800 bg-zinc-900/60">
            {payments.isLoading && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                  Загрузка...
                </td>
              </tr>
            )}
            {(payments.data?.items ?? []).map((payment) => (
              <tr key={payment.id} className="hover:bg-zinc-900">
                <td className="px-4 py-3 text-slate-300 whitespace-nowrap">
                  <Link href={`/admin/payments/${payment.id}`} className="text-rose-200 hover:underline">
                    {new Date(payment.createdAt).toLocaleString('ru-RU')}
                  </Link>
                </td>
                <td className="px-4 py-3 font-medium text-white">
                  <Link href={`/admin/users/${payment.user.id}`} className="hover:text-rose-200">
                    {payment.user.email}
                  </Link>
                </td>
                <td className="px-4 py-3 font-semibold text-amber-300 whitespace-nowrap">
                  {(payment.amountRub / 100).toLocaleString('ru-RU')} ₽
                </td>
                <td className="px-4 py-3">{payment.purpose === 'TOPUP' ? 'Пополнение' : 'Заказ'}</td>
                <td className="px-4 py-3 font-mono text-xs text-slate-400">
                  {payment.providerPaymentId ?? '—'}
                </td>
                <td className="px-4 py-3">
                  <Badge className={STATUS_COLOR[payment.status]}>{STATUS_LABEL[payment.status]}</Badge>
                </td>
                <td className="px-4 py-3 text-slate-400">{payment.tokensAdded ?? '—'}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {payment.status !== 'SUCCEEDED' ? (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={rowBusyId === payment.id}
                          onClick={() => handleRowRecheck(payment.id)}
                          title="Сходить в Robokassa OpStateExt и применить ответ"
                        >
                          {rowBusyId === payment.id && rowBusyAction === 'recheck' ? '...' : 'Проверить'}
                        </Button>
                        <Button
                          size="sm"
                          className="bg-emerald-600 hover:bg-emerald-500"
                          disabled={rowBusyId === payment.id}
                          onClick={() => handleRowConfirm(payment.id, payment.amountRub, payment.user.email)}
                          title="Подтвердить вручную и зачислить токены"
                        >
                          {rowBusyId === payment.id && rowBusyAction === 'confirm' ? '...' : 'Зачислить'}
                        </Button>
                      </>
                    ) : null}
                    <Button asChild size="sm" variant="ghost">
                      <Link href={`/admin/payments/${payment.id}`}>Открыть</Link>
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {!payments.isLoading && (payments.data?.items.length ?? 0) === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                  Платежи не найдены
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-500">
          Страница {page} из {totalPages}
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
            Назад
          </Button>
          <Button type="button" variant="outline" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)}>
            Вперёд
          </Button>
        </div>
      </div>
    </div>
  );
}

function HealthPanel({ data }: { data: NonNullable<ReturnType<typeof useGetPaymentsHealthQuery>['data']> }) {
  const issues: Array<{ severity: 'warn' | 'critical'; text: string }> = [];

  if (data.provider !== 'robokassa') {
    issues.push({
      severity: 'critical',
      text: `PAYMENT_PROVIDER = "${data.provider}" — Robokassa отключена. Реальные платежи не обрабатываются.`,
    });
  }
  if (data.provider === 'robokassa' && !data.providerConfigured) {
    issues.push({
      severity: 'critical',
      text: 'Не заданы ROBOKASSA_MERCHANT_LOGIN / PASSWORD1 / PASSWORD2 в env.',
    });
  }
  if (!data.poller.enabled) {
    issues.push({
      severity: 'warn',
      text: 'Pending-poller выключен (PAYMENT_PENDING_POLL_ENABLED=0). Платежи не будут автоматически проверяться.',
    });
  }
  if (data.isTestMode) {
    issues.push({
      severity: 'warn',
      text: 'ROBOKASSA_TEST_MODE=1 — Робокасса не списывает реальные деньги, и OpStateExt всегда возвращает pending.',
    });
  }

  const lastSuccessAgeHours = data.lastSuccess?.paidAt
    ? Math.round((Date.now() - Date.parse(data.lastSuccess.paidAt)) / 3_600_000)
    : null;
  if (data.pending.total > 5 && (lastSuccessAgeHours == null || lastSuccessAgeHours > 24)) {
    issues.push({
      severity: 'warn',
      text: `${data.pending.total} платежей в PENDING, последний успешный — ${lastSuccessAgeHours == null ? 'никогда' : `${lastSuccessAgeHours} ч назад`}. Возможно, webhook от Робокассы не приходит.`,
    });
  }

  return (
    <Card className="border-zinc-800 bg-zinc-950">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {issues.some((i) => i.severity === 'critical') ? (
            <AlertTriangle className="h-5 w-5 text-red-400" />
          ) : issues.length > 0 ? (
            <AlertTriangle className="h-5 w-5 text-yellow-400" />
          ) : (
            <CheckCircle2 className="h-5 w-5 text-emerald-400" />
          )}
          Состояние платёжной системы
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {issues.length === 0 ? (
          <p className="text-emerald-300">Конфигурация выглядит корректно.</p>
        ) : (
          <ul className="space-y-1">
            {issues.map((issue, idx) => (
              <li
                key={idx}
                className={issue.severity === 'critical' ? 'text-red-300' : 'text-yellow-300'}
              >
                {issue.severity === 'critical' ? '⛔ ' : '⚠ '}
                {issue.text}
              </li>
            ))}
          </ul>
        )}

        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <Cell label="Провайдер">{data.provider}</Cell>
          <Cell label="Merchant Login">{data.merchantLogin ?? '—'}</Cell>
          <Cell label="Hash алгоритм">{data.hashAlgorithm}</Cell>
          <Cell label="Test mode">{data.isTestMode ? 'ВКЛЮЧЁН' : 'выкл'}</Cell>
          <Cell label="Poller">
            {data.poller.enabled ? `включён каждые ${Math.round(data.poller.intervalMs / 1000)}с` : 'выключен'}
          </Cell>
          <Cell label="API uptime">{Math.round(data.apiUptimeSeconds / 60)} мин</Cell>
          <Cell label="PENDING всего">{data.pending.total}</Cell>
          <Cell label="Последний успешный">
            {data.lastSuccess?.paidAt
              ? `${new Date(data.lastSuccess.paidAt).toLocaleString('ru-RU')}${
                  lastSuccessAgeHours != null ? ` (${lastSuccessAgeHours} ч назад)` : ''
                }`
              : 'нет'}
          </Cell>
          <Cell label="Result URL">
            <code className="text-xs text-slate-300">{data.expectedResultUrl}</code>
          </Cell>
          <Cell label="Success URL">
            <code className="text-xs text-slate-300">{data.expectedSuccessUrl}</code>
          </Cell>
        </div>

        <p className="text-xs text-slate-500">
          Result URL и Success URL должны быть указаны в личном кабинете Робокассы. Если у вас другие домены или
          контейнеры не пересобрались — поправьте PUBLIC_API_URL.
        </p>
      </CardContent>
    </Card>
  );
}

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap gap-2">
      <span className="min-w-[160px] text-slate-500">{label}</span>
      <span className="text-slate-200">{children}</span>
    </div>
  );
}
