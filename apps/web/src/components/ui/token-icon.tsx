import type { SVGProps } from 'react';
import { cn } from '@/lib/utils';

export function TokenIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={cn('h-4 w-4', className)}
      {...props}
    >
      <circle cx="12" cy="12" r="9.5" fill="rgb(245,158,11)" />
      <circle cx="12" cy="12" r="7.5" fill="none" stroke="rgba(15,23,42,0.22)" strokeWidth="1.4" />
      <text
        x="12"
        y="12"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="11"
        fontWeight="700"
        fontFamily="ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Inter,Helvetica,Arial,sans-serif"
        fill="rgb(15,23,42)"
      >
        K
      </text>
    </svg>
  );
}
