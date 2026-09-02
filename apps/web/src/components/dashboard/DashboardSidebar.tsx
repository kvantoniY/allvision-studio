'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogOut, ShieldCheck } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { BrandLogo } from '@/components/ui/brand-logo';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { SIDEBAR_SECTIONS, isActive } from './sidebar-nav';

import { TokenIcon } from '@/components/ui/token-icon';
function initialsOf(name: string | null | undefined, email: string) {
  if (name) {
    const parts = name.trim().split(/\s+/);
    return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
  }
  return email[0]?.toUpperCase() ?? '?';
}

export function DashboardSidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { user, logout } = useAuth();
  const pathname = usePathname();

  if (!user) return null;

  const sidebarSections = user.role === 'ADMIN'
    ? [
        ...SIDEBAR_SECTIONS,
        {
          label: 'Администрирование',
          items: [{ href: '/admin', label: 'Админ панель', icon: ShieldCheck }],
        },
      ]
    : SIDEBAR_SECTIONS;

  return (
    <div className="flex h-full min-h-0 flex-col gap-6 p-4">
      <Link href="/" onClick={onNavigate} className="flex items-center gap-2 px-2 py-1 font-semibold text-white">
        <BrandLogo className="h-6 w-auto" />
        <span>Allvision Studio</span>
      </Link>

      <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pr-1">
        {sidebarSections.map((section, sectionIndex) => (
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

      <div className="space-y-3 border-t border-slate-800 pt-4">
        <Link
          href="/profile?tab=billing"
          onClick={onNavigate}
          className="flex items-center justify-between rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-3 transition hover:border-amber-500/60 hover:bg-amber-500/15"
        >
          <span className="flex items-center gap-2 text-sm text-slate-300">
            <TokenIcon className="h-4 w-4 text-amber-400" />
            Баланс
          </span>
          <span className="text-lg font-bold text-amber-400">{user.tokenBalance}</span>
        </Link>

        <Link
          href="/profile"
          onClick={onNavigate}
          className="flex items-center gap-3 rounded-lg bg-slate-900 p-3 transition hover:bg-slate-800"
        >
          <Avatar className="h-10 w-10">
            {user.avatar && <AvatarImage src={user.avatar} alt={user.name ?? user.email} />}
            <AvatarFallback>{initialsOf(user.name, user.email)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium">{user.name ?? user.email}</div>
            <div className="truncate text-xs text-slate-400">{user.email}</div>
          </div>
        </Link>

        <div className="grid grid-cols-[1fr_auto] gap-2">
          <Button asChild className="bg-amber-500 text-slate-950 hover:bg-amber-400">
            <Link href="/profile?tab=billing" onClick={onNavigate}>
              <TokenIcon className="mr-2 h-4 w-4" />
              Купить
            </Link>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="border-slate-700 bg-slate-950"
            onClick={() => {
              onNavigate?.();
              void logout();
            }}
            aria-label="Выйти"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Свёрнутая колонка: только иконки разделов.
 *
 * Нужна там, где место на вес золота — прежде всего в редакторе. Полное меню при
 * наведении выезжает ПОВЕРХ страницы, поэтому раскладка не пересчитывается и кадр на
 * холсте не прыгает: места занимает ровно свёрнутая колонка.
 */
function SidebarRailIcons() {
  const { user } = useAuth();
  const pathname = usePathname();
  if (!user) return null;

  const items = SIDEBAR_SECTIONS.flatMap((section) => section.items);
  const railItems = user.role === 'ADMIN'
    ? [...items, { href: '/admin', label: 'Админ панель', icon: ShieldCheck }]
    : items;

  return (
    <div className="flex h-full flex-col items-center gap-1 border-r border-slate-800 bg-slate-950 py-3">
      <Link href="/" className="mb-2 grid h-9 w-9 place-items-center" aria-label="Allvision Studio">
        <BrandLogo className="h-6 w-auto" />
      </Link>
      {railItems.map((item) => {
        const active = isActive(item.href, pathname);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            title={item.label}
            aria-label={item.label}
            className={cn(
              'grid h-10 w-10 place-items-center rounded-lg transition-colors',
              active ? 'bg-violet-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white',
            )}
          >
            <Icon className="h-4 w-4" />
          </Link>
        );
      })}
      <div className="mt-auto flex flex-col items-center gap-2">
        <Link
          href="/profile?tab=billing"
          title={`Баланс: ${user.tokenBalance}`}
          className="grid h-10 w-10 place-items-center rounded-lg text-amber-400 transition hover:bg-slate-800"
        >
          <TokenIcon className="h-5 w-5" />
        </Link>
        <Link href="/profile" title={user.name ?? user.email}>
          <Avatar className="h-8 w-8">
            {user.avatar && <AvatarImage src={user.avatar} alt={user.name ?? user.email} />}
            <AvatarFallback>{initialsOf(user.name, user.email)}</AvatarFallback>
          </Avatar>
        </Link>
      </div>
    </div>
  );
}

export function DashboardSidebar({ rail = false }: { rail?: boolean }) {
  if (!rail) {
    return (
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-slate-800 bg-slate-950 md:block">
        <DashboardSidebarContent />
      </aside>
    );
  }

  return (
    <aside className="group fixed inset-y-0 left-0 z-40 hidden w-16 md:block">
      <SidebarRailIcons />
      {/* Полное меню лежит поверх: на странице оно места не занимает. */}
      <div
        className={cn(
          'pointer-events-none absolute inset-y-0 left-0 w-64 -translate-x-3 border-r border-slate-800 bg-slate-950 opacity-0 shadow-2xl shadow-black/60 transition duration-150',
          'group-hover:pointer-events-auto group-hover:translate-x-0 group-hover:opacity-100',
          'focus-within:pointer-events-auto focus-within:translate-x-0 focus-within:opacity-100',
        )}
      >
        <DashboardSidebarContent />
      </div>
    </aside>
  );
}
