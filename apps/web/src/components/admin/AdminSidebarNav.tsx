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
      { href: '/admin/token-packages', label: 'Пакеты коинов', icon: Coins },
    ],
  },
];

export function AdminSidebarNav() {
  const pathname = usePathname();

  return (
    <nav className="space-y-4">
      {navGroups.map((group) => (
        <div key={group.label}>
          <div className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
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
                  className={cn(
                    'flex items-center gap-3 rounded-md px-3 py-1.5 text-sm font-medium transition',
                    active
                      ? 'bg-rose-500 text-white'
                      : 'text-slate-300 hover:bg-zinc-900 hover:text-white',
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
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
