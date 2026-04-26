import type { Payment, PaymentStatus } from '@allvision/shared';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatDateTime } from './labels';

const STATUS_LABEL: Record<PaymentStatus, string> = {
  PENDING: 'Ожидает оплаты',
  SUCCEEDED: 'Оплачен',
  FAILED: 'Ошибка',
  CANCELLED: 'Отменён',
};

const STATUS_COLOR: Record<PaymentStatus, string> = {
  PENDING: 'bg-yellow-500/20 text-yellow-300',
  SUCCEEDED: 'bg-emerald-500/20 text-emerald-300',
  FAILED: 'bg-red-500/20 text-red-300',
  CANCELLED: 'bg-slate-600 text-slate-300',
};

export function PaymentRow({ payment }: { payment: Payment }) {
  const purpose = payment.purpose === 'TOPUP' ? 'Пополнение' : `Заказ #${payment.id.slice(0, 6)}`;
  const confirmationUrl =
    payment.metadata && typeof payment.metadata === 'object' && 'confirmationUrl' in payment.metadata
      ? String((payment.metadata as Record<string, unknown>).confirmationUrl)
      : undefined;

  return (
    <tr className="border-b border-slate-800">
      <td className="py-3 px-3 text-sm text-slate-400 whitespace-nowrap">{formatDateTime(payment.createdAt)}</td>
      <td className="py-3 px-3 text-sm font-semibold text-amber-300 whitespace-nowrap">
        {payment.amountRub.toLocaleString('ru-RU')} ₽
      </td>
      <td className="py-3 px-3 text-sm">{purpose}</td>
      <td className="py-3 px-3">
        <span
          className={cn(
            'inline-block rounded-md px-2 py-1 text-xs font-medium',
            STATUS_COLOR[payment.status],
          )}
        >
          {STATUS_LABEL[payment.status]}
        </span>
      </td>
      <td className="py-3 px-3">
        {payment.status === 'PENDING' && confirmationUrl ? (
          <Button asChild size="sm" variant="default">
            <a href={confirmationUrl} target="_blank" rel="noreferrer">
              Оплатить
            </a>
          </Button>
        ) : payment.status === 'FAILED' ? (
          <Button size="sm" variant="outline" disabled>
            Повторить
          </Button>
        ) : (
          <span className="text-xs text-slate-500">—</span>
        )}
      </td>
    </tr>
  );
}
