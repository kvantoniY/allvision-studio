import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

// Единый спиннер загрузки для использования по всему сайту.
export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-5 w-5 animate-spin', className)} aria-hidden />;
}

// Центрированное состояние загрузки с опциональной подписью.
export function LoadingState({ label, className }: { label?: string; className?: string }) {
  return (
    <div
      className={cn('flex min-h-[140px] flex-col items-center justify-center gap-3 text-slate-400', className)}
      role="status"
      aria-live="polite"
    >
      <Spinner className="h-6 w-6 text-violet-300" />
      {label ? <span className="text-sm">{label}</span> : <span className="sr-only">Загрузка</span>}
    </div>
  );
}
