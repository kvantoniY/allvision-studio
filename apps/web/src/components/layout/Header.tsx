'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Grid3X3, Home, LogOut, Menu, Palette, Sparkles, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BrandLogo } from '@/components/ui/brand-logo';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DashboardSidebarMobile } from '@/components/dashboard/DashboardSidebarMobile';
import { TokenIcon } from '@/components/ui/token-icon';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/hooks/use-auth';

const navItems = [
  { href: '/services', label: 'Услуги' },
  { href: '/trends', label: 'Тренды' },
  { href: '/scenarios', label: 'Сценарии' },
  { href: '/pricing', label: 'Цены' },
];

const userNavItems = [
  { href: '/', label: 'Главная', icon: Home },
  { href: '/ai', label: 'Allvision AI', icon: Sparkles },
  { href: '/services', label: 'Услуги', icon: Grid3X3 },
  { href: '/studio', label: 'Студия', icon: Palette },
  { href: '/profile', label: 'Профиль', icon: User },
];

function initialsOf(name: string | null | undefined, email: string) {
  if (name) {
    const parts = name.trim().split(/\s+/);
    return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
  }
  return email[0]?.toUpperCase() ?? '?';
}

export function Header() {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const userWorkspaceRoute = !!user && (
    pathname === '/' ||
    pathname?.startsWith('/ai') ||
    pathname?.startsWith('/services') ||
    pathname?.startsWith('/studio') ||
    pathname?.startsWith('/profile') ||
    pathname?.startsWith('/dashboard')
  );
  const visibleNavItems = user ? userNavItems : navItems;

  // Шапка полупрозрачная: сквозь неё видно звёздный фон страницы, и верх экрана
  // перестаёт выглядеть отрезанной серой полосой. Размытие здесь дешёвое — полоса
  // высотой 64px, а не экран целиком.
  return (
    <header className="sticky top-0 z-40 w-full border-b border-white/10 bg-slate-950/70 backdrop-blur-xl">
      <div className="container flex h-16 items-center justify-between">
        <div className="flex items-center gap-2">
          {userWorkspaceRoute && <DashboardSidebarMobile />}
          {/*
           * На узком экране остаётся только знак: вместе с «Вход» и «Регистрация»
           * полное название не помещалось в 390px и переносилось на вторую строку,
           * ломая шапку.
           */}
          <Link href="/" className="flex shrink-0 items-center gap-2 font-semibold">
            <BrandLogo className="h-6 w-auto shrink-0" />
            <span className="hidden whitespace-nowrap sm:inline">Allvision Studio</span>
          </Link>
        </div>

        <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
          {visibleNavItems.map((item) => (
            <Link key={item.href} href={item.href} className="hover:text-foreground transition-colors">
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="Открыть меню">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>Allvision Studio</SheetTitle>
              </SheetHeader>
              <nav className="mt-8 grid gap-4">
                {visibleNavItems.map((item) => (
                  <Link key={item.href} href={item.href} className="text-lg font-medium">
                    {item.label}
                  </Link>
                ))}
                {!user && (
                  <>
                    <Link href="/contacts" className="text-lg font-medium">
                      Контакты
                    </Link>
                  </>
                )}
              </nav>
            </SheetContent>
          </Sheet>
          {user ? (
            <div className="flex items-center gap-2">
              <Link
                href="/profile?tab=billing"
                className="hidden items-baseline gap-1 rounded-full bg-slate-800 px-3 py-1 text-sm font-semibold text-amber-400 transition hover:bg-slate-700 sm:inline-flex"
              >
                <TokenIcon className="h-4 w-4" />
                <span>{user.tokenBalance}</span>
                <span className="text-xs font-normal text-slate-400">токенов</span>
              </Link>
              <DropdownMenu>
                <TooltipProvider delayDuration={150}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <DropdownMenuTrigger asChild>
                        <button className="flex items-center gap-2 rounded-full px-2 py-1 transition-colors hover:bg-slate-800">
                          <Avatar className="h-8 w-8">
                            {user.avatar && <AvatarImage src={user.avatar} alt={user.name ?? user.email} />}
                            <AvatarFallback>{initialsOf(user.name, user.email)}</AvatarFallback>
                          </Avatar>
                          <span className="hidden max-w-32 truncate text-sm font-medium sm:inline">{user.name ?? user.email}</span>
                        </button>
                      </DropdownMenuTrigger>
                    </TooltipTrigger>
                    <TooltipContent>Нажмите для меню</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <DropdownMenuContent align="end" className="w-64">
                  <DropdownMenuLabel>{user.name ?? user.email}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <div className="px-2 py-2">
                    <div className="flex items-center justify-between rounded-md bg-slate-800 px-3 py-2">
                      <span className="flex items-center gap-2 text-sm text-slate-200">
                        <TokenIcon className="h-4 w-4 text-amber-400" />
                        {user.tokenBalance} токенов
                      </span>
                      <Button asChild size="sm" className="h-8 bg-amber-500 text-slate-950 hover:bg-amber-400">
                        <Link href="/profile?tab=billing">Пополнить</Link>
                      </Button>
                    </div>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/" className="cursor-pointer">
                      <Home className="mr-2 h-4 w-4" /> Главная
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/profile?tab=billing" className="cursor-pointer">
                      <TokenIcon className="mr-2 h-4 w-4" /> Купить токены
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={logout} className="cursor-pointer">
                    <LogOut className="mr-2 h-4 w-4" /> Выйти
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm" className="text-slate-200 hover:text-white">
                <Link href="/login">Вход</Link>
              </Button>
              <Button asChild size="sm" className="av-btn-gradient h-9 rounded-full px-4 font-bold">
                <Link href="/register">Регистрация</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
