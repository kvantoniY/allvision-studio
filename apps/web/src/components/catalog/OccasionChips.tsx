'use client';

import { OCCASION_DEFS, type OccasionTag } from '@allvision/shared';
import { cn } from '@/lib/utils';

type OccasionChipsProps = {
  value: OccasionTag | null;
  onChange: (value: OccasionTag | null) => void;
  /** Показывать только поводы, которые реально есть у услуг вкладки. */
  available?: Set<string>;
  className?: string;
};

/**
 * Поводы — сквозной фильтр поверх любой вкладки. Свёрнут в одну прокручиваемую
 * строку: на телефоне это единственный вариант, который не съедает пол-экрана.
 */
export function OccasionChips({ value, onChange, available, className }: OccasionChipsProps) {
  const occasions = available ? OCCASION_DEFS.filter((item) => available.has(item.code)) : OCCASION_DEFS;
  if (occasions.length === 0) return null;

  return (
    <nav
      aria-label="Поводы"
      className={cn('-mx-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden', className)}
    >
      <div className="flex min-w-max gap-2 px-1">
        <button
          type="button"
          onClick={() => onChange(null)}
          className={cn(
            'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition',
            value === null
              ? 'border-amber-400 bg-amber-400/15 text-amber-200'
              : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700 hover:text-slate-200',
          )}
        >
          Любой повод
        </button>
        {occasions.map((occasion) => {
          const isActive = value === occasion.code;
          return (
            <button
              key={occasion.code}
              type="button"
              onClick={() => onChange(isActive ? null : occasion.code)}
              className={cn(
                'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition',
                isActive
                  ? 'border-amber-400 bg-amber-400/15 text-amber-200'
                  : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700 hover:text-slate-200',
              )}
            >
              <span aria-hidden>{occasion.emoji}</span>
              <span>{occasion.shortTitle}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
