'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import {
  useConfirmAdminPaymentMutation,
  useGetAdminPaymentQuery,
  useMarkAdminPaymentFailedMutation,
  useRecheckAdminPaymentMutation,
  type AdminPaymentStatus,
} from '@/store/api/admin-payments-api';

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

function apiErrorMessage(error: unknown) {
  return (error as { data?: { error?: { message?: string } } })?.data?.error?.message ?? 'Операция не выполнена';
}

export default function AdminPaymentDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { toast } = useToast();
  const payment = useGetAdminPaymentQuery(id);
  const [recheck, recheckState] = useRecheckAdminPaymentMutation();
  const [confirm, confirmState] = useConfirmAdminPaymentMutation();
  const [markFailed, markFailedState] = useMarkAdminPaymentFailedMutation();

  if (payment.isLoading || !payment.data) {
    return <div className="text-slate-400">Загрузка платежа...</div>;
  }

  const detail = payment.data.payment;
  const metadata = (detail.metadata && typeof detail.metadata === 'object' && !Array.isArray(detail.metadata)
    ? detail.metadata
    : {}) as Record<string, unknown>;
  const webhookTraces = Array.isArray(metadata.webhookTraces) ? (metadata.webhookTraces as unknown[]) : [];

  const onRecheck = async () => {
    try {
      const result = await recheck(detail.id).unwrap();
      toast({ title: `Статус Робокассы: ${STATUS_LABEL[result.status]}` });
    } catch (error) {
      toast({ title: 'Не удалось проверить статус', description: apiErrorMessage(error), variant: 'destructive' });
    }
  };

  const onConfirm = async () => {
    if (!window.confirm('Подтвердить платёж вручную? Токены будут зачислены пользователю.')) return;
    try {
      const result = await confirm(detail.id).unwrap();
      toast({
        title: 'Платёж подтверждён',
        description: result.tokensAdded ? `Зачислено токенов: ${result.tokensAdded}` : undefined,
      });
    } catch (error) {
      toast({ title: 'Не удалось подтвердить', description: apiErrorMessage(error), variant: 'destructive' });
    }
  };

  const onMarkFailed = async () => {
    if (!window.confirm('Пометить как FAILED? Это для платежей, по которым деньги точно не пришли.')) return;
    try {
      await markFailed(detail.id).unwrap();
      toast({ title: 'Платёж помечен как FAILED' });
    } catch (error) {
      toast({ title: 'Не удалось пометить', description: apiErrorMessage(error), variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/payments" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white">
          <ArrowLeft className="h-4 w-4" /> К списку платежей
        </Link>
        <h1 className="mt-3 text-3xl font-bold text-white">Платёж #{detail.id.slice(0, 8)}</h1>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <Card className="border-zinc-800 bg-zinc-950">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Сведения</span>
              <Badge className={STATUS_COLOR[detail.status]}>{STATUS_LABEL[detail.status]}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label="Создан">{new Date(detail.createdAt).toLocaleString('ru-RU')}</Row>
            <Row label="Оплачен">{detail.paidAt ? new Date(detail.paidAt).toLocaleString('ru-RU') : '—'}</Row>
            <Row label="Сумма">{(detail.amountRub / 100).toLocaleString('ru-RU')} ₽</Row>
            <Row label="Назначение">{detail.purpose === 'TOPUP' ? 'Пополнение токенов' : 'Заказ'}</Row>
            <Row label="Токенов к зачислению">{detail.tokensAdded ?? '—'}</Row>
            <Row label="Провайдер">{detail.provider}</Row>
            <Row label="InvId (provider id)">
              <code className="font-mono text-xs">{detail.providerPaymentId ?? '—'}</code>
            </Row>
            <Row label="Пользователь">
              <Link href={`/admin/users/${detail.user.id}`} className="text-violet-200 hover:underline">
                {detail.user.email}
              </Link>{' '}
              · баланс {detail.user.tokenBalance}
            </Row>
            {payment.data.tokenTransaction ? (
              <Row label="TokenTransaction">
                <span className="text-emerald-300">
                  +{payment.data.tokenTransaction.amount} (баланс после: {payment.data.tokenTransaction.balanceAfter}),
                  {' '}
                  {new Date(payment.data.tokenTransaction.createdAt).toLocaleString('ru-RU')}
                </span>
              </Row>
            ) : (
              <Row label="TokenTransaction">
                <span className="text-yellow-400">не создана</span>
              </Row>
            )}
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-zinc-950">
          <CardHeader>
            <CardTitle>Действия</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button onClick={onRecheck} disabled={recheckState.isLoading} className="w-full">
              {recheckState.isLoading ? 'Проверяем...' : 'Проверить через Робокассу'}
            </Button>
            <Button
              onClick={onConfirm}
              disabled={detail.status === 'SUCCEEDED' || confirmState.isLoading}
              variant="default"
              className="w-full bg-emerald-600 hover:bg-emerald-500"
            >
              {confirmState.isLoading ? 'Подтверждаем...' : 'Подтвердить вручную и зачислить токены'}
            </Button>
            <Button
              onClick={onMarkFailed}
              disabled={detail.status === 'SUCCEEDED' || markFailedState.isLoading}
              variant="outline"
              className="w-full border-red-500/40 text-red-300"
            >
              {markFailedState.isLoading ? 'Помечаем...' : 'Пометить как FAILED'}
            </Button>
            <p className="text-xs text-slate-500">
              «Проверить» сходит в OpStateExt Робокассы и применит результат. «Подтвердить вручную» — для случаев,
              когда деньги точно пришли (видны в кабинете Робокассы), но webhook не дошёл.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-zinc-800 bg-zinc-950">
        <CardHeader>
          <CardTitle>История webhook-ов и редиректов</CardTitle>
        </CardHeader>
        <CardContent>
          {webhookTraces.length === 0 ? (
            <p className="text-sm text-slate-500">
              Робокасса ещё не присылала webhook для этого платежа. Если деньги списаны — нажмите «Проверить через
              Робокассу» или «Подтвердить вручную».
            </p>
          ) : (
            <div className="space-y-3">
              {webhookTraces.map((trace, idx) => {
                const t = trace as Record<string, unknown>;
                return (
                  <div key={idx} className="rounded-md border border-zinc-800 bg-zinc-900 p-3 text-xs">
                    <div className="flex items-center justify-between text-slate-300">
                      <span>
                        {String(t.receivedAt ?? '')} · {String(t.source ?? '')}
                      </span>
                      <Badge className={t.ok ? 'bg-emerald-600' : 'bg-red-600'}>
                        {t.ok ? 'OK' : 'FAIL'}
                      </Badge>
                    </div>
                    {t.error ? (
                      <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-red-300">{String(t.error)}</pre>
                    ) : null}
                    {t.bodyPreview ? (
                      <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-slate-400">
                        {String(t.bodyPreview)}
                      </pre>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-zinc-800 bg-zinc-950">
        <CardHeader>
          <CardTitle>Сырой metadata</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="overflow-x-auto rounded-md bg-zinc-900 p-3 text-xs text-slate-300">
            {JSON.stringify(metadata, null, 2)}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap gap-x-3">
      <span className="min-w-[160px] text-slate-500">{label}</span>
      <span className="text-slate-200">{children}</span>
    </div>
  );
}
