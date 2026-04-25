'use client';

import Link from 'next/link';
import { Check, Coins, Sparkles } from 'lucide-react';
import type { PublicTokenPackage } from '@allvision/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { getPackageTotal } from '@/lib/public-content';
import { cn } from '@/lib/utils';

type PricingCardsProps = {
  packages?: PublicTokenPackage[];
  isLoading?: boolean;
  fallbackHref?: string;
};

export function PricingCards({ packages, isLoading, fallbackHref = '/pricing' }: PricingCardsProps) {
  const { user } = useAuth();
  const { toast } = useToast();

  if (isLoading) {
    return (
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-72 rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
      {(packages ?? []).map((pkg) => (
        <Card
          key={pkg.id}
          className={cn(
            'relative flex flex-col border-slate-200/70 bg-card/80 dark:border-slate-800',
            pkg.isPopular && 'border-amber-400 shadow-xl shadow-amber-500/10',
          )}
        >
          {pkg.isPopular && (
            <div className="absolute -top-3 left-4">
              <Badge className="border-amber-400 bg-amber-500 text-slate-950">Выбирают чаще всего</Badge>
            </div>
          )}
          <CardHeader className="pt-7">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-xl font-semibold">{pkg.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{getPackageTotal(pkg)} токенов на баланс</p>
              </div>
              <div className="rounded-md bg-indigo-100 p-2 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-200">
                <Coins className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-5">
              <span className="text-3xl font-bold">{pkg.priceRub} ₽</span>
              <span className="ml-2 text-sm text-muted-foreground">разово</span>
            </div>
            {pkg.bonus > 0 && (
              <Badge variant="secondary" className="w-fit bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200">
                +{pkg.bonus} токенов в подарок
              </Badge>
            )}
          </CardHeader>
          <CardContent className="flex-1">
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li className="flex gap-2">
                <Check className="mt-0.5 h-4 w-4 text-emerald-500" />
                1 токен = 1 ₽ для автоматических услуг
              </li>
              <li className="flex gap-2">
                <Check className="mt-0.5 h-4 w-4 text-emerald-500" />
                Списание только после запуска обработки
              </li>
              <li className="flex gap-2">
                <Check className="mt-0.5 h-4 w-4 text-emerald-500" />
                Подходит для фото, анимаций и трендов
              </li>
            </ul>
          </CardContent>
          <CardFooter>
            {user ? (
              <Button
                className="w-full bg-amber-500 text-slate-950 hover:bg-amber-400"
                onClick={() =>
                  toast({
                    title: 'Чекаут появится на следующем этапе',
                    description: 'Баланс и mock-платежи уже подготовлены, но покупка пакетов будет подключена позже.',
                  })
                }
              >
                <Sparkles className="h-4 w-4" />
                Купить
              </Button>
            ) : (
              <Button asChild className="w-full bg-amber-500 text-slate-950 hover:bg-amber-400">
                <Link href={fallbackHref}>Купить</Link>
              </Button>
            )}
          </CardFooter>
        </Card>
      ))}
    </div>
  );
}
