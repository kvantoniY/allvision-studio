import Link from 'next/link';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type EmptyStateAction = {
  label: string;
  href?: string;
  variant?: 'default' | 'outline';
  onClick?: () => void;
};

export type EmptyStateProps = {
  icon: ReactNode;
  title: string;
  description?: string;
  actions?: EmptyStateAction[];
  size?: 'sm' | 'md' | 'lg';
  className?: string;
};

const sizeMap = {
  sm: { wrap: 'py-6', icon: 'h-8 w-8', title: 'text-base', desc: 'text-xs' },
  md: { wrap: 'py-12', icon: 'h-12 w-12', title: 'text-lg', desc: 'text-sm' },
  lg: { wrap: 'py-20', icon: 'h-16 w-16', title: 'text-2xl', desc: 'text-base' },
};

export function EmptyState({
  icon,
  title,
  description,
  actions,
  size = 'md',
  className,
}: EmptyStateProps) {
  const s = sizeMap[size];
  return (
    <div className={cn('flex flex-col items-center justify-center text-center', s.wrap, className)}>
      <div className={cn('mb-4 text-slate-500/60', s.icon)} aria-hidden>
        {icon}
      </div>
      <h3 className={cn('font-semibold text-slate-100', s.title)}>{title}</h3>
      {description && (
        <p className={cn('mt-2 max-w-md text-slate-400', s.desc)}>{description}</p>
      )}
      {actions && actions.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          {actions.map((a, idx) =>
            a.href ? (
              <Button key={idx} asChild variant={a.variant ?? (idx === 0 ? 'default' : 'outline')} size="sm">
                <Link href={a.href}>{a.label}</Link>
              </Button>
            ) : (
              <Button
                key={idx}
                variant={a.variant ?? (idx === 0 ? 'default' : 'outline')}
                size="sm"
                onClick={a.onClick}
              >
                {a.label}
              </Button>
            ),
          )}
        </div>
      )}
    </div>
  );
}
