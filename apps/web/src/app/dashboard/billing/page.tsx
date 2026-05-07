'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useDispatch } from 'react-redux';
import { Coins, Wallet } from 'lucide-react';
import type { Payment } from '@allvision/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import type { AppDispatch } from '@/store';
import { useGetTransactionsQuery, useGetPaymentsQuery } from '@/store/api/account-api';
import { invalidatePaymentSideEffects, useTopupMutation } from '@/store/api/payments-api';
import { TransactionRow } from '@/components/dashboard/TransactionRow';
import { PaymentRow } from '@/components/dashboard/PaymentRow';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { cn } from '@/lib/utils';

type TxFilter = 'all' | 'topup' | 'spending';

const PAGE = 20;

export default function BillingPage() {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const dispatch = useDispatch<AppDispatch>();
  const { toast } = useToast();
  const [txTab, setTxTab] = useState<'transactions' | 'payments'>('transactions');
  const [txFilter, setTxFilter] = useState<TxFilter>('all');
  const [txPage, setTxPage] = useState(1);
  const [payPage, setPayPage] = useState(1);
  const [pollPending, setPollPending] = useState(false);
  const [repeatingPaymentId, setRepeatingPaymentId] = useState<string | null>(null);
  const pendingIdsRef = useRef<Set<string>>(new Set());
  const handledPaymentQueryRef = useRef('');
  const [topup, { isLoading: isRepeating }] = useTopupMutation();

  const { data: txData, isLoading: txLoading } = useGetTransactionsQuery({
    page: txPage,
    limit: PAGE,
    type: txFilter,
  });
  const { data: payData, isLoading: payLoading } = useGetPaymentsQuery(
    {
      page: payPage,
      limit: PAGE,
    },
    { pollingInterval: pollPending ? 5000 : 0 },
  );

  useEffect(() => {
    const paymentResult = searchParams.get('payment');
    if (!paymentResult) return;
    const currentQuery = searchParams.toString();
    if (handledPaymentQueryRef.current === currentQuery) return;
    handledPaymentQueryRef.current = currentQuery;

    const tokens = Number(searchParams.get('tokens') ?? 0);

    if (paymentResult === 'success') {
      toast({
        title: tokens > 0 ? `Оплата прошла успешно! +${tokens} коинов на ваш баланс` : 'Оплата прошла успешно!',
      });
      invalidatePaymentSideEffects(dispatch);
    }
    if (paymentResult === 'failed') {
      toast({ title: 'Платёж не прошёл', description: 'Платёж отклонён банком', variant: 'destructive' });
      invalidatePaymentSideEffects(dispatch);
    }
    if (paymentResult === 'cancelled') {
      toast({ title: 'Платёж отменён' });
      invalidatePaymentSideEffects(dispatch);
    }

    const params = new URLSearchParams(searchParams.toString());
    params.delete('payment');
    params.delete('tokens');
    const nextQuery = params.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
  }, [dispatch, pathname, router, searchParams, toast]);

  useEffect(() => {
    const items = payData?.items ?? [];
    const previousPending = pendingIdsRef.current;
    const completed = items.find((payment) => previousPending.has(payment.id) && payment.status === 'SUCCEEDED');
    const nextPending = new Set(items.filter((payment) => payment.status === 'PENDING').map((payment) => payment.id));

    if (completed) {
      toast({
        title:
          completed.tokensAdded && completed.tokensAdded > 0
            ? `Оплата прошла успешно! +${completed.tokensAdded} коинов на ваш баланс`
            : 'Оплата прошла успешно!',
      });
      invalidatePaymentSideEffects(dispatch);
    }

    pendingIdsRef.current = nextPending;
    setPollPending(nextPending.size > 0);
  }, [dispatch, payData, toast]);

  const repeatPayment = async (payment: Payment) => {
    const metadata =
      payment.metadata && typeof payment.metadata === 'object' && !Array.isArray(payment.metadata)
        ? (payment.metadata as Record<string, unknown>)
        : {};
    const tokenPackageId = typeof metadata.tokenPackageId === 'string' ? metadata.tokenPackageId : null;

    if (!tokenPackageId) {
      toast({
        title: 'Не удалось повторить покупку',
        description: 'У платежа нет привязки к пакету коинов.',
        variant: 'destructive',
      });
      return;
    }

    setRepeatingPaymentId(payment.id);
    try {
      const result = await topup({ tokenPackageId }).unwrap();
      router.push(result.confirmationUrl);
    } catch {
      toast({
        title: 'Не удалось создать новый платёж',
        description: 'Попробуйте ещё раз через несколько секунд.',
        variant: 'destructive',
      });
    } finally {
      setRepeatingPaymentId(null);
    }
  };

  if (!user) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Биллинг</h1>
        <p className="mt-1 text-sm text-slate-400">История транзакций и платежей.</p>
      </div>

      <Card className="bg-gradient-to-br from-amber-500/10 to-orange-500/10 border-amber-500/30">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-6">
          <div className="flex items-center gap-4">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-amber-500/20 text-amber-400">
              <Coins className="h-6 w-6" />
            </span>
            <div>
              <div className="text-sm text-slate-300">Ваш баланс</div>
              <div className="text-3xl font-bold text-amber-400">
                {user.tokenBalance} <span className="text-base font-normal text-slate-300">коинов</span>
              </div>
            </div>
          </div>
          <Button asChild className="bg-amber-500 text-slate-950 hover:bg-amber-400">
            <Link href="/pricing">Пополнить</Link>
          </Button>
        </CardContent>
      </Card>

      <Tabs value={txTab} onValueChange={(v) => setTxTab(v as 'transactions' | 'payments')}>
        <TabsList>
          <TabsTrigger value="transactions">История транзакций</TabsTrigger>
          <TabsTrigger value="payments">История платежей</TabsTrigger>
        </TabsList>

        <TabsContent value="transactions" className="mt-4">
          <Card className="bg-slate-900 border-slate-800">
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <CardTitle className="text-lg">Транзакции коинов</CardTitle>
                <div className="flex flex-wrap gap-2">
                  {(['all', 'topup', 'spending'] as TxFilter[]).map((f) => (
                    <Button
                      key={f}
                      size="sm"
                      variant={txFilter === f ? 'default' : 'outline'}
                      className={cn(txFilter === f && 'bg-violet-600 hover:bg-violet-500')}
                      onClick={() => {
                        setTxFilter(f);
                        setTxPage(1);
                      }}
                    >
                      {f === 'all' ? 'Все' : f === 'topup' ? 'Только пополнения' : 'Только списания'}
                    </Button>
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {txLoading ? (
                <Skeleton className="h-32" />
              ) : !txData || txData.items.length === 0 ? (
                <EmptyState
                  size="md"
                  icon={<Wallet className="h-full w-full" />}
                  title="Транзакций нет"
                  description="При первой операции запись появится здесь"
                />
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead className="text-xs uppercase tracking-wide text-slate-400">
                        <tr className="border-b border-slate-800">
                          <th className="py-2 px-3">Дата</th>
                          <th className="py-2 px-3">Тип</th>
                          <th className="py-2 px-3">Описание</th>
                          <th className="py-2 px-3">Сумма</th>
                          <th className="py-2 px-3">Баланс</th>
                        </tr>
                      </thead>
                      <tbody>
                        {txData.items.map((tx) => (
                          <TransactionRow key={tx.id} tx={tx} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <Pagination
                    page={txData.page}
                    totalPages={txData.totalPages}
                    onChange={setTxPage}
                  />
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payments" className="mt-4">
          <Card className="bg-slate-900 border-slate-800">
            <CardHeader>
              <CardTitle className="text-lg">Рублёвые платежи</CardTitle>
            </CardHeader>
            <CardContent>
              {payLoading ? (
                <Skeleton className="h-32" />
              ) : !payData || payData.items.length === 0 ? (
                <EmptyState
                  size="md"
                  icon={<Wallet className="h-full w-full" />}
                  title="Платежей ещё не было"
                  description="Пополните баланс, чтобы начать пользоваться услугами"
                  actions={[{ label: 'Пополнить баланс', href: '/pricing' }]}
                />
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead className="text-xs uppercase tracking-wide text-slate-400">
                        <tr className="border-b border-slate-800">
                          <th className="py-2 px-3">Дата</th>
                          <th className="py-2 px-3">Сумма</th>
                          <th className="py-2 px-3">Куда</th>
                          <th className="py-2 px-3">Статус</th>
                          <th className="py-2 px-3">Действия</th>
                        </tr>
                      </thead>
                      <tbody>
                        {payData.items.map((p) => (
                          <PaymentRow
                            key={p.id}
                            payment={p}
                            onRepeat={repeatPayment}
                            isRepeating={isRepeating && repeatingPaymentId === p.id}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <Pagination
                    page={payData.page}
                    totalPages={payData.totalPages}
                    onChange={setPayPage}
                  />
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (p: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="mt-4 flex items-center justify-end gap-2">
      <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        Назад
      </Button>
      <span className="text-sm text-slate-400">
        {page} / {totalPages}
      </span>
      <Button
        size="sm"
        variant="outline"
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
      >
        Вперёд
      </Button>
    </div>
  );
}
