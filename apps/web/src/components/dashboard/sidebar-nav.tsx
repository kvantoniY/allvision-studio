import { Home, Sparkles, User, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type SidebarItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export type SidebarSection = {
  label?: string;
  items: SidebarItem[];
};

// Academy-навигация (реворк A2.5). Витрина Studio скрыта; «Нейролаборатория» — это
// AI-чат, будущий инструмент уроков по нейросетям.
export const SIDEBAR_SECTIONS: SidebarSection[] = [
  {
    items: [
      { href: '/', label: 'Главная', icon: Home },
      { href: '/family', label: 'Семья', icon: Users },
      { href: '/ai', label: 'Нейролаборатория', icon: Sparkles },
      { href: '/profile', label: 'Профиль', icon: User },
    ],
  },
];

export function isActive(itemHref: string, pathname: string): boolean {
  if (itemHref === '/') return pathname === '/';
  return pathname === itemHref || pathname.startsWith(itemHref + '/');
}
