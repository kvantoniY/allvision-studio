import { Grid3X3, Home, LifeBuoy, Palette, Sparkles, User, Users } from 'lucide-react';
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
    items: [
      { href: '/', label: 'Главная', icon: Home },
      { href: '/family', label: 'Семья', icon: Users },
      { href: '/ai', label: 'Allvision AI', icon: Sparkles },
      { href: '/services', label: 'Услуги', icon: Grid3X3 },
      { href: '/studio', label: 'Студия', icon: Palette },
      { href: '/support', label: 'Поддержка', icon: LifeBuoy },
      { href: '/profile', label: 'Профиль', icon: User },
    ],
  },
];

export function isActive(itemHref: string, pathname: string): boolean {
  if (itemHref === '/') return pathname === '/';
  return pathname === itemHref || pathname.startsWith(itemHref + '/');
}
