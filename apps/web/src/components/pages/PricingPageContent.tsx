'use client';

import { useState } from 'react';
import { TicketPercent } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PricingCards } from '@/components/public/PricingCards';
import { getPackageUsage, pricingFaqs } from '@/lib/public-content';
import { useGetTokenPackagesQuery } from '@/store/api/public-api';

export function PricingPageContent() {
  const { data, isLoading } = useGetTokenPackagesQuery();
  const [promoCode, setPromoCode] = useState('');
  const [promoMessage, setPromoMessage] = useState('');

  return (
    <section className="container py-14 md:py-20">
      <div className="mx-auto max-w-3xl text-center">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-indigo-500">Цены</p>
        <h1 className="mt-3 text-4xl font-bold md:text-6xl">Простая оплата — только за то что используете</h1>
        <p className="mt-5 text-lg leading-8 text-muted-foreground">
          Пополняйте баланс коинами и запускайте готовые подарки без подписки. Заказные видео оцениваются отдельно до начала работы.
        </p>
      </div>

      <div className="mt-10">
        <PricingCards packages={data?.packages} isLoading={isLoading} fallbackHref="/login?redirect=/pricing" />
      </div>

      <div className="mx-auto mt-8 max-w-2xl rounded-lg border bg-card px-5 dark:border-slate-800">
        <Accordion type="single" collapsible>
          <AccordionItem value="promo" className="border-b-0">
            <AccordionTrigger className="text-left">
              <span className="inline-flex items-center gap-2">
                <TicketPercent className="h-4 w-4 text-amber-400" />
                У меня промокод
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Input
                  value={promoCode}
                  onChange={(event) => {
                    setPromoCode(event.target.value);
                    setPromoMessage('');
                  }}
                  placeholder="Введите код"
                  className="uppercase"
                />
                <Button
                  type="button"
                  className="bg-amber-500 text-slate-950 hover:bg-amber-400"
                  onClick={() => setPromoMessage('Промокоды появятся в ближайшее время')}
                >
                  Применить
                </Button>
              </div>
              {promoMessage && <p className="mt-3 text-sm text-muted-foreground">{promoMessage}</p>}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>

      <div className="mt-12 overflow-hidden rounded-lg border bg-card dark:border-slate-800">
        <div className="border-b p-6 dark:border-slate-800">
          <h2 className="text-2xl font-bold">Что можно сделать на каждом пакете</h2>
          <p className="mt-2 text-muted-foreground">Расчёт примерный: итог зависит от выбранных услуг и количества повторных запусков.</p>
        </div>
        <div className="divide-y dark:divide-slate-800">
          {(data?.packages ?? []).map((pkg) => (
            <div key={pkg.id} className="grid gap-3 p-6 md:grid-cols-[220px_1fr]">
              <div className="font-semibold">На {pkg.tokens} коинов</div>
              <div className="text-muted-foreground">{getPackageUsage(pkg.tokens)}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-12 grid gap-8 lg:grid-cols-[0.7fr_1fr]">
        <div>
          <h2 className="text-3xl font-bold">FAQ по оплате</h2>
          <p className="mt-3 leading-7 text-muted-foreground">
            Вопросы про срок действия коинов, возвраты, платежи и безопасность оплаты.
          </p>
        </div>
        <div className="rounded-lg border bg-card px-5 dark:border-slate-800">
          <Accordion type="single" collapsible>
            {pricingFaqs.map((item, index) => (
              <AccordionItem key={item.question} value={`pricing-${index}`}>
                <AccordionTrigger className="text-left">{item.question}</AccordionTrigger>
                <AccordionContent className="leading-7 text-muted-foreground">{item.answer}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </section>
  );
}
