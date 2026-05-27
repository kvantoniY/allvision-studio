import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { BrandLogo } from '@/components/ui/brand-logo';
import { requireAdminPage } from '@/lib/auth';
import { AdminSidebarNav } from '@/components/admin/AdminSidebarNav';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const me = await requireAdminPage();

  return (
    <div className="min-h-screen bg-zinc-950 text-slate-100">
      <header className="border-b border-rose-500/20 bg-zinc-950/95">
        <div className="flex h-16 items-center justify-between px-5 lg:px-8">
          <Link href="/admin/services" className="flex items-center gap-2 font-semibold">
            <BrandLogo className="h-6 w-auto" />
            <span>Allvision Admin</span>
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <span className="hidden text-slate-400 sm:inline">{me.email}</span>
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-md border border-slate-700 px-3 py-2 text-slate-200 transition hover:border-rose-400 hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              Вернуться на сайт
            </Link>
          </div>
        </div>
      </header>

      <div className="flex min-h-[calc(100vh-64px)]">
        <aside className="sticky top-16 hidden h-[calc(100vh-64px)] w-60 shrink-0 overflow-y-auto border-r border-zinc-800 bg-zinc-950 p-4 lg:block">
          <AdminSidebarNav />
        </aside>
        <main className="min-w-0 flex-1 bg-zinc-950">
          <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
