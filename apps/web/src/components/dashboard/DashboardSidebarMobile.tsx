'use client';

import { useState } from 'react';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { DashboardSidebarContent } from './DashboardSidebar';

export function DashboardSidebarMobile() {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Открыть меню кабинета" className="md:hidden">
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="academy-theme w-72 bg-card p-0 text-foreground">
        <SheetHeader className="border-b border-border p-4">
          <SheetTitle>Allvision Academy</SheetTitle>
        </SheetHeader>
        <DashboardSidebarContent onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
