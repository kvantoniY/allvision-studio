import Link from 'next/link';
import type { ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type StatCardProps = {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  cta?: { label: string; href: string };
  accent?: 'amber' | 'violet' | 'emerald' | 'sky' | 'default';
  className?: string;
};

const accentMap: Record<NonNullable<StatCardProps['accent']>, string> = {
  amber: 'text-amber-400',
  violet: 'text-violet-400',
  emerald: 'text-emerald-400',
  sky: 'text-sky-400',
  default: 'text-slate-300',
};

export function StatCard({ icon, label, value, hint, cta, accent = 'default', className }: StatCardProps) {
  return (
    <Card className={cn('bg-slate-900 border-slate-800', className)}>
      <CardContent className="p-5 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-wide text-slate-400">{label}</span>
          <span className={cn('h-9 w-9 grid place-items-center rounded-md bg-slate-800', accentMap[accent])}>
            {icon}
          </span>
        </div>
        <div className={cn('text-3xl font-bold leading-tight', accentMap[accent])}>{value}</div>
        {hint && <div className="text-xs text-slate-400">{hint}</div>}
        {cta && (
          <Button asChild size="sm" variant="outline" className="mt-2 self-start">
            <Link href={cta.href}>{cta.label}</Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
