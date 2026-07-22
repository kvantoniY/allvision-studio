'use client';

import { useState } from 'react';
import { Menu } from 'lucide-react';
import { BrandLogo } from '@/components/ui/brand-logo';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { AdminSidebarNav } from './AdminSidebarNav';

export function AdminMobileNav({ role = 'ADMIN' }: { role?: 'ADMIN' | 'METHODIST' }) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Открыть меню админки"
          className="-ml-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="academy-theme w-80 border-border bg-card p-0 text-foreground">
        <SheetHeader className="border-b border-border p-4 text-left">
          <SheetTitle className="flex items-center gap-2.5 text-base font-semibold tracking-tight text-foreground">
            <BrandLogo className="h-8 w-8" />
            Allvision Academy
            <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent-foreground ring-1 ring-inset ring-primary/15">
              {role === 'METHODIST' ? 'Методист' : 'Админ'}
            </span>
          </SheetTitle>
        </SheetHeader>
        <div className="overflow-y-auto p-4">
          <AdminSidebarNav role={role} onNavigate={() => setOpen(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
