'use client';

import Link from 'next/link';
import {
  ArrowRight,
  Coins,
  FileText,
  Image as ImageIcon,
  Sparkles,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/use-auth';
import { useGetDashboardQuery } from '@/store/api/account-api';
import { useListCharactersQuery } from '@/store/api/characters-api';
import { useListProjectsQuery } from '@/store/api/projects-api';
import { useListScenesQuery } from '@/store/api/scenes-api';
import { useListEpisodesQuery } from '@/store/api/episodes-api';
import { StatCard } from '@/components/dashboard/StatCard';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { ProjectCard } from '@/components/dashboard/ProjectCard';
import { OrderCard } from '@/components/dashboard/OrderCard';
import { transactionDescription, formatDate } from '@/components/dashboard/labels';
import { StudioMetricIcon } from '@/components/studio/v3-labels';
import { cn } from '@/lib/utils';

const QUICK_START = [
  {
    title: 'Улучшить старое фото',
    desc: 'Реставрация и колоризация',
    href: '/services/photo-restore',
    price: 'от 20 токенов',
    icon: ImageIcon,
  },
  {
    title: 'Оживить фотографию',
    desc: 'Анимация лиц и сцен',
    href: '/services/photo-animate',
    price: 'от 50 токенов',
    icon: Sparkles,
  },
  {
    title: 'Видео в тренде',
    desc: 'Готовые форматы из ленты',
    href: '/services/trends',
    price: 'от 30 токенов',
    icon: TrendingUp,
  },
];

export default function DashboardPage() {
  const { user } = useAuth();
  const { data, isLoading } = useGetDashboardQuery();
  const { data: projectsData, isLoading: isProjectsLoading } = useListProjectsQuery({ page: 1, limit: 3 });
  const { data: charactersData } = useListCharactersQuery({ status: 'READY' });
  const { data: scenesData } = useListScenesQuery();
  const { data: episodesData } = useListEpisodesQuery({ page: 1, limit: 50 });

  if (!user) return null;

  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-72" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  const { stats, activeOrders, recentTransactions } = data;
  const recentProjects = projectsData?.items ?? [];
  const studioMetrics = [
    {
      kind: 'characters' as const,
      label: 'Персонажи',
      value: charactersData?.items.length ?? 0,
      href: '/dashboard/characters',
      cta: 'Создать первого',
    },
    {
      kind: 'scenes' as const,
      label: 'Сцены',
      value: scenesData?.items.length ?? 0,
      href: '/dashboard/scenes',
      cta: 'Создать первую',
    },
    {
      kind: 'episodes' as const,
      label: 'Эпизоды',
      value: episodesData?.items.filter((episode) => episode.status !== 'FAILED').length ?? 0,
      href: '/dashboard/episodes',
      cta: 'Создать первый',
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">
          Добро пожаловать, {user.name ?? user.email}! 👋
        </h1>
        <p className="mt-1 text-slate-400">Что создадим сегодня?</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<Coins className="h-5 w-5" />}
          label="Баланс токенов"
          value={user.tokenBalance}
          hint="1 токен = 1 ₽"
          accent="amber"
          cta={{ label: 'Пополнить', href: '/pricing' }}
        />
        <StatCard
          icon={<ImageIcon className="h-5 w-5" />}
          label="Всего проектов"
          value={stats.totalProjects}
          hint={`Завершено: ${stats.completedProjects}`}
          accent="violet"
        />
        <StatCard
          icon={<FileText className="h-5 w-5" />}
          label="Активных заказов"
          value={stats.activeOrders}
          accent="sky"
        />
        <StatCard
          icon={<Wallet className="h-5 w-5" />}
          label="Потрачено токенов"
          value={stats.totalSpent}
          hint={`≈ ${stats.totalSpent} ₽`}
          accent="emerald"
        />
      </div>

      <section>
        <h2 className="mb-4 text-xl font-semibold">Что хотите создать?</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {QUICK_START.map((q) => {
            const Icon = q.icon;
            return (
              <Link key={q.href} href={q.href} className="group">
                <Card className="h-full bg-slate-900 border-slate-800 transition hover:border-violet-500/50 hover:-translate-y-0.5 hover:shadow-[0_0_20px_-5px_rgba(139,92,246,0.4)]">
                  <CardContent className="p-5 flex h-full flex-col gap-3">
                    <span className="grid h-10 w-10 place-items-center rounded-md bg-violet-500/10 text-violet-300">
                      <Icon className="h-5 w-5" />
                    </span>
                    <div className="flex-1">
                      <h3 className="font-semibold">{q.title}</h3>
                      <p className="text-sm text-slate-400">{q.desc}</p>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-amber-400">{q.price}</span>
                      <ArrowRight className="h-4 w-4 text-violet-400 transition group-hover:translate-x-1" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <Card className="bg-slate-900 border-slate-800 lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-lg">Последние проекты</CardTitle>
            <Link href="/dashboard/projects" className="text-sm text-violet-400 hover:underline">
              Все проекты
            </Link>
          </CardHeader>
          <CardContent>
            {isProjectsLoading ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {Array.from({ length: 2 }).map((_, index) => (
                  <Skeleton key={index} className="h-64 rounded-lg" />
                ))}
              </div>
            ) : (projectsData?.total ?? 0) === 0 ? (
              <EmptyState
                icon={<ImageIcon className="h-full w-full" />}
                title="Готовы создать первое чудо?"
                description="Загрузите старое фото или попробуйте трендовый формат"
                actions={[{ label: 'Все услуги', href: '/services' }]}
              />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {recentProjects.map((p) => (
                  <ProjectCard key={p.id} project={p} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-lg">Последние операции</CardTitle>
            <Link href="/dashboard/billing" className="text-sm text-violet-400 hover:underline">
              Вся история
            </Link>
          </CardHeader>
          <CardContent>
            {recentTransactions.length === 0 ? (
              <EmptyState
                size="sm"
                icon={<Wallet className="h-full w-full" />}
                title="Операций пока нет"
              />
            ) : (
              <ul className="space-y-3">
                {recentTransactions.map((tx) => {
                  const isTopup = tx.amount > 0;
                  return (
                    <li
                      key={tx.id}
                      className="flex items-center justify-between gap-3 rounded-md bg-slate-800/40 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm">{transactionDescription(tx.reason)}</div>
                        <div className="text-xs text-slate-500">{formatDate(tx.createdAt)}</div>
                      </div>
                      <span
                        className={cn(
                          'shrink-0 text-sm font-semibold',
                          isTopup ? 'text-emerald-400' : 'text-red-400',
                        )}
                      >
                        {isTopup ? '+' : ''}
                        {tx.amount}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      <section>
        <h2 className="mb-4 text-xl font-semibold">Моя студия</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {studioMetrics.map((metric) => (
            <Link key={metric.kind} href={metric.href} className="group">
              <Card className="h-full border-slate-800 bg-slate-900 transition hover:border-violet-500/50 hover:-translate-y-0.5">
                <CardContent className="flex h-full flex-col gap-4 p-5">
                  <span className="grid h-11 w-11 place-items-center rounded-md bg-violet-500/10 text-violet-300">
                    <StudioMetricIcon kind={metric.kind} className="h-5 w-5" />
                  </span>
                  <div className="flex-1">
                    <div className="text-sm text-slate-400">{metric.label}</div>
                    <div className="mt-1 text-3xl font-bold text-white">{metric.value}</div>
                  </div>
                  <div className="text-sm text-violet-300 transition group-hover:text-violet-200">
                    {metric.value === 0 ? metric.cta : 'Открыть'}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      {activeOrders.length > 0 && (
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold">Активные заказы</h2>
            <Link href="/dashboard/orders" className="text-sm text-violet-400 hover:underline">
              Все заказы
            </Link>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {activeOrders.map((o) => (
              <OrderCard key={o.id} order={o} />
            ))}
          </div>
        </section>
      )}

      {!isProjectsLoading && (projectsData?.total ?? 0) === 0 && activeOrders.length === 0 && (
        <Card className="bg-gradient-to-br from-violet-600/10 to-fuchsia-600/10 border-violet-500/20">
          <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
            <Sparkles className="h-10 w-10 text-violet-400" />
            <div>
              <h3 className="text-lg font-semibold">Начните прямо сейчас</h3>
              <p className="mt-1 text-sm text-slate-300">
                У вас уже есть {user.tokenBalance} токенов — этого хватит на первый проект.
              </p>
            </div>
            <Button asChild>
              <Link href="/services">Перейти к услугам</Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
