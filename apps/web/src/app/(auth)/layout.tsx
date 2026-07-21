import Link from 'next/link';
import { Sparkles } from 'lucide-react';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="academy-theme relative flex min-h-screen flex-col items-center justify-center bg-background p-4 text-foreground">
      {/* Тёплое сияние Academy на фоне */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden"
        style={{
          background:
            'radial-gradient(60% 50% at 50% 0%, hsl(24 94% 50% / 0.10), transparent 70%)',
        }}
      />
      <Link href="/" className="relative z-10 mb-8 inline-flex items-center gap-2 text-lg font-semibold">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Sparkles className="h-5 w-5" />
        </span>
        Allvision Academy
      </Link>
      <div className="relative z-10 w-full max-w-md">{children}</div>
    </div>
  );
}
