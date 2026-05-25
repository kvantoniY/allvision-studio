'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, BarChart3, Clapperboard, FolderKanban, Images, LifeBuoy, LineChart, Palette, Sparkles, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/admin/services', label: 'Услуги', icon: Sparkles, disabled: false },
  { href: '/admin/media-assets', label: 'Медиа', icon: Images, disabled: false },
  { href: '/admin/style-presets', label: 'Шаблоны образов', icon: Palette, disabled: false },
  { href: '/admin/usage', label: 'Расходы', icon: LineChart, disabled: false },
  { href: '/admin/diagnostics', label: 'Диагностика', icon: Activity, disabled: false },
  { href: '/admin/trends', label: 'Тренды', icon: BarChart3, disabled: false },
  { href: '/admin/scenario-templates', label: 'Сценарии', icon: Clapperboard, disabled: false },
  { href: '/admin/users', label: 'Пользователи', icon: Users, disabled: false },
  { href: '/admin/projects', label: 'Проекты', icon: FolderKanban, disabled: false },
  { href: '/admin/support', label: 'Поддержка', icon: LifeBuoy, disabled: false },
];

export function AdminSidebarNav() {
  const pathname = usePathname();

  return (
    <nav className="grid gap-1">
      {navItems.map((item) => {
        const Icon = item.icon;
        const active = !item.disabled && (pathname === item.href || pathname.startsWith(`${item.href}/`));
        const className = cn(
          'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition',
          active && 'bg-rose-500 text-white',
          !active && !item.disabled && 'text-slate-300 hover:bg-zinc-900 hover:text-white',
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
  );
}
