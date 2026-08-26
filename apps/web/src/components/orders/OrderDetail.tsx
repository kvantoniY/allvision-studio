'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlertCircle, ArrowLeft, Download, Loader2, Send, Wallet } from 'lucide-react';
import { CUSTOM_ORDER_STATUS_HINTS, CUSTOM_ORDER_STATUS_LABELS } from '@allvision/shared';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import { useGetMeQuery } from '@/store/api/auth-api';
import {
  useGetMyOrderQuery,
  usePayOrderMutation,
  useSendOrderMessageMutation,
} from '@/store/api/orders-api';
import { ORDER_STATUS_COLOR } from '@/components/orders/OrdersList';
import { cn } from '@/lib/utils';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:4000');

function mediaUrl(value?: string | null) {
  if (!value) return null;
  if (value.startsWith('/static/')) return `${API_URL}${value}`;
  return value;
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
}

export function OrderDetail({ id }: { id: string }) {
  // Пока заявка живая, админ может ответить в любой момент — поэтому мягкий поллинг.
  const { data, isLoading, isError } = useGetMyOrderQuery(id, { pollingInterval: 30000 });
  const { data: me } = useGetMeQuery();
  const [sendMessage, { isLoading: sending }] = useSendOrderMessageMutation();
  const [payOrder, { isLoading: paying }] = usePayOrderMutation();
  const [reply, setReply] = useState('');

  if (isLoading) {
    return (
      <div className="container space-y-4 py-10">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="container py-10">
        <Alert variant="destructive" className="max-w-2xl">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Заявка не найдена</AlertTitle>
          <AlertDescription>Возможно, ссылка устарела.</AlertDescription>
        </Alert>
      </div>
    );
  }

  const order = data.order;
  const balance = me?.user?.tokenBalance ?? 0;
  const price = order.quotedPriceCoins ?? 0;
  const canPay = order.status === 'QUOTED' && price > 0;
  const resultUrl = mediaUrl(order.resultUrl);

  const onSend = async () => {
    if (!reply.trim()) return;
    try {
      await sendMessage({ id, body: reply.trim() }).unwrap();
      setReply('');
    } catch {
      toast({ title: 'Не удалось отправить сообщение', variant: 'destructive' });
    }
  };

  const onPay = async () => {
    try {
      await payOrder(id).unwrap();
      toast({ title: 'Заказ оплачен', description: 'Мы взяли его в работу и напишем, когда будет готово.' });
    } catch (error) {
      const message = (error as { data?: { error?: { message?: string } } })?.data?.error?.message;
      toast({ title: 'Не удалось оплатить', description: message, variant: 'destructive' });
    }
  };

  return (
    <div className="container max-w-3xl space-y-6 py-8">
      <div className="flex items-center gap-3">
        <Link
          href="/orders"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-slate-700 text-slate-300 transition hover:border-slate-500 hover:text-white"
          aria-label="К списку заказов"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-bold tracking-tight">{order.typeTitle}</h1>
          <p className="text-xs text-slate-500">Заявка от {formatDateTime(order.createdAt)}</p>
        </div>
        <Badge className={cn('rounded-md', ORDER_STATUS_COLOR[order.status])}>
          {CUSTOM_ORDER_STATUS_LABELS[order.status]}
        </Badge>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <p className="text-sm leading-6 text-slate-300">{CUSTOM_ORDER_STATUS_HINTS[order.status]}</p>
        {canPay && (
          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-800 pt-4">
            <span className="text-lg font-bold text-amber-300">{price} коинов</span>
            {balance >= price ? (
              <Button type="button" onClick={onPay} disabled={paying}>
                {paying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
                Подтвердить и оплатить
              </Button>
            ) : (
              <Link
                href="/profile?tab=billing"
                className="inline-flex h-10 items-center rounded-md bg-amber-400 px-4 text-sm font-semibold text-slate-950 transition hover:bg-amber-300"
              >
                Пополнить баланс
              </Link>
            )}
            <span className="text-xs text-slate-500">На балансе {balance} коинов</span>
          </div>
        )}
        {resultUrl && (
          <div className="mt-4 border-t border-slate-800 pt-4">
            <a
              href={resultUrl}
              download
              className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
            >
              <Download className="h-4 w-4" />
              Скачать результат
            </a>
          </div>
        )}
      </div>

      <section className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <h2 className="font-semibold text-slate-100">Ваш бриф</h2>
        <dl className="space-y-2 text-sm">
          {Object.entries(order.brief).map(([key, value]) => (
            <div key={key} className="grid gap-1 sm:grid-cols-[180px,1fr]">
              <dt className="text-slate-500">{key}</dt>
              <dd className="whitespace-pre-wrap text-slate-200">{String(value ?? '—') || '—'}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold text-slate-100">Переписка</h2>
        {order.messages.length === 0 ? (
          <p className="text-sm text-slate-500">Пока сообщений нет. Мы напишем, как только разберём заявку.</p>
        ) : (
          <div className="space-y-2">
            {order.messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  'rounded-lg border p-3 text-sm leading-6',
                  message.fromAdmin
                    ? 'border-slate-800 bg-slate-900/80 text-slate-200'
                    : 'border-amber-400/30 bg-amber-400/5 text-slate-200',
                )}
              >
                <div className="mb-1 text-xs text-slate-500">
                  {message.fromAdmin ? 'Allvision Studio' : 'Вы'} · {formatDateTime(message.createdAt)}
                </div>
                <p className="whitespace-pre-wrap">{message.body}</p>
              </div>
            ))}
          </div>
        )}

        {order.status !== 'CANCELLED' && order.status !== 'DELIVERED' && (
          <div className="space-y-2">
            <Textarea
              value={reply}
              onChange={(event) => setReply(event.target.value)}
              rows={3}
              maxLength={4000}
              placeholder="Уточнить детали или задать вопрос"
            />
            <Button type="button" onClick={onSend} disabled={sending || !reply.trim()}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Отправить
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
