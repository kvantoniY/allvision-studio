import Image from 'next/image';

import { cn } from '@/lib/utils';

type BrandLogoProps = {
  className?: string;
};

/**
 * Allvision Studio brand mark. Source asset: /public/logo.png (eye on a
 * gradient background). Square, with soft rounded corners. Size it via
 * className, e.g. `h-6 w-auto`.
 */
export function BrandLogo({ className }: BrandLogoProps) {
  return (
    <Image
      src="/logo.png"
      alt="Allvision Studio"
      width={1254}
      height={1254}
      priority
      className={cn('rounded-[22%]', className)}
    />
  );
}
