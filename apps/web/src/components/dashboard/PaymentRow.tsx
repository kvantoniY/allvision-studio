import Link from 'next/link';
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

export function PaymentRow({
  payment,
  onRepeat,
  isRepeating,
}: {
  payment: Payment;
  onRepeat?: (payment: Payment) => void;
  isRepeating?: boolean;
}) {
  const purpose = payment.purpose === 'TOPUP' ? 'Пополнение' : `Заказ #${payment.id.slice(0, 6)}`;
  const metadata = payment.metadata && typeof payment.metadata === 'object' && !Array.isArray(payment.metadata)
    ? payment.metadata as Record<string, unknown>
    : {};
  const confirmationUrl =
    'confirmationUrl' in metadata
      ? String(metadata.confirmationUrl)
      : undefined;
  const confirmationMethod = metadata.confirmationMethod === 'POST' ? 'POST' : 'GET';
  const confirmationParams = metadata.confirmationParams && typeof metadata.confirmationParams === 'object' && !Array.isArray(metadata.confirmationParams)
    ? metadata.confirmationParams as Record<string, unknown>
    : undefined;
  const confirmationHref = confirmationUrl ?? `/mock-payment/${payment.providerPaymentId ?? payment.id}`;

  return (
    <tr className="border-b border-slate-800">
      <td className="py-3 px-3 text-sm text-slate-400 whitespace-nowrap">{formatDateTime(payment.createdAt)}</td>
      <td className="py-3 px-3 text-sm font-semibold text-amber-300 whitespace-nowrap">
        {(payment.amountRub / 100).toLocaleString('ru-RU')} ₽
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
        {payment.status === 'PENDING' && confirmationMethod === 'POST' && confirmationParams ? (
          <form method="POST" action={confirmationHref}>
            {Object.entries(confirmationParams).map(([name, value]) => (
              <input key={name} type="hidden" name={name} value={String(value)} />
            ))}
            <Button type="submit" size="sm" variant="default">
              Завершить оплату
            </Button>
          </form>
        ) : payment.status === 'PENDING' ? (
          <Button asChild size="sm" variant="default">
            <Link href={confirmationHref}>Завершить оплату</Link>
          </Button>
        ) : payment.status === 'FAILED' ? (
          <Button size="sm" variant="outline" disabled={isRepeating} onClick={() => onRepeat?.(payment)}>
            Повторить покупку
          </Button>
        ) : (
          <span className="text-xs text-slate-500">—</span>
        )}
      </td>
    </tr>
  );
}
