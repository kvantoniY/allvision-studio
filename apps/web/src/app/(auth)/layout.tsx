import Link from 'next/link';
import { BrandLogo } from '@/components/ui/brand-logo';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-900 dark:via-slate-950 dark:to-slate-900 p-4">
      <Link
        href="/"
        className="relative mb-8 inline-flex items-center text-lg font-semibold"
      >
        <BrandLogo className="absolute right-[calc(100%+0.5rem)] top-1/2 h-7 w-auto -translate-y-1/2" />
        Allvision Studio
      </Link>
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
