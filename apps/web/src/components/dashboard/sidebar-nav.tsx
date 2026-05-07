import { BookOpen, FileText, Film, Home, ImageIcon, Map, User, Users, Wallet } from 'lucide-react';
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

export const SIDEBAR_SECTIONS: SidebarSection[] = [
  {
    items: [{ href: '/dashboard', label: 'Кабинет', icon: Home }],
  },
  {
    label: 'Моя студия',
    items: [
      { href: '/dashboard/characters', label: 'Персонажи', icon: Users },
      { href: '/dashboard/scenes', label: 'Сцены', icon: Map },
      { href: '/dashboard/episodes', label: 'Эпизоды', icon: Film },
    ],
  },
  {
    items: [
      { href: '/dashboard/projects', label: 'Проекты', icon: ImageIcon },
      { href: '/dashboard/orders', label: 'Заказы', icon: FileText },
      { href: '/dashboard/fairy-tales', label: 'Сказки', icon: BookOpen },
      { href: '/dashboard/billing', label: 'Биллинг', icon: Wallet },
      { href: '/dashboard/profile', label: 'Профиль', icon: User },
    ],
  },
];

export function isActive(itemHref: string, pathname: string): boolean {
  if (itemHref === '/dashboard') return pathname === '/dashboard';
  return pathname === itemHref || pathname.startsWith(itemHref + '/');
}
