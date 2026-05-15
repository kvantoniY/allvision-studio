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
      <circle cx="12" cy="12" r="9" fill="rgb(245,158,11)" />
      <circle cx="12" cy="12" r="7.25" fill="none" stroke="rgba(15,23,42,0.18)" strokeWidth="1.5" />
      <path
        d="M8 7.6h8M12 7.9v8.5M9.7 16.4h4.6"
        fill="none"
        stroke="rgb(15,23,42)"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.1"
      />
    </svg>
  );
}
