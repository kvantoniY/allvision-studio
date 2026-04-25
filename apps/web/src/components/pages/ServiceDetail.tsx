'use client';

import Link from 'next/link';
import Image from 'next/image';
import { CheckCircle2, Coins, Lock, Sparkles } from 'lucide-react';
import { ServiceCard } from '@/components/public/ServiceCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import {
  getServiceActionLabel,
  getServiceBadgeLabel,
  getServicePriceLabel,
  getServiceStatusLabel,
  landingFaqs,
} from '@/lib/public-content';
import { useGetServiceQuery, useGetServicesQuery } from '@/store/api/public-api';

type ServiceDetailProps = {
  slug: string;
};

export function ServiceDetail({ slug }: ServiceDetailProps) {
  const { data, isLoading, isError } = useGetServiceQuery(slug);
  const { data: servicesData } = useGetServicesQuery();
  const { user } = useAuth();
  const { toast } = useToast();
  const service = data?.service;
  const related = (servicesData?.services ?? [])
    .filter((item) => item.slug !== slug && (item.processingType === service?.processingType || item.category === service?.category))
    .slice(0, 3);

  if (isLoading) {
    return (
      <div className="container py-14">
        <Skeleton className="h-[420px] rounded-xl" />
        <div className="mt-8 grid gap-5 md:grid-cols-3">
          <Skeleton className="h-44 rounded-xl" />
          <Skeleton className="h-44 rounded-xl" />
          <Skeleton className="h-44 rounded-xl" />
        </div>
      </div>
    );
  }

  if (isError || !service) {
    return (
      <section className="container py-20">
        <div className="max-w-2xl rounded-xl border border-slate-800 bg-slate-900 p-8">
          <h1 className="text-3xl font-bold">Услуга не найдена</h1>
          <p className="mt-3 text-muted-foreground">Возможно, ссылка устарела или услуга временно скрыта из каталога.</p>
          <Button asChild className="mt-6">
            <Link href="/services">Вернуться к услугам</Link>
          </Button>
        </div>
      </section>
    );
  }

  const isOrderOnly = service.processingType === 'MANUAL';
  const isTokenService = service.processingType !== 'MANUAL';
  const hasEnoughTokens = !!user && user.tokenBalance >= service.priceTokens;
  const registerHref = `/register?redirect=/services/${service.slug}`;

  return (
    <section className="container py-14 md:py-20">
      <div className="grid gap-10 lg:grid-cols-[1fr_0.85fr] lg:items-center">
        <div>
          <Badge variant="secondary" className="bg-slate-800 text-indigo-100 hover:bg-slate-700">
            {getServiceBadgeLabel(service)}
          </Badge>
          <h1 className="mt-5 text-4xl font-black leading-none tracking-tight md:text-6xl">{service.title}</h1>
          <p className="mt-5 text-lg leading-8 text-muted-foreground">{service.shortDesc}</p>

          <div className="mt-7 flex flex-wrap items-center gap-4">
            <div className="rounded-xl border border-slate-800 bg-slate-900 px-5 py-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Coins className="h-4 w-4 text-amber-400" />
                Цена
              </div>
              <div className="mt-1 text-2xl font-bold text-amber-400">{getServicePriceLabel(service)}</div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900 px-5 py-4">
              <div className="text-sm text-muted-foreground">Формат запуска</div>
              <div className="mt-1 text-2xl font-bold text-slate-50">{getServiceStatusLabel(service)}</div>
            </div>
          </div>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
            {!user ? (
              <Button asChild size="lg" className="bg-amber-500 text-slate-950 hover:bg-amber-400">
                <Link href={registerHref}>
                  {getServiceActionLabel(service)}
                  <Lock className="h-4 w-4" />
                </Link>
              </Button>
            ) : isOrderOnly ? (
              <Button disabled size="lg" className="bg-slate-800 text-slate-400">
                Оставить заявку (Этап 1.7)
              </Button>
            ) : hasEnoughTokens ? (
              <Button
                size="lg"
                className="bg-amber-500 text-slate-950 hover:bg-amber-400"
                onClick={() =>
                  toast({
                    title: 'Генерация появится на следующем этапе',
                    description: `Баланс позволяет запустить услугу за ${service.priceTokens} токенов.`,
                  })
                }
              >
                Создать за {service.priceTokens} токенов
              </Button>
            ) : (
              <>
                <Button disabled size="lg" className="bg-slate-800 text-slate-400">
                  Недостаточно токенов
                </Button>
                <Button asChild size="lg" variant="outline" className="border-slate-700 bg-slate-800 text-slate-100 hover:bg-slate-700">
                  <Link href="/pricing">Пополнить баланс</Link>
                </Button>
              </>
            )}
            {user && isTokenService && !hasEnoughTokens && (
              <span className="text-sm text-muted-foreground">Баланс: {user.tokenBalance} токенов</span>
            )}
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900 p-3 shadow-xl shadow-violet-500/10">
          <Image
            src={service.coverImage ?? service.galleryImages[0]}
            alt={service.title}
            width={800}
            height={600}
            className="h-[360px] w-full rounded-lg object-cover md:h-[520px]"
          />
        </div>
      </div>

      <Tabs defaultValue="description" className="mt-14">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-2 bg-transparent p-0">
          {[
            ['description', 'Описание'],
            ['examples', 'Примеры работ'],
            ['process', 'Как это работает'],
            ['faq', 'FAQ'],
          ].map(([value, label]) => (
            <TabsTrigger
              key={value}
              value={value}
              className="rounded-md border border-slate-800 bg-slate-900 px-4 py-2 transition hover:bg-slate-800 data-[state=active]:border-indigo-500 data-[state=active]:bg-slate-800"
            >
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="description" className="mt-8">
          <div className="max-w-4xl space-y-5 text-lg leading-8 text-muted-foreground">
            {service.description.split('\n\n').map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
        </TabsContent>
        <TabsContent value="examples" className="mt-8">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {service.galleryImages.map((image, index) => (
              <Image
                key={image}
                src={image}
                alt={`${service.title} пример ${index + 1}`}
                width={800}
                height={600}
                className="h-64 w-full rounded-xl border border-slate-800 object-cover"
              />
            ))}
          </div>
        </TabsContent>
        <TabsContent value="process" className="mt-8">
          <div className="grid gap-5 md:grid-cols-3">
            {[
              service.processingType === 'AUTO' ? 'Загрузите исходное фото и выберите параметры обработки.' : 'Опишите задачу, героев, стиль и желаемую длительность.',
              service.processingType === 'MANUAL' ? 'Администратор связывается, уточняет детали и согласует стоимость.' : 'Система проверяет баланс и запускает подготовленный AI-процесс.',
              service.processingType === 'HYBRID' ? 'Получите AI-сценарий, а затем перейдите к ручному производству видео.' : 'Получите готовый файл или согласованный результат в кабинете.',
            ].map((text, index) => (
              <div key={text} className="rounded-xl border border-slate-800 bg-slate-900 p-5">
                <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                <div className="mt-4 text-sm font-semibold text-amber-500">Шаг {index + 1}</div>
                <p className="mt-2 leading-7 text-muted-foreground">{text}</p>
              </div>
            ))}
          </div>
        </TabsContent>
        <TabsContent value="faq" className="mt-8">
          <div className="grid gap-5 md:grid-cols-2">
            {landingFaqs.slice(0, 4).map((item) => (
              <div key={item.question} className="rounded-xl border border-slate-800 bg-slate-900 p-5">
                <h3 className="font-semibold">{item.question}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.answer}</p>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {related.length > 0 && (
        <div className="mt-16">
          <div className="mb-6 flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-amber-500" />
            <h2 className="text-2xl font-bold tracking-tight">Похожие услуги</h2>
          </div>
          <div className="grid auto-rows-fr gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((item) => (
              <ServiceCard key={item.id} service={item} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
