import Link from 'next/link';
import { Sparkles } from 'lucide-react';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-900 dark:via-slate-950 dark:to-slate-900 p-4">
      <Link href="/" className="flex items-center gap-2 text-lg font-semibold mb-8">
        <Sparkles className="h-5 w-5 text-primary" />
        Allvision Studio
      </Link>
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
