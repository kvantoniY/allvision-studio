'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AlertCircle, CheckCircle2, CreditCard, Loader2, LockKeyhole, WalletCards } from 'lucide-react';
import type { Payment } from '@allvision/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useGetPaymentQuery } from '@/store/api/payments-api';
import { cn } from '@/lib/utils';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:4000');

function metadataOf(payment: Payment | undefined) {
  if (!payment?.metadata || typeof payment.metadata !== 'object' || Array.isArray(payment.metadata)) {
    return {} as Record<string, unknown>;
  }
  return payment.metadata as Record<string, unknown>;
}

function paymentAmount(payment: Payment) {
  return (payment.amountRub / 100).toLocaleString('ru-RU');
}

function paymentDescription(payment: Payment) {
  const metadata = metadataOf(payment);
  if (payment.purpose === 'TOPUP') {
    const title = String(metadata.packageTitle ?? 'пакет токенов');
    return `Покупка пакета "${title}" (${payment.tokensAdded ?? 0} токенов)`;
  }
  return `Оплата заказа #${payment.id.slice(0, 8)}`;
}

export default function MockPaymentPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const paymentId = params.id;
  const { data: payment, isLoading, isError } = useGetPaymentQuery(paymentId, { skip: !paymentId });
  const [scenario, setScenario] = useState<'succeeded' | 'failed' | null>(null);

  const simulate = async (event: 'succeeded' | 'failed') => {
    if (!payment) return;
    setScenario(event);

    try {
      const response = await fetch(`${API_URL}/api/payments/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentId, event }),
      });

      if (!response.ok) {
        throw new Error('Webhook failed');
      }

      window.setTimeout(() => {
        if (event === 'succeeded') {
          const tokens = payment.tokensAdded ? `&tokens=${payment.tokensAdded}` : '';
          router.replace(`/profile?tab=billing&payment=success${tokens}`);
          return;
        }
        router.replace('/profile?tab=billing&payment=failed');
      }, event === 'succeeded' ? 1400 : 900);
    } catch {
      setScenario(null);
      toast({
        title: 'Не удалось обработать тестовый платёж',
        description: 'Проверьте API и попробуйте ещё раз.',
        variant: 'destructive',
      });
    }
  };

  const simulateTimeout = () => {
    router.replace('/profile?tab=billing');
  };

  return (
    <main className="min-h-screen bg-slate-100 pb-12 pt-14 text-slate-950">
      <div className="fixed left-0 right-0 top-0 z-50 bg-orange-500 px-4 py-2 text-center text-sm font-bold text-white shadow-sm">
        🧪 ТЕСТОВАЯ СРЕДА — реальные деньги не списываются
      </div>

      <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-5">
        <Link href="/" className="flex items-center gap-2 text-lg font-bold">
          <WalletCards className="h-6 w-6 text-sky-600" />
          Платёжная система
        </Link>
        <Badge className="bg-white text-slate-700 shadow-sm">Mock YooKassa</Badge>
      </div>

      <section className="mx-auto grid w-full max-w-5xl gap-6 px-4 lg:grid-cols-[1fr_360px]">
        <Card className="border-slate-200 bg-white shadow-xl shadow-slate-300/40">
          <CardHeader className="border-b border-slate-100">
            <CardTitle className="flex items-center gap-2 text-2xl">
              <LockKeyhole className="h-5 w-5 text-emerald-600" />
              Оплата заказа
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6 p-6">
            {isLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-16 bg-slate-200" />
                <Skeleton className="h-40 bg-slate-200" />
              </div>
            ) : isError || !payment ? (
              <StateMessage
                icon={<AlertCircle className="h-8 w-8" />}
                title="Платёж не найден"
                description="Вернитесь к выбору пакета и создайте новый платёж."
                href="/pricing"
                label="К пакетам"
              />
            ) : payment.status === 'SUCCEEDED' ? (
              <StateMessage
                icon={<CheckCircle2 className="h-8 w-8" />}
                title="Платёж уже завершён"
                description="Токены уже начислены на баланс."
                href="/profile?tab=billing"
                label="В личный кабинет"
              />
            ) : payment.status !== 'PENDING' ? (
              <StateMessage
                icon={<AlertCircle className="h-8 w-8" />}
                title="Платёж больше не активен"
                description="Создайте новую покупку или повторите её из истории платежей."
                href="/profile?tab=billing"
                label="В биллинг"
              />
            ) : (
              <>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-5">
                  <div className="text-sm text-slate-500">Сумма к оплате</div>
                  <div className="mt-1 text-5xl font-black tracking-normal">{paymentAmount(payment)} ₽</div>
                  <div className="mt-5 grid gap-3 text-sm text-slate-600">
                    <div className="flex justify-between gap-4">
                      <span>Продавец</span>
                      <span className="font-medium text-slate-900">Allvision Studio</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span>Назначение</span>
                      <span className="max-w-sm text-right font-medium text-slate-900">{paymentDescription(payment)}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span>ID платежа</span>
                      <span className="font-mono text-xs text-slate-500">{payment.providerPaymentId ?? payment.id}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h2 className="text-lg font-bold">Способ оплаты</h2>
                  <div className="grid gap-3">
                    {['Карта', 'СБП', 'Кошелёк'].map((method, index) => (
                      <label
                        key={method}
                        className={cn(
                          'flex items-center gap-3 rounded-lg border p-4 text-sm',
                          index === 0 ? 'border-sky-500 bg-sky-50' : 'border-slate-200 bg-white text-slate-400',
                        )}
                      >
                        <input type="radio" checked={index === 0} disabled readOnly className="h-4 w-4" />
                        <span className="font-medium">{method}</span>
                      </label>
                    ))}
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-white p-4">
                    <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                      <CreditCard className="h-4 w-4 text-sky-600" />
                      Банковская карта
                    </div>
                    <div className="grid gap-3 sm:grid-cols-4">
                      <Input value="4242 4242 4242 4242" disabled className="bg-slate-50 sm:col-span-2" />
                      <Input value="12/30" disabled className="bg-slate-50" />
                      <Input value="123" disabled className="bg-slate-50" />
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <Button
                    size="lg"
                    className="h-14 w-full bg-sky-600 text-base text-white hover:bg-sky-500"
                    disabled={scenario !== null}
                    onClick={() => simulate('succeeded')}
                  >
                    {scenario === 'succeeded' ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin" />
                        Обрабатываем платёж...
                      </>
                    ) : (
                      <>Оплатить {paymentAmount(payment)} ₽</>
                    )}
                  </Button>

                  <div className="grid gap-2 sm:grid-cols-3">
                    <Button
                      type="button"
                      className="bg-emerald-600 text-white hover:bg-emerald-500"
                      disabled={scenario !== null}
                      onClick={() => simulate('succeeded')}
                    >
                      ✅ Симулировать успех
                    </Button>
                    <Button type="button" variant="outline" disabled={scenario !== null} onClick={() => simulate('failed')}>
                      ❌ Симулировать отказ
                    </Button>
                    <Button
                      type="button"
                      className="border-yellow-300 bg-yellow-100 text-yellow-900 hover:bg-yellow-200"
                      disabled={scenario !== null}
                      onClick={simulateTimeout}
                    >
                      ⏰ Симулировать таймаут
                    </Button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <aside className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-sm font-semibold text-slate-900">Безопасное тестирование</div>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Эта страница имитирует внешний провайдер: успех, отказ и таймаут проходят через тот же backend-flow,
              что и будущая интеграция ЮKassa.
            </p>
          </div>
          <Button asChild variant="ghost" className="w-full text-slate-600">
            <Link href="/pricing">Отмена</Link>
          </Button>
        </aside>
      </section>
    </main>
  );
}

function StateMessage({
  icon,
  title,
  description,
  href,
  label,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  href: string;
  label: string;
}) {
  return (
    <div className="grid place-items-center py-16 text-center">
      <div className="grid h-16 w-16 place-items-center rounded-full bg-slate-100 text-slate-700">{icon}</div>
      <h1 className="mt-5 text-2xl font-bold">{title}</h1>
      <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">{description}</p>
      <Button asChild className="mt-6 bg-sky-600 text-white hover:bg-sky-500">
        <Link href={href}>{label}</Link>
      </Button>
    </div>
  );
}
