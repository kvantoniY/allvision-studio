import Link from 'next/link';
import { BarChart3, FolderKanban, Sparkles, Users } from 'lucide-react';
import { requireAdminPage } from '@/lib/auth';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/admin/trends', label: 'Тренды', icon: BarChart3, active: true, disabled: false },
  { href: '#', label: 'Юзеры', icon: Users, active: false, disabled: true },
  { href: '#', label: 'Проекты', icon: FolderKanban, active: false, disabled: true },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const me = await requireAdminPage();

  return (
    <div className="min-h-screen bg-zinc-950 text-slate-100">
      <header className="border-b border-rose-500/20 bg-zinc-950/95">
        <div className="flex h-16 items-center justify-between px-5 lg:px-8">
          <Link href="/admin/trends" className="flex items-center gap-2 font-semibold">
            <Sparkles className="h-5 w-5 text-rose-400" />
            <span>Allvision Admin</span>
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <span className="hidden text-slate-400 sm:inline">{me.email}</span>
            <Link
              href="/dashboard"
              className="rounded-md border border-slate-700 px-3 py-2 text-slate-200 transition hover:border-rose-400 hover:text-white"
            >
              Выйти из админки
            </Link>
          </div>
        </div>
      </header>

      <div className="flex min-h-[calc(100vh-64px)]">
        <aside className="hidden w-64 shrink-0 border-r border-zinc-800 bg-zinc-950 p-4 lg:block">
          <nav className="grid gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const className = cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition',
                item.active && 'bg-rose-500 text-white',
                !item.active && !item.disabled && 'text-slate-300 hover:bg-zinc-900 hover:text-white',
                item.disabled && 'cursor-not-allowed text-slate-600',
              );
              if (item.disabled) {
                return (
                  <span key={item.label} className={className} aria-disabled="true">
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </span>
                );
              }
              return (
                <Link key={item.label} href={item.href} className={className}>
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>
        <main className="min-w-0 flex-1 bg-zinc-950">
          <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
