import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { BrandLogo } from '@/components/ui/brand-logo';
import { requireAdminPage } from '@/lib/auth';
import { AdminSidebarNav } from '@/components/admin/AdminSidebarNav';
import { AdminMobileNav } from '@/components/admin/AdminMobileNav';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const me = await requireAdminPage();

  return (
    <div className="admin-theme min-h-screen bg-zinc-950 text-slate-100 [color-scheme:dark]">
      <header className="sticky top-0 z-30 border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur-md">
        <div className="flex h-16 items-center justify-between gap-2 px-4 sm:px-5 lg:px-8">
          <div className="flex min-w-0 items-center gap-1.5">
            <AdminMobileNav />
            <Link
              href="/admin/services"
              className="flex items-center gap-2.5 font-semibold tracking-tight transition-opacity hover:opacity-90"
            >
              <BrandLogo className="h-6 w-auto" />
              <span className="hidden sm:inline">Allvision</span>
              <span className="rounded-md bg-violet-500/15 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-violet-300 ring-1 ring-inset ring-violet-500/30">
                Admin
              </span>
            </Link>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-slate-400 sm:inline">{me.email}</span>
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-700/80 px-3 py-1.5 text-slate-300 transition-colors hover:border-violet-400/60 hover:bg-violet-500/10 hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Вернуться на сайт</span>
            </Link>
          </div>
        </div>
      </header>

      <div className="flex min-h-[calc(100vh-64px)]">
        <aside className="sticky top-16 hidden h-[calc(100vh-64px)] w-60 shrink-0 overflow-y-auto border-r border-zinc-800/80 bg-zinc-950/60 p-4 lg:block">
          <AdminSidebarNav />
        </aside>
        <main className="min-w-0 flex-1 bg-zinc-950">
          <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
