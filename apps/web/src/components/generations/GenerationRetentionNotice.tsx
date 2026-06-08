'use client';

import { Clock3 } from 'lucide-react';
import { formatDateTime } from '@/components/dashboard/labels';
import { cn } from '@/lib/utils';

type GenerationRetentionNoticeProps = {
  expiresAt?: string | Date | null;
  compact?: boolean;
  className?: string;
};

export function GenerationRetentionNotice({
  expiresAt,
  compact = false,
  className,
}: GenerationRetentionNoticeProps) {
  if (!expiresAt) return null;

  const expiresLabel = formatDateTime(expiresAt);

  if (compact) {
    return (
      <div className={cn('inline-flex items-center gap-1.5 text-xs text-amber-200', className)}>
        <Clock3 className="h-3.5 w-3.5 shrink-0" />
        <span>Удалится {expiresLabel}</span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm leading-5 text-amber-100',
        className,
      )}
    >
      <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
      <div>
        <div className="font-medium text-amber-50">Хранится до {expiresLabel}</div>
        <div className="mt-0.5 text-xs text-amber-100/85">
          Генерации удаляются через 3 дня. Скачайте результат или сохраните в Студию, чтобы не потерять.
        </div>
      </div>
    </div>
  );
}
