import { BookOpen, FileText, Home, ImageIcon, User, Wallet } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type SidebarItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export const SIDEBAR_ITEMS: SidebarItem[] = [
  { href: '/dashboard', label: 'Главная', icon: Home },
  { href: '/dashboard/projects', label: 'Мои проекты', icon: ImageIcon },
  { href: '/dashboard/orders', label: 'Мои заказы', icon: FileText },
  { href: '/dashboard/fairy-tales', label: 'Мои сказки', icon: BookOpen },
  { href: '/dashboard/billing', label: 'История платежей', icon: Wallet },
  { href: '/dashboard/profile', label: 'Профиль', icon: User },
];

export function isActive(itemHref: string, pathname: string): boolean {
  if (itemHref === '/dashboard') return pathname === '/dashboard';
  return pathname === itemHref || pathname.startsWith(itemHref + '/');
}
