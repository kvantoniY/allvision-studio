'use client';

import Link from 'next/link';
import { ArrowRight, Coins, Grid3X3, ImageIcon, Palette, Sparkles, TrendingUp, Wallet } from 'lucide-react';
import { HeroSection } from '@/components/landing/HeroSection';
import { ServicesGrid } from '@/components/landing/ServicesGrid';
import { HowItWorksSection } from '@/components/landing/HowItWorksSection';
import { ExamplesGallery } from '@/components/landing/ExamplesGallery';
import { TestimonialsSection } from '@/components/landing/TestimonialsSection';
import { PricingSection } from '@/components/landing/PricingSection';
import { FAQSection } from '@/components/landing/FAQSection';
import { CTASection } from '@/components/landing/CTASection';
import { DashboardSidebar } from '@/components/dashboard/DashboardSidebar';
import { ProjectCard } from '@/components/dashboard/ProjectCard';
import { StatCard } from '@/components/dashboard/StatCard';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/use-auth';
import { useGetDashboardQuery } from '@/store/api/account-api';
import { useListProjectsQuery } from '@/store/api/projects-api';
import { useListServicesQuery } from '@/store/api/services-api';
import { useGetPublicMediaAssetsQuery } from '@/store/api/public-api';
import { giftServicePriceFrom } from '@/lib/gift-factory';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:4000');

function mediaUrl(value?: string | null) {
  if (!value) return null;
  if (value.startsWith('/static/')) return `${API_URL}${value}`;
  return value;
}

function LandingHome() {
  return (
    <>
      <HeroSection />
      <ServicesGrid />
      <HowItWorksSection />
      <ExamplesGallery />
      <TestimonialsSection />
      <PricingSection />
      <FAQSection />
      <CTASection />
    </>
  );
}

const quickActions = [
  {
    title: 'Создать через чат AI',
    description: 'Свободный промпт, выбор модели и референсы из Студии.',
    href: '/ai',
    icon: Sparkles,
  },
  {
    title: 'Запустить услугу',
    description: 'Готовые пайплайны для фото, трендов и видео-подарков.',
    href: '/services',
    icon: Grid3X3,
  },
  {
    title: 'Открыть Студию',
    description: 'Аватары, локации и история ваших генераций.',
    href: '/studio',
    icon: Palette,
  },
];

export function HomePageContent() {
  const { user, isLoading: isAuthLoading } = useAuth();

  if (isAuthLoading) {
    return (
      <div className="container py-16">
        <Skeleton className="h-12 w-80" />
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-44 rounded-lg" />)}
        </div>
      </div>
    );
  }

  if (!user) return <LandingHome />;

  return (
    <div className="flex min-h-[calc(100vh-64px)]">
      <DashboardSidebar />
      <main className="min-w-0 flex-1 bg-slate-950">
        <div className="container space-y-8 py-8">
          <AuthedHome />
        </div>
      </main>
    </div>
  );
}

function AuthedHome() {
  const { user } = useAuth();
  const dashboard = useGetDashboardQuery();
  const projects = useListProjectsQuery({ page: 1, limit: 6 });
  const trends = useGetPublicMediaAssetsQuery({ kind: 'trend-video', active: true });
  const featured = useListServicesQuery({ featured: true });

  if (!user) return null;

  const stats = dashboard.data?.stats;
  const recentProjects = projects.data?.items ?? [];
  const trendItems = trends.data?.assets ?? [];
  const featuredServices = (featured.data?.services ?? []).slice(0, 4);

  return (
    <>
      <section className="rounded-lg border border-slate-800 bg-slate-900 p-6">
        <div className="flex flex-wrap items-center justify-between gap-5">
          <div>
            <p className="text-sm font-medium text-violet-300">Главная</p>
            <h1 className="mt-2 text-3xl font-bold text-white md:text-4xl">
              Привет, {user.name ?? user.email}! Что создадим сегодня?
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
              Выберите быстрый старт: свободный чат, готовую услугу или материалы из вашей Студии.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild className="bg-violet-600 hover:bg-violet-500">
              <Link href="/ai">
                <Sparkles className="h-4 w-4" />
                Чат AI
              </Link>
            </Button>
            <Button asChild variant="outline" className="border-slate-700 bg-slate-950">
              <Link href="/services">Услуги</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {quickActions.map((action) => {
          const Icon = action.icon;
          return (
            <Link key={action.href} href={action.href} className="group">
              <Card className="h-full border-slate-800 bg-slate-900 transition hover:border-violet-500/70">
                <CardContent className="flex h-full flex-col gap-4 p-5">
                  <div className="flex items-start justify-between">
                    <span className="grid h-11 w-11 place-items-center rounded-md bg-violet-500/10 text-violet-300">
                      <Icon className="h-5 w-5" />
                    </span>
                    <ArrowRight className="h-4 w-4 text-violet-300 transition group-hover:translate-x-1" />
                  </div>
                  <div>
                    <h2 className="font-semibold text-white">{action.title}</h2>
                    <p className="mt-2 text-sm leading-6 text-slate-400">{action.description}</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </section>

      <section>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold text-white">Последние проекты</h2>
          <Link href="/studio" className="text-sm text-violet-300 hover:underline">История в Студии</Link>
        </div>
        {projects.isLoading ? (
          <div className="grid gap-4 md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-64 rounded-lg" />)}
          </div>
        ) : recentProjects.length === 0 ? (
          <EmptyState
            icon={<ImageIcon className="h-full w-full" />}
            title="Проектов пока нет"
            description="Начните с чата AI или выберите готовую услугу"
            actions={[{ label: 'Создать через чат', href: '/ai' }, { label: 'Открыть услуги', href: '/services' }]}
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {recentProjects.map((project) => <ProjectCard key={project.id} project={project} />)}
          </div>
        )}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div>
          <div className="mb-4 flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-amber-300" />
            <h2 className="text-xl font-semibold text-white">Новые тренды</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {trendItems.slice(0, 4).map((trend) => {
              const url = mediaUrl(trend.publicUrl);
              return (
                <Card key={trend.id} className="overflow-hidden border-slate-800 bg-slate-900">
                  <div className="aspect-video bg-slate-950">
                    {url ? <video src={url} className="h-full w-full object-cover" muted playsInline /> : null}
                  </div>
                  <CardContent className="p-4">
                    <div className="line-clamp-1 font-medium text-white">{trend.title}</div>
                    <div className="mt-1 text-xs text-slate-500">Библиотека сайта</div>
                  </CardContent>
                </Card>
              );
            })}
            {!trends.isLoading && trendItems.length === 0 && (
              <Card className="border-dashed border-slate-800 bg-slate-900">
                <CardContent className="p-6 text-sm text-slate-500">Тренды пока не добавлены.</CardContent>
              </Card>
            )}
          </div>
        </div>

        <div>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold text-white">Популярные услуги</h2>
            <Link href="/services" className="text-sm text-violet-300 hover:underline">Все</Link>
          </div>
          <div className="grid gap-3">
            {featuredServices.map((service) => (
              <Link key={service.id} href={`/services/${service.slug}`} className="group">
                <Card className="border-slate-800 bg-slate-900 transition hover:border-amber-400/60">
                  <CardContent className="flex items-center justify-between gap-4 p-4">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-white">{service.title}</div>
                      <div className="mt-1 line-clamp-1 text-sm text-slate-400">{service.shortDesc}</div>
                    </div>
                    <div className="shrink-0 text-sm font-semibold text-amber-300">
                      от {giftServicePriceFrom(service)}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <StatCard icon={<Coins className="h-5 w-5" />} label="Баланс" value={user.tokenBalance} hint="коинов" accent="amber" cta={{ label: 'Пополнить', href: '/profile?tab=billing' }} />
        <StatCard icon={<ImageIcon className="h-5 w-5" />} label="Всего создано" value={stats?.totalProjects ?? 0} hint={`Готово: ${stats?.completedProjects ?? 0}`} accent="violet" />
        <StatCard icon={<Wallet className="h-5 w-5" />} label="Потрачено" value={stats?.totalSpent ?? 0} hint="коинов" accent="emerald" />
        <StatCard icon={<Sparkles className="h-5 w-5" />} label="Регулярность" value={Math.max(0, stats?.completedProjects ?? 0)} hint="готовых результатов" accent="sky" />
      </section>
    </>
  );
}
