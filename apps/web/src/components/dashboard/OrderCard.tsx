import Link from 'next/link';
import { BookOpen, Film, Sparkles } from 'lucide-react';
import type { Order } from '@allvision/shared';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ORDER_STATUS_COLOR, ORDER_STATUS_LABEL, ORDER_TYPE_LABEL, formatDateTime } from './labels';

const TYPE_ICON = {
  CARTOON: Sparkles,
  REALISTIC: Film,
  FAIRY_TALE: BookOpen,
};

export function OrderCard({ order }: { order: Order }) {
  const Icon = TYPE_ICON[order.type];
  const scenario = (order.scenario ?? '').slice(0, 100);
  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardContent className="p-5 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-md bg-slate-800 text-violet-300">
              <Icon className="h-5 w-5" />
            </span>
            <div>
              <div className="font-semibold">{ORDER_TYPE_LABEL[order.type]}</div>
              <div className="text-xs text-slate-400">{formatDateTime(order.createdAt)}</div>
            </div>
          </div>
          <span
            className={cn(
              'rounded-md px-2 py-1 text-xs font-medium whitespace-nowrap',
              ORDER_STATUS_COLOR[order.status],
            )}
          >
            {ORDER_STATUS_LABEL[order.status]}
          </span>
        </div>

        {scenario && (
          <p className="text-sm text-slate-300 line-clamp-2">
            {scenario}
            {order.scenario.length > 100 ? '…' : ''}
          </p>
        )}

        <div className="flex items-center justify-between border-t border-slate-800 pt-3">
          <div className="text-sm">
            {order.priceRub ? (
              <span className="text-amber-300 font-semibold">{order.priceRub.toLocaleString('ru-RU')} ₽</span>
            ) : (
              <span className="text-slate-500">Цена не назначена</span>
            )}
          </div>
          <Button asChild size="sm" variant="outline">
            <Link href={`/dashboard/orders/${order.id}`}>Подробнее</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
