import { Blocks, CalendarClock, Clapperboard, GraduationCap, Home, Library, MessageCircle, Sparkles, User, Users } from 'lucide-react';
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
      { href: '/lessons', label: 'Занятия', icon: CalendarClock },
      { href: '/messages', label: 'Сообщения', icon: MessageCircle },
      { href: '/ai', label: 'Нейролаборатория', icon: Sparkles },
      { href: '/profile', label: 'Профиль', icon: User },
    ],
  },
];

// Навигация преподавателя (роль TEACHER).
export const TEACHER_SIDEBAR_SECTIONS: SidebarSection[] = [
  {
    items: [
      { href: '/teacher', label: 'Кабинет', icon: GraduationCap },
      { href: '/teacher/library', label: 'Материалы', icon: Library },
      { href: '/messages', label: 'Сообщения', icon: MessageCircle },
      { href: '/teacher/scene-player', label: 'Плеер сцен', icon: Clapperboard },
      { href: '/ai', label: 'Нейролаборатория', icon: Sparkles },
      { href: '/profile', label: 'Профиль', icon: User },
    ],
  },
];

// Навигация методиста (роль METHODIST): программа и конструктор сцен.
export const METHODIST_SIDEBAR_SECTIONS: SidebarSection[] = [
  {
    items: [
      { href: '/constructor', label: 'Конструктор', icon: Blocks },
      { href: '/teacher/library', label: 'Материалы', icon: Library },
      { href: '/ai', label: 'Нейролаборатория', icon: Sparkles },
      { href: '/profile', label: 'Профиль', icon: User },
    ],
  },
];

export function isActive(itemHref: string, pathname: string): boolean {
  if (itemHref === '/') return pathname === '/';
  if (itemHref === '/teacher') return pathname === '/teacher';
  return pathname === itemHref || pathname.startsWith(itemHref + '/');
}
