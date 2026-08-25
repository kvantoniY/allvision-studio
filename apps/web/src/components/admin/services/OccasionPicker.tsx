'use client';

import { OCCASION_DEFS, type OccasionTag } from '@allvision/shared';
import { cn } from '@/lib/utils';

type OccasionPickerProps = {
  value: OccasionTag[];
  onChange: (value: OccasionTag[]) => void;
};

/**
 * Поводы — сквозной фильтр витрины. Услуга может подходить сразу нескольким
 * («оживить фото» дарят и на юбилей, и в память о близком), поэтому это набор,
 * а не одиночный выбор.
 */
export function OccasionPicker({ value, onChange }: OccasionPickerProps) {
  const toggle = (code: OccasionTag) => {
    onChange(value.includes(code) ? value.filter((item) => item !== code) : [...value, code]);
  };

  return (
    <div className="space-y-2">
      <div className="text-sm font-medium text-slate-200">Поводы</div>
      <p className="text-xs text-slate-500">
        По каким праздникам услуга попадёт в фильтр витрины. Можно не выбирать — тогда услуга
        видна только без фильтра по поводу.
      </p>
      <div className="flex flex-wrap gap-2 pt-1">
        {OCCASION_DEFS.map((occasion) => {
          const isActive = value.includes(occasion.code);
          return (
            <button
              key={occasion.code}
              type="button"
              onClick={() => toggle(occasion.code)}
              aria-pressed={isActive}
              className={cn(
                'inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition',
                isActive
                  ? 'border-violet-500 bg-violet-500/15 text-violet-200'
                  : 'border-zinc-800 bg-zinc-900/60 text-slate-400 hover:border-zinc-700 hover:text-slate-200',
              )}
            >
              <span aria-hidden>{occasion.emoji}</span>
              <span>{occasion.title}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
