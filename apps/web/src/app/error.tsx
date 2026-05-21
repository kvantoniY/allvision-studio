'use client';

import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { merchantInfo } from '@/lib/merchant';

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <section className="container flex min-h-[70vh] items-center py-14">
      <div className="mx-auto max-w-2xl rounded-lg border bg-card p-8 text-center shadow-xl dark:border-slate-800">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-indigo-500">500</p>
        <h1 className="mt-3 text-4xl font-bold">Что-то пошло не так</h1>
        <p className="mt-4 leading-7 text-muted-foreground">
          Страница не смогла корректно загрузиться. Попробуйте ещё раз, а если проблема повторяется — напишите в поддержку.
        </p>
        <Button className="mt-7 bg-amber-500 text-slate-950 hover:bg-amber-400" onClick={reset}>
          <RotateCcw className="h-4 w-4" />
          Попробовать снова
        </Button>
        <p className="mt-5 text-sm text-muted-foreground">Если проблема повторяется — напишите в поддержку: {merchantInfo.email}</p>
      </div>
    </section>
  );
}
