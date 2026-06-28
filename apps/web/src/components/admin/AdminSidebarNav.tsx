'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, Clapperboard, Coins, CreditCard, FolderKanban, Images, LayoutGrid, LifeBuoy, LineChart, Palette, Sparkles, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

type NavItem = { href: string; label: string; icon: LucideIcon };
type NavGroup = { label: string; items: NavItem[] };

const navGroups: NavGroup[] = [
  {
    label: 'Каталог',
    items: [
      { href: '/admin/services', label: 'Услуги', icon: Sparkles },
      { href: '/admin/categories', label: 'Категории', icon: LayoutGrid },
      { href: '/admin/media-assets', label: 'Медиа', icon: Images },
      { href: '/admin/style-presets', label: 'Шаблоны образов', icon: Palette },
      { href: '/admin/scenario-templates', label: 'Сценарии', icon: Clapperboard },
    ],
  },
  {
    label: 'Аналитика',
    items: [
      { href: '/admin/usage', label: 'AI-консоль', icon: LineChart },
      { href: '/admin/diagnostics', label: 'Диагностика', icon: Activity },
    ],
  },
  {
    label: 'Пользователи',
    items: [
      { href: '/admin/users', label: 'Пользователи', icon: Users },
      { href: '/admin/projects', label: 'Проекты', icon: FolderKanban },
      { href: '/admin/support', label: 'Поддержка', icon: LifeBuoy },
    ],
  },
  {
    label: 'Финансы',
    items: [
      { href: '/admin/payments', label: 'Платежи', icon: CreditCard },
      { href: '/admin/token-packages', label: 'Пакеты токенов', icon: Coins },
    ],
  },
];

export function AdminSidebarNav({ onNavigate }: { onNavigate?: () => void } = {}) {
  const pathname = usePathname();

  return (
    <nav className="space-y-5">
      {navGroups.map((group) => (
        <div key={group.label}>
          <div className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            {group.label}
          </div>
          <div className="grid gap-0.5">
            {group.items.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  className={cn(
                    'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150',
                    active
                      ? 'bg-violet-500/15 text-white ring-1 ring-inset ring-violet-500/30'
                      : 'text-slate-400 hover:bg-zinc-800/60 hover:text-white',
                  )}
                >
                  <span
                    className={cn(
                      'absolute left-0 top-1/2 h-5 -translate-y-1/2 rounded-r-full bg-violet-400 transition-all duration-200',
                      active ? 'w-0.5 opacity-100' : 'w-0 opacity-0',
                    )}
                  />
                  <Icon
                    className={cn(
                      'h-4 w-4 shrink-0 transition-colors',
                      active ? 'text-violet-300' : 'text-slate-500 group-hover:text-violet-300',
                    )}
                  />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
