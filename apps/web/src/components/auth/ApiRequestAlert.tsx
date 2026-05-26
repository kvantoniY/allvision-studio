'use client';

import { AlertCircle, Clock3 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type { useApiErrorState } from '@/hooks/use-api-error-state';

type ApiErrorState = ReturnType<typeof useApiErrorState>;

type ApiRequestAlertProps = {
  state: ApiErrorState;
  title?: string;
};

export function ApiRequestAlert({ state, title }: ApiRequestAlertProps) {
  if (!state.message) return null;

  return (
    <Alert variant="destructive" className="space-y-3">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>{state.isRateLimited ? 'Антиспам ограничил запросы' : (title ?? 'Запрос не выполнен')}</AlertTitle>
      <AlertDescription className="space-y-3">
        <p>{state.message}</p>
        {state.isRateLimited && state.retryText && (
          <div className="space-y-1 rounded-md border border-red-900/50 bg-red-950/30 px-3 py-2 text-red-100">
            <div className="flex items-center gap-2">
              <Clock3 className="h-4 w-4 shrink-0" />
              <span>
                Следующая попытка через <span className="font-semibold">{state.retryText}</span>
              </span>
            </div>
            {state.details?.limit && state.windowText && (
              <p className="text-xs text-red-100/80">
                Лимит: {state.details.limit} запросов за {state.windowText}.
              </p>
            )}
          </div>
        )}
      </AlertDescription>
    </Alert>
  );
}
