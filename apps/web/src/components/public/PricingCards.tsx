'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, Loader2, Sparkles } from 'lucide-react';
import { formatTokensWord } from '@allvision/shared';
import type { PublicTokenPackage } from '@allvision/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { useCheckPromoCodeMutation, useTopupMutation } from '@/store/api/payments-api';
import { getPackageTotal } from '@/lib/public-content';
import { submitPaymentConfirmation } from '@/lib/payment-confirmation';
import { cn } from '@/lib/utils';
import { TokenIcon } from '@/components/ui/token-icon';

const DEFAULT_PACKAGE_FEATURES = [
  'Токены зачисляются ровно по настройке пакета',
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
  const [checkPromo, promoState] = useCheckPromoCodeMutation();
  const [promoInput, setPromoInput] = useState('');
  const [promo, setPromo] = useState<PromoTerms | null>(null);

  const applyPromo = async () => {
    if (!promoInput.trim()) return;
    try {
      const result = await checkPromo({ code: promoInput }).unwrap();
      setPromo(result.promo);
      toast({ title: `Промокод ${result.promo.code} применён`, description: 'Цены пересчитаны ниже.' });
    } catch (err) {
      setPromo(null);
      const message = (err as { data?: { error?: { message?: string } } })?.data?.error?.message;
      toast({ title: 'Промокод не подошёл', description: message, variant: 'destructive' });
    }
  };

  const handleBuy = async (tokenPackageId: string) => {
    if (!user) {
      router.push(fallbackHref);
      return;
    }

    try {
      // Код передаём серверу: итоговую сумму всё равно считает он, здесь только показ.
      const result = await topup({ tokenPackageId, ...(promo ? { promoCode: promo.code } : {}) }).unwrap();
      submitPaymentConfirmation(result);
    } catch {
      toast({
        title: 'Не удалось создать платёж',
        description: 'Попробуйте ещё раз через несколько секунд.',
        variant: 'destructive',
      });
    }
  };

  const items = packages ?? [];
  // Колонок ровно столько, сколько пакетов (но не больше четырёх), и ряд центрируется.
  const columnsClass = items.length >= 4
    ? 'sm:grid-cols-2 lg:grid-cols-4'
    : items.length === 3
      ? 'sm:grid-cols-2 lg:grid-cols-3'
      : items.length === 2
        ? 'sm:grid-cols-2'
        : 'sm:grid-cols-1';

  if (isLoading) {
    return (
      <div className="grid w-full gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-72 rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/*
        * Поле промокода стоит НАД пакетами, а не в каждой карточке: код один на покупку, и
        * скидку надо увидеть сразу на всех вариантах, чтобы выбрать осознанно.
        */}
      <div className="flex w-full max-w-md flex-wrap items-center gap-2">
        <Input
          value={promoInput}
          onChange={(event) => setPromoInput(event.target.value.toUpperCase())}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void applyPromo();
          }}
          placeholder="Промокод"
          aria-label="Промокод"
          className="h-10 flex-1 font-mono uppercase"
        />
        {promo ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setPromo(null);
              setPromoInput('');
            }}
          >
            Убрать
          </Button>
        ) : (
          <Button type="button" variant="outline" disabled={promoState.isLoading || !promoInput.trim()} onClick={() => void applyPromo()}>
            {promoState.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Применить
          </Button>
        )}
      </div>

      {promo && (
        <p className="text-sm text-emerald-300">
          {promo.code}: скидка {promo.discountType === 'PERCENT' ? `${promo.discountValue}%` : `${promo.discountValue} ₽`} на пополнение.
          Токенов начислится столько же.
        </p>
      )}

      <div className={cn('grid w-full gap-5', columnsClass)}>
        {items.map((pkg) => (
          <TokenPackageCard
            key={pkg.id}
            pkg={pkg}
            onBuy={handleBuy}
            userPresent={!!user}
            fallbackHref={fallbackHref}
            isTopupLoading={isTopupLoading}
            activePackageId={originalArgs?.tokenPackageId}
            promo={promo}
          />
        ))}
      </div>
    </div>
  );
}

/** Условия применённого кода: тип и величина скидки. */
type PromoTerms = { code: string; discountType: 'PERCENT' | 'FIXED'; discountValue: number; description: string | null };

/**
 * Цена пакета со скидкой — предпросмотр.
 *
 * Считаем ровно по тому же правилу, что и сервер (процент вниз, минимум рубль к оплате),
 * но окончательная сумма всё равно считается там: показывать одно, а списывать другое
 * нельзя, и единственный способ этого избежать — повторить формулу буква в букву.
 */
function promoPriceRub(priceRub: number, promo: PromoTerms | null): number | null {
  if (!promo) return null;
  const discount = promo.discountType === 'PERCENT'
    ? Math.floor((priceRub * promo.discountValue) / 100)
    : promo.discountValue;
  const capped = Math.max(0, Math.min(discount, priceRub - 1));
  return capped > 0 ? priceRub - capped : null;
}

function TokenPackageCard({
  pkg,
  onBuy,
  userPresent,
  fallbackHref,
  isTopupLoading,
  activePackageId,
  promo,
}: {
  pkg: PublicTokenPackage;
  onBuy: (id: string) => void;
  userPresent: boolean;
  fallbackHref: string;
  isTopupLoading: boolean;
  activePackageId?: string;
  promo?: PromoTerms | null;
}) {
  const promoPrice = promoPriceRub(pkg.priceRub, promo ?? null);
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
              {pkg.subtitle || `${formatTokensWord(getPackageTotal(pkg))} на баланс`}
            </p>
          </div>
          <div className="rounded-md bg-indigo-100 p-2 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-200">
            <TokenIcon className="h-5 w-5" />
          </div>
        </div>
        <div className="mt-5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          {/* С промокодом обычную цену зачёркиваем: скидка должна быть видна, а не подразумеваться. */}
          {promoPrice != null ? (
            <>
              <span className="text-lg font-semibold text-muted-foreground line-through">{pkg.priceRub} ₽</span>
              <span className="text-3xl font-bold text-emerald-500 dark:text-emerald-300">{promoPrice} ₽</span>
            </>
          ) : (
            <>
              {pkg.originalPriceRub && pkg.originalPriceRub > pkg.priceRub && (
                <span className="text-lg font-semibold text-muted-foreground line-through">{pkg.originalPriceRub} ₽</span>
              )}
              <span className="text-3xl font-bold">{pkg.priceRub} ₽</span>
            </>
          )}
          <span className="text-sm text-muted-foreground">разово</span>
        </div>
        {pkg.bonus > 0 && (
          <Badge variant="secondary" className="w-fit bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200">
            +{formatTokensWord(pkg.bonus)} бонусом
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
