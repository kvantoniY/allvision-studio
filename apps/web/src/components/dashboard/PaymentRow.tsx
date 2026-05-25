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
  onResume,
  onRecheck,
  isRepeating,
  isResuming,
  isRechecking,
}: {
  payment: Payment;
  onRepeat?: (payment: Payment) => void;
  onResume?: (payment: Payment) => void;
  onRecheck?: (payment: Payment) => void;
  isRepeating?: boolean;
  isResuming?: boolean;
  isRechecking?: boolean;
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
  const resumeLabel = isResuming ? 'Проверяем...' : 'Завершить оплату';

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
        <div className="flex flex-wrap items-center gap-2">
          {payment.status === 'PENDING' && confirmationMethod === 'POST' && confirmationParams ? (
            <form
              method="POST"
              action={confirmationHref}
              onSubmit={(event) => {
                if (!onResume) return;
                event.preventDefault();
                onResume(payment);
              }}
            >
              {Object.entries(confirmationParams).map(([name, value]) => (
                <input key={name} type="hidden" name={name} value={String(value)} />
              ))}
              <Button type="submit" size="sm" variant="default" disabled={isResuming}>
                {resumeLabel}
              </Button>
            </form>
          ) : payment.status === 'PENDING' ? (
            onResume ? (
              <Button size="sm" variant="default" disabled={isResuming} onClick={() => onResume(payment)}>
                {resumeLabel}
              </Button>
            ) : (
              <Button asChild size="sm" variant="default">
                <Link href={confirmationHref}>Завершить оплату</Link>
              </Button>
            )
          ) : payment.status === 'FAILED' || payment.status === 'CANCELLED' ? (
            <Button size="sm" variant="outline" disabled={isRepeating} onClick={() => onRepeat?.(payment)}>
              Повторить покупку
            </Button>
          ) : null}

          {onRecheck && payment.status !== 'SUCCEEDED' ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={isRechecking}
              onClick={() => onRecheck(payment)}
              title="Проверить, не зачислены ли деньги на стороне Робокассы"
            >
              {isRechecking ? 'Проверяем...' : 'Проверить оплату'}
            </Button>
          ) : null}

          {payment.status === 'SUCCEEDED' ? <span className="text-xs text-slate-500">—</span> : null}
        </div>
      </td>
    </tr>
  );
}
