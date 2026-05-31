'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, Loader2, Sparkles } from 'lucide-react';
import type { PublicTokenPackage } from '@allvision/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { useTopupMutation } from '@/store/api/payments-api';
import { getPackageTotal } from '@/lib/public-content';
import { submitPaymentConfirmation } from '@/lib/payment-confirmation';
import { cn } from '@/lib/utils';
import { TokenIcon } from '@/components/ui/token-icon';

const DEFAULT_PACKAGE_FEATURES = [
  '1 токен = 1 ₽ для автоматических услуг',
  'Списание только после запуска обработки',
  'Подходит для фото, анимаций и трендов',
];

type PricingCardsProps = {
  packages?: PublicTokenPackage[];
  isLoading?: boolean;
  fallbackHref?: string;
};

function discountPercent(pkg: PublicTokenPackage) {
  if (!pkg.originalPriceRub || pkg.originalPriceRub <= pkg.priceRub) return null;
  return Math.max(1, Math.round((1 - pkg.priceRub / pkg.originalPriceRub) * 100));
}

export function PricingCards({ packages, isLoading, fallbackHref = '/pricing' }: PricingCardsProps) {
  const { user } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [topup, { isLoading: isTopupLoading, originalArgs }] = useTopupMutation();

  const handleBuy = async (tokenPackageId: string) => {
    if (!user) {
      router.push(fallbackHref);
      return;
    }

    try {
      const result = await topup({ tokenPackageId }).unwrap();
      submitPaymentConfirmation(result);
    } catch {
      toast({
        title: 'Не удалось создать платёж',
        description: 'Попробуйте ещё раз через несколько секунд.',
        variant: 'destructive',
      });
    }
  };

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
        <TokenPackageCard
          key={pkg.id}
          pkg={pkg}
          onBuy={handleBuy}
          userPresent={!!user}
          fallbackHref={fallbackHref}
          isTopupLoading={isTopupLoading}
          activePackageId={originalArgs?.tokenPackageId}
        />
      ))}
    </div>
  );
}

function TokenPackageCard({
  pkg,
  onBuy,
  userPresent,
  fallbackHref,
  isTopupLoading,
  activePackageId,
}: {
  pkg: PublicTokenPackage;
  onBuy: (id: string) => void;
  userPresent: boolean;
  fallbackHref: string;
  isTopupLoading: boolean;
  activePackageId?: string;
}) {
  const discount = discountPercent(pkg);
  const badgeText = pkg.badgeText || (pkg.isPopular ? 'Выбирают чаще всего' : '');
  const features = pkg.features?.length ? pkg.features : DEFAULT_PACKAGE_FEATURES;

  return (
    <Card
      className={cn(
        'relative flex flex-col border-slate-200/70 bg-card/80 dark:border-slate-800',
        pkg.isPopular && 'border-amber-400 shadow-xl shadow-amber-500/10',
      )}
    >
      {badgeText && (
        <div className="absolute -top-3 left-4 right-4 flex flex-wrap gap-2">
          <Badge className="border-amber-400 bg-amber-500 text-slate-950">{badgeText}</Badge>
          {discount && <Badge className="border-yellow-300 bg-yellow-400 text-slate-950">-{discount}%</Badge>}
        </div>
      )}
      {!badgeText && discount && (
        <div className="absolute -top-3 left-4">
          <Badge className="border-yellow-300 bg-yellow-400 text-slate-950">-{discount}%</Badge>
        </div>
      )}
      <CardHeader className="pt-7">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-xl font-semibold">{pkg.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {pkg.subtitle || `${getPackageTotal(pkg)} токенов на баланс`}
            </p>
          </div>
          <div className="rounded-md bg-indigo-100 p-2 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-200">
            <TokenIcon className="h-5 w-5" />
          </div>
        </div>
        <div className="mt-5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          {pkg.originalPriceRub && pkg.originalPriceRub > pkg.priceRub && (
            <span className="text-lg font-semibold text-muted-foreground line-through">{pkg.originalPriceRub} ₽</span>
          )}
          <span className="text-3xl font-bold">{pkg.priceRub} ₽</span>
          <span className="text-sm text-muted-foreground">разово</span>
        </div>
        {pkg.bonus > 0 && (
          <Badge variant="secondary" className="w-fit bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200">
            +{pkg.bonus} токенов бонусом
          </Badge>
        )}
      </CardHeader>
      <CardContent className="flex-1">
        <ul className="space-y-3 text-sm text-muted-foreground">
          {features.map((feature) => (
            <li key={feature} className="flex gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
              <span>{feature}</span>
            </li>
          ))}
        </ul>
      </CardContent>
      <CardFooter className="flex-col gap-3">
        {userPresent ? (
          <Button
            className="w-full bg-amber-500 text-slate-950 hover:bg-amber-400"
            disabled={isTopupLoading}
            onClick={() => onBuy(pkg.id)}
          >
            {isTopupLoading && activePackageId === pkg.id ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Купить
          </Button>
        ) : (
          <Button asChild className="w-full bg-amber-500 text-slate-950 hover:bg-amber-400">
            <Link href={fallbackHref}>Купить</Link>
          </Button>
        )}
        <p className="text-xs leading-5 text-muted-foreground">
          Нажимая «Купить», вы соглашаетесь с{' '}
          <Link href="/offer" className="underline underline-offset-4">
            офертой
          </Link>
          ,{' '}
          <Link href="/terms" className="underline underline-offset-4">
            соглашением
          </Link>{' '}
          и{' '}
          <Link href="/pd-consent" className="underline underline-offset-4">
            обработкой данных
          </Link>
          .
        </p>
      </CardFooter>
    </Card>
  );
}
