'use client';

import { useState } from 'react';
import {
  CUSTOM_ORDER_STATUSES,
  CUSTOM_ORDER_STATUS_LABELS,
  nextOrderStatuses,
  type CustomOrderStatus,
} from '@allvision/shared';
import { Loader2, Send } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import {
  useGetAdminOrderQuery,
  useListAdminOrdersQuery,
  useReplyAdminOrderMutation,
  useSetAdminOrderStatusMutation,
} from '@/store/api/admin-orders-api';
import { cn } from '@/lib/utils';

const COLUMN_STATUSES: CustomOrderStatus[] = ['NEW', 'QUOTED', 'PAID', 'IN_PROGRESS', 'DELIVERED'];

const COLUMN_TONE: Record<CustomOrderStatus, string> = {
  NEW: 'border-sky-500/40',
  QUOTED: 'border-amber-500/40',
  PAID: 'border-violet-500/40',
  IN_PROGRESS: 'border-blue-500/40',
  DELIVERED: 'border-emerald-500/40',
  CANCELLED: 'border-zinc-700',
};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/**
 * Канбан заявок. Колонки — это путь работы, поэтому карточка двигается только по
 * разрешённым переходам: «доставить» неоплаченный заказ случайным кликом нельзя.
 */
export default function AdminOrdersPage() {
  const { data, isLoading } = useListAdminOrdersQuery(undefined, { pollingInterval: 60000 });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const items = data?.items ?? [];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-slate-100">Заказы</h1>
        <p className="mt-1 text-sm text-slate-400">
          Заявки на поздравления под ключ. Всего: {data?.total ?? 0}.
        </p>
      </header>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Загружаем заявки…
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-5">
          {COLUMN_STATUSES.map((status) => {
            const column = items.filter((item) => item.status === status);
            return (
              <div key={status} className={cn('rounded-xl border bg-zinc-950/60 p-3', COLUMN_TONE[status])}>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-slate-200">{CUSTOM_ORDER_STATUS_LABELS[status]}</h2>
                  <span className="text-xs text-slate-500">{column.length}</span>
                </div>
                <div className="space-y-2">
                  {column.map((order) => (
                    <button
                      key={order.id}
                      type="button"
                      onClick={() => setSelectedId(order.id)}
                      className={cn(
                        'w-full rounded-lg border p-3 text-left transition',
                        selectedId === order.id
                          ? 'border-violet-500 bg-violet-500/10'
                          : 'border-zinc-800 bg-zinc-900 hover:border-zinc-700',
                      )}
                    >
                      <div className="truncate text-sm font-medium text-slate-100">{order.typeTitle}</div>
                      <div className="mt-1 truncate text-xs text-slate-400">{order.contactName}</div>
                      <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
                        <span>{formatDate(order.updatedAt)}</span>
                        {order.quotedPriceCoins ? <span className="text-amber-300">{order.quotedPriceCoins}к</span> : null}
                      </div>
                    </button>
                  ))}
                  {column.length === 0 && <p className="py-4 text-center text-xs text-slate-600">Пусто</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedId && <OrderPanel id={selectedId} onClose={() => setSelectedId(null)} />}
    </div>
  );
}

function OrderPanel({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, isLoading } = useGetAdminOrderQuery(id, { pollingInterval: 30000 });
  const [setStatus, { isLoading: changing }] = useSetAdminOrderStatusMutation();
  const [reply, { isLoading: replying }] = useReplyAdminOrderMutation();

  const [price, setPrice] = useState('');
  const [note, setNote] = useState('');
  const [resultUrl, setResultUrl] = useState('');
  const [message, setMessage] = useState('');

  if (isLoading || !data) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-6 text-sm text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    );
  }

  const order = data.order;
  const transitions = nextOrderStatuses(order.status);

  const move = async (next: CustomOrderStatus) => {
    try {
      await setStatus({
        id: order.id,
        status: next,
        note: note.trim() || undefined,
        ...(next === 'QUOTED' && price ? { quotedPriceCoins: Number(price) } : {}),
        ...(next === 'DELIVERED' && resultUrl.trim() ? { resultUrl: resultUrl.trim() } : {}),
      }).unwrap();
      setNote('');
      toast({ title: `Статус: ${CUSTOM_ORDER_STATUS_LABELS[next]}`, description: 'Письмо заказчику отправлено.' });
    } catch (error) {
      const text = (error as { data?: { error?: { message?: string } } })?.data?.error?.message;
      toast({ title: 'Не удалось сменить статус', description: text, variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-5 rounded-xl border border-zinc-800 bg-zinc-950 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">{order.typeTitle}</h2>
          <p className="mt-1 text-sm text-slate-400">
            {order.contactName} · {order.contactEmail}
            {order.contactPhone ? ` · ${order.contactPhone}` : ''}
          </p>
          <p className="text-xs text-slate-500">
            Аккаунт: {order.user.email} · баланс {order.user.tokenBalance} коинов
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="rounded-md">{CUSTOM_ORDER_STATUS_LABELS[order.status]}</Badge>
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Закрыть
          </Button>
        </div>
      </div>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-slate-200">Бриф</h3>
        <dl className="space-y-1.5 text-sm">
          {Object.entries(order.brief).map(([key, value]) => {
            const field = order.orderType?.briefFields.find((item) => item.id === key);
            return (
              <div key={key} className="grid gap-1 sm:grid-cols-[220px,1fr]">
                <dt className="text-slate-500">{field?.label ?? key}</dt>
                <dd className="whitespace-pre-wrap text-slate-200">{String(value ?? '—') || '—'}</dd>
              </div>
            );
          })}
        </dl>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs">Цена, коины</Label>
          <Input
            type="number"
            min={1}
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            placeholder={
              order.orderType ? `${order.orderType.priceFromCoins}–${order.orderType.priceToCoins}` : 'цена'
            }
            className="h-9"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Ссылка на результат</Label>
          <Input
            value={resultUrl}
            onChange={(event) => setResultUrl(event.target.value)}
            placeholder="https://..."
            className="h-9"
          />
        </div>
      </section>

      <section className="space-y-2">
        <Label className="text-xs">Комментарий (попадёт в письмо и в переписку)</Label>
        <Textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} maxLength={4000} />
        <div className="flex flex-wrap gap-2">
          {transitions.length === 0 && <span className="text-xs text-slate-500">Заявка закрыта.</span>}
          {transitions.map((next) => (
            <Button key={next} type="button" size="sm" disabled={changing} onClick={() => move(next)}>
              {CUSTOM_ORDER_STATUS_LABELS[next]}
            </Button>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-200">Переписка</h3>
        <div className="max-h-64 space-y-2 overflow-y-auto">
          {order.messages.map((item) => (
            <div
              key={item.id}
              className={cn(
                'rounded-lg border p-2.5 text-sm',
                item.fromAdmin ? 'border-violet-500/30 bg-violet-500/5' : 'border-zinc-800 bg-zinc-900',
              )}
            >
              <div className="mb-1 text-[11px] text-slate-500">
                {item.fromAdmin ? 'Мы' : 'Заказчик'} · {formatDate(item.createdAt)}
              </div>
              <p className="whitespace-pre-wrap text-slate-200">{item.body}</p>
            </div>
          ))}
          {order.messages.length === 0 && <p className="text-xs text-slate-600">Сообщений пока нет.</p>}
        </div>
        <Textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          rows={2}
          maxLength={4000}
          placeholder="Ответ заказчику"
        />
        <Button
          type="button"
          size="sm"
          disabled={replying || !message.trim()}
          onClick={async () => {
            try {
              await reply({ id: order.id, body: message.trim() }).unwrap();
              setMessage('');
            } catch {
              toast({ title: 'Не удалось отправить', variant: 'destructive' });
            }
          }}
        >
          {replying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Отправить
        </Button>
      </section>

      <p className="text-[11px] text-slate-600">
        Доступные переходы: {CUSTOM_ORDER_STATUSES.filter((status) => transitions.includes(status)).map((status) => CUSTOM_ORDER_STATUS_LABELS[status]).join(', ') || '—'}
      </p>
    </div>
  );
}
