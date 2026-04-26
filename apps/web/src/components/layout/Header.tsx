'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Coins, LogOut, Menu, Sparkles, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DashboardSidebarMobile } from '@/components/dashboard/DashboardSidebarMobile';
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
  { href: '/pricing', label: 'Цены' },
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
  const inDashboard = pathname?.startsWith('/dashboard') ?? false;

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/80 backdrop-blur">
      <div className="container flex h-16 items-center justify-between">
        <div className="flex items-center gap-2">
          {inDashboard && <DashboardSidebarMobile />}
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <Sparkles className="h-5 w-5 text-primary" />
            <span>Allvision Studio</span>
          </Link>
        </div>

        <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
          {navItems.map((item) => (
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
                {navItems.map((item) => (
                  <Link key={item.href} href={item.href} className="text-lg font-medium">
                    {item.label}
                  </Link>
                ))}
                <Link href="/about" className="text-lg font-medium">
                  О проекте
                </Link>
                <Link href="/contacts" className="text-lg font-medium">
                  Контакты
                </Link>
              </nav>
            </SheetContent>
          </Sheet>
          {user ? (
            <div className="flex items-center gap-2">
              <Link
                href="/pricing"
                className="hidden items-baseline gap-1 rounded-full bg-slate-800 px-3 py-1 text-sm font-semibold text-amber-400 transition hover:bg-slate-700 sm:inline-flex"
              >
                <Coins className="h-4 w-4" />
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
                        <Coins className="h-4 w-4 text-amber-400" />
                        {user.tokenBalance} токенов
                      </span>
                      <Button asChild size="sm" className="h-8 bg-amber-500 text-slate-950 hover:bg-amber-400">
                        <Link href="/pricing">Пополнить</Link>
                      </Button>
                    </div>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/dashboard" className="cursor-pointer">
                      <User className="mr-2 h-4 w-4" /> Кабинет
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/pricing" className="cursor-pointer">
                      <Coins className="mr-2 h-4 w-4" /> Купить токены
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
              <Button asChild variant="ghost" size="sm">
                <Link href="/login">Войти</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/register">Регистрация</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
