'use client';

import Link from 'next/link';
import { Menu } from 'lucide-react';
import { BrandLogo } from '@/components/ui/brand-logo';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';

const navItems = [
  { href: '/#directions', label: 'Направления' },
  { href: '/#lesson', label: 'Как проходит урок' },
  { href: '/#prices', label: 'Цены' },
  { href: '/#faq', label: 'Вопросы' },
  { href: '/about', label: 'О школе' },
];

export function Header() {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/70 bg-background/90 backdrop-blur-xl">
      <div className="container flex h-16 items-center justify-between">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <BrandLogo className="h-8 w-8" />
          <span>Allvision Academy</span>
        </Link>

        <nav className="hidden items-center gap-6 text-sm text-muted-foreground lg:flex">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} className="transition-colors hover:text-foreground">
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Открыть меню">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent className="academy-theme bg-background text-foreground">
              <SheetHeader>
                <SheetTitle>Allvision Academy</SheetTitle>
              </SheetHeader>
              <nav className="mt-8 grid gap-4">
                {navItems.map((item) => (
                  <Link key={item.href} href={item.href} className="text-lg font-medium">
                    {item.label}
                  </Link>
                ))}
                <Link href="/contacts" className="text-lg font-medium">Контакты</Link>
              </nav>
            </SheetContent>
          </Sheet>
          <Button asChild variant="ghost" size="sm">
            <Link href="/login">Войти</Link>
          </Button>
          <Button asChild size="sm" className="hidden sm:inline-flex">
            <Link href="/register?redirect=/family&intent=trial">Пробный урок</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
