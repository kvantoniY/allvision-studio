'use client';

import { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
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
      {/*
       * Своей строки заголовка у листа нет: её роль играет логотип внутри меню, а
       * шапка повторяла то же название вторым этажом. Для скринридера заголовок
       * остаётся скрытым текстом — Radix требует его у диалога.
       */}
      <SheetContent side="left" hideClose aria-describedby={undefined} className="w-72 p-0">
        <SheetTitle className="sr-only">Меню кабинета</SheetTitle>
        <DashboardSidebarContent
          onNavigate={() => setOpen(false)}
          headerAction={
            <SheetClose asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Скрыть меню"
                className="h-9 w-9 shrink-0 text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                <X className="h-5 w-5" />
              </Button>
            </SheetClose>
          }
        />
      </SheetContent>
    </Sheet>
  );
}
