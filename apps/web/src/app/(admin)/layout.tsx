import Link from 'next/link';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { BrandLogo } from '@/components/ui/brand-logo';
import { requireAcademyStaffPage } from '@/lib/auth';
import { AdminSidebarNav } from '@/components/admin/AdminSidebarNav';
import { AdminMobileNav } from '@/components/admin/AdminMobileNav';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const me = await requireAcademyStaffPage();
  const staffRole = me.role === 'METHODIST' ? 'METHODIST' : 'ADMIN';

  return (
    <div className="academy-theme min-h-screen bg-secondary/35 text-foreground">
      <header className="sticky top-0 z-30 border-b border-border/80 bg-background/90 backdrop-blur-xl">
        <div className="flex h-16 items-center justify-between gap-2 px-4 sm:px-5 lg:px-8">
          <div className="flex min-w-0 items-center gap-1.5">
            <AdminMobileNav role={staffRole} />
            <Link
              href="/admin"
              className="flex items-center gap-2.5 font-semibold tracking-tight transition-opacity hover:opacity-90"
            >
              <BrandLogo className="h-8 w-8" />
              <span className="hidden sm:inline">Allvision Academy</span>
              <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent-foreground ring-1 ring-inset ring-primary/15">
                {staffRole === 'METHODIST' ? 'Методист' : 'Администратор'}
              </span>
            </Link>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden items-center gap-1.5 text-muted-foreground md:inline-flex"><ShieldCheck className="h-4 w-4 text-primary" />{me.email}</span>
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-1.5 text-muted-foreground transition-colors hover:border-primary/40 hover:bg-accent hover:text-accent-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Вернуться на сайт</span>
            </Link>
          </div>
        </div>
      </header>

      <div className="flex min-h-[calc(100vh-64px)]">
        <aside className="sticky top-16 hidden h-[calc(100vh-64px)] w-72 shrink-0 overflow-y-auto border-r border-border bg-card p-4 lg:block">
          <AdminSidebarNav role={staffRole} />
        </aside>
        <main className="min-w-0 flex-1 bg-[radial-gradient(circle_at_top_right,hsl(24_94%_50%/0.07),transparent_30%)]">
          <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 sm:py-8 lg:px-10">{children}</div>
        </main>
      </div>
    </div>
  );
}
