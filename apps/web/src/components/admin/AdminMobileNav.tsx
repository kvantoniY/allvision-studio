'use client';

import { useState } from 'react';
import { Menu } from 'lucide-react';
import { BrandLogo } from '@/components/ui/brand-logo';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { AdminSidebarNav } from './AdminSidebarNav';

export function AdminMobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Открыть меню админки"
          className="-ml-1 text-slate-300 hover:bg-violet-500/10 hover:text-white lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="admin-theme w-72 border-zinc-800 bg-zinc-950 p-0 text-slate-100">
        <SheetHeader className="border-b border-zinc-800/80 p-4 text-left">
          <SheetTitle className="flex items-center gap-2.5 text-base font-semibold tracking-tight text-white">
            <BrandLogo className="h-6 w-auto" />
            Allvision
            <span className="rounded-md bg-violet-500/15 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-violet-300 ring-1 ring-inset ring-violet-500/30">
              Admin
            </span>
          </SheetTitle>
        </SheetHeader>
        <div className="overflow-y-auto p-4">
          <AdminSidebarNav onNavigate={() => setOpen(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
