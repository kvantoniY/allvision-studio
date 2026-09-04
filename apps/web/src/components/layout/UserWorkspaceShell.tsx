'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogOut } from 'lucide-react';

import { DashboardSidebar } from '@/components/dashboard/DashboardSidebar';
import { DashboardSidebarMobile } from '@/components/dashboard/DashboardSidebarMobile';
import { Footer } from '@/components/layout/Footer';
import { ProjectEventsBridge } from '@/components/realtime/ProjectEventsBridge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/hooks/use-auth';

import { TokenIcon } from '@/components/ui/token-icon';
function initialsOf(name: string | null | undefined, email: string) {
  if (name) {
    const parts = name.trim().split(/\s+/);
    return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
  }
  return email[0]?.toUpperCase() ?? '?';
}

export function UserWorkspaceShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const showPublicFooter = pathname === '/' || pathname?.startsWith('/services');
  // В редакторе меню свёрнуто в колонку иконок: каждый пиксель ширины там уходит на
  // холст и шкалу. Полное меню выезжает поверх при наведении, раскладка не съезжает.
  const railSidebar = Boolean(pathname?.startsWith('/editor'));

  /*
   * Оболочка кабинета БЕЗ своей заливки.
   *
   * Раньше здесь стоял непрозрачный `bg-slate-950`, и он закрывал звёздный фон: слой
   * AmbientBackground живёт внутри страницы с отрицательным z-index, то есть позади
   * этого элемента — и его фон перекрывал обои целиком. Цвет при этом не теряется:
   * тот же `slate-950` задан у `body` в globals.css, поэтому страницы без своих обоев
   * выглядят как прежде.
   */
  return (
    <div className="min-h-screen text-slate-100">
      {/* Realtime-обновление статусов генераций на любом экране (SSE); поллинг — фолбэк. */}
      <ProjectEventsBridge enabled={Boolean(user)} />
      <DashboardSidebar rail={railSidebar} />
      <div className={`flex min-h-screen min-w-0 flex-col ${railSidebar ? 'md:pl-16' : 'md:pl-64'}`}>
        {user && (
          <div className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-slate-800 bg-slate-950/95 px-3 backdrop-blur md:hidden">
            <DashboardSidebarMobile />
            <div className="flex items-center gap-2">
              <Link
                href="/profile?tab=billing"
                className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-2.5 py-1 text-sm font-semibold text-amber-300"
              >
                <TokenIcon className="h-4 w-4" />
                {user.tokenBalance}
              </Link>
              <Link href="/profile" className="rounded-full">
                <Avatar className="h-8 w-8">
                  {user.avatar && <AvatarImage src={user.avatar} alt={user.name ?? user.email} />}
                  <AvatarFallback>{initialsOf(user.name, user.email)}</AvatarFallback>
                </Avatar>
              </Link>
              <button
                type="button"
                onClick={() => { void logout(); }}
                aria-label="Выйти"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-700 bg-slate-900 text-slate-300 transition hover:border-rose-400 hover:text-rose-300"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
        <main className="min-w-0 flex-1">{children}</main>
        {showPublicFooter && <Footer />}
      </div>
    </div>
  );
}
