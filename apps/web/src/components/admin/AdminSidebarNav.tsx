'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity,
  Blocks,
  Clapperboard,
  Coins,
  CreditCard,
  Gauge,
  GraduationCap,
  HandCoins,
  LayoutDashboard,
  Library,
  LineChart,
  MessageCircle,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

type NavItem = { href: string; label: string; description: string; icon: LucideIcon };
type NavGroup = { label: string; adminOnly?: boolean; items: NavItem[] };

const navGroups: NavGroup[] = [
  {
    label: 'Академия',
    items: [
      { href: '/admin', label: 'Обзор', description: 'Рабочий центр', icon: LayoutDashboard },
      { href: '/admin/curriculum', label: 'Учебная программа', description: 'Курсы и навыки', icon: GraduationCap },
      { href: '/admin/constructor', label: 'Конструктор уроков', description: 'Шаблоны и сцены', icon: Blocks },
      { href: '/admin/library', label: 'Материалы', description: 'Общая библиотека', icon: Library },
      { href: '/admin/scene-player', label: 'Проверка сцен', description: 'Runtime-просмотр', icon: Clapperboard },
    ],
  },
  {
    label: 'Операции',
    adminOnly: true,
    items: [
      { href: '/admin/messages', label: 'Диалоги', description: 'Родители и учителя', icon: MessageCircle },
      { href: '/admin/payouts', label: 'Выплаты', description: 'Начисления учителям', icon: HandCoins },
      { href: '/admin/users', label: 'Пользователи', description: 'Роли и доступы', icon: Users },
      { href: '/admin/payments', label: 'Платежи', description: 'Оплаты и возвраты', icon: CreditCard },
    ],
  },
  {
    // Эксплуатация живого сервиса: расходы на AI, здоровье прода, диагностика.
    label: 'Платформа',
    adminOnly: true,
    items: [
      { href: '/admin/monitoring', label: 'Мониторинг', description: 'SSL, домен, балансы, ошибки', icon: Gauge },
      { href: '/admin/diagnostics', label: 'Диагностика', description: 'Очереди, env, состояние', icon: Activity },
      { href: '/admin/usage', label: 'AI-консоль', description: 'Расходы и вызовы', icon: LineChart },
      { href: '/admin/models', label: 'Модели и цены', description: 'Себестоимость генераций', icon: Coins },
    ],
  },
];

export function AdminSidebarNav({
  onNavigate,
  role = 'ADMIN',
}: {
  onNavigate?: () => void;
  role?: 'ADMIN' | 'METHODIST';
} = {}) {
  const pathname = usePathname();
  const visibleGroups = navGroups.filter((group) => !group.adminOnly || role === 'ADMIN');

  return (
    <nav className="space-y-7">
      {visibleGroups.map((group) => (
        <div key={group.label}>
          <div className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {group.label}
          </div>
          <div className="grid gap-1">
            {group.items.map((item) => {
              const Icon = item.icon;
              const active = item.href === '/admin'
                ? pathname === '/admin'
                : pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  className={cn(
                    'group flex items-center gap-3 rounded-2xl px-3 py-2.5 transition-colors',
                    active
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                  )}
                >
                  <span className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors',
                    active ? 'bg-primary-foreground/15' : 'bg-secondary text-foreground group-hover:bg-background',
                  )}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{item.label}</span>
                    <span className={cn('block truncate text-[11px]', active ? 'text-primary-foreground/75' : 'text-muted-foreground')}>
                      {item.description}
                    </span>
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
