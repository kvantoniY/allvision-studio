'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Coins } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { SIDEBAR_SECTIONS, isActive } from './sidebar-nav';

function initialsOf(name: string | null | undefined, email: string) {
  if (name) {
    const parts = name.trim().split(/\s+/);
    return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
  }
  return email[0]?.toUpperCase() ?? '?';
}

export function DashboardSidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { user } = useAuth();
  const pathname = usePathname();

  if (!user) return null;

  return (
    <div className="flex h-full flex-col gap-6 p-4">
      <div className="flex items-center gap-3 rounded-lg bg-slate-900 p-3">
        <Avatar className="h-10 w-10">
          {user.avatar && <AvatarImage src={user.avatar} alt={user.name ?? user.email} />}
          <AvatarFallback>{initialsOf(user.name, user.email)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <div className="truncate font-medium">{user.name ?? user.email}</div>
          <div className="truncate text-xs text-slate-400">{user.email}</div>
        </div>
      </div>

      <Link
        href="/pricing"
        onClick={onNavigate}
        className="flex items-center justify-between rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-3 transition hover:border-amber-500/60 hover:bg-amber-500/15"
      >
        <span className="flex items-center gap-2 text-sm text-slate-300">
          <Coins className="h-4 w-4 text-amber-400" />
          Баланс
        </span>
        <span className="text-lg font-bold text-amber-400">{user.tokenBalance}</span>
      </Link>

      <nav className="flex flex-1 flex-col gap-1">
        {SIDEBAR_SECTIONS.map((section, sectionIndex) => (
          <div key={section.label ?? sectionIndex} className={cn(sectionIndex > 0 && 'mt-3 border-t border-slate-800 pt-3')}>
            {section.label && (
              <div className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {section.label}
              </div>
            )}
            <div className="grid gap-1">
              {section.items.map((item) => {
                const active = isActive(item.href, pathname);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    className={cn(
                      'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                      active
                        ? 'bg-violet-600 text-white shadow-[0_0_0_1px_rgba(139,92,246,0.5)]'
                        : 'text-slate-300 hover:bg-slate-800 hover:text-white',
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <Button asChild className="bg-amber-500 text-slate-950 hover:bg-amber-400">
        <Link href="/pricing" onClick={onNavigate}>
          <Coins className="mr-2 h-4 w-4" />
          Купить коины
        </Link>
      </Button>
    </div>
  );
}

export function DashboardSidebar() {
  return (
    <aside className="hidden w-64 shrink-0 border-r border-slate-800 bg-slate-950 lg:block">
      <DashboardSidebarContent />
    </aside>
  );
}
