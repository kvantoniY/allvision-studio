'use client';

import Link from 'next/link';
import {
  ArrowRight,
  Braces,
  GraduationCap,
  Languages,
  Sparkles,
  Users,
  Wand2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/hooks/use-auth';

type Direction = { icon: LucideIcon; title: string; desc: string };

const DIRECTIONS: Direction[] = [
  {
    icon: Languages,
    title: 'Английский язык',
    desc: 'Ребёнок учит язык внутри приключения, где он — главный герой.',
  },
  {
    icon: Wand2,
    title: 'Нейросети и AI-контент',
    desc: 'Создаёт свои изображения, кадры и мультфильмы, осваивая промпты.',
  },
  {
    icon: Braces,
    title: 'Программирование',
    desc: 'От блочного кода до реального — управляет героем через команды.',
  },
];

const STEPS = [
  { n: 1, title: 'Профиль ребёнка', desc: 'Добавьте ребёнка, подтвердите согласия и загрузите фото.' },
  { n: 2, title: 'AI-персонаж', desc: 'Создаём реалистичного персонажа с внешностью ребёнка.' },
  { n: 3, title: 'Урок-приключение', desc: 'Преподаватель ведёт занятие, ребёнок проходит интерактивные сцены.' },
];

function GuestLanding() {
  return (
    <div className="academy-theme min-h-screen bg-background text-foreground">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5">
        <span className="flex items-center gap-2 font-semibold">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Sparkles className="h-4 w-4" />
          </span>
          Allvision Academy
        </span>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost">
            <Link href="/login">Войти</Link>
          </Button>
          <Button asChild>
            <Link href="/register">Начать</Link>
          </Button>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 pb-16 pt-10 text-center sm:pt-16">
        <div className="mx-auto mb-5 inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">
          <GraduationCap className="h-3.5 w-3.5" /> Персональная онлайн-школа
        </div>
        <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">
          Ребёнок — главный герой собственного урока
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
          Живой преподаватель ведёт занятие по видеосвязи, нейросети создают персонажа с внешностью
          ребёнка и сюжетный мир, а браузерная игра превращает материал в интерактивное приключение.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button asChild size="lg">
            <Link href="/register">
              Создать профиль ребёнка <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/login">Войти</Link>
          </Button>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16">
        <div className="grid gap-4 sm:grid-cols-3">
          {DIRECTIONS.map((d) => (
            <Card key={d.title} className="border-border bg-card shadow-sm">
              <CardContent className="p-6">
                <span className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                  <d.icon className="h-5 w-5" />
                </span>
                <h3 className="font-semibold">{d.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{d.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-24">
        <h2 className="mb-6 text-center text-2xl font-bold tracking-tight">Как это работает</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.n} className="rounded-2xl border border-border bg-card p-6">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                {s.n}
              </span>
              <h3 className="mt-4 font-semibold">{s.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function AuthedHub({ name }: { name: string }) {
  const quickActions = [
    { href: '/family', icon: Users, title: 'Семья', desc: 'Профили детей, согласия, AI-персонаж' },
    { href: '/ai', icon: Sparkles, title: 'Нейролаборатория', desc: 'Генерация изображений и видео' },
  ];
  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <div className="mb-8">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">
          <GraduationCap className="h-3.5 w-3.5" /> Allvision Academy
        </div>
        <h1 className="text-3xl font-bold tracking-tight">Привет, {name}!</h1>
        <p className="mt-2 text-muted-foreground">
          Продолжайте настройку: добавьте ребёнка и создайте его AI-персонажа для будущих уроков.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {quickActions.map((a) => (
          <Link key={a.href} href={a.href}>
            <Card className="group h-full border-border bg-card shadow-sm transition hover:border-primary/50">
              <CardContent className="flex items-start gap-4 p-6">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                  <a.icon className="h-6 w-6" />
                </span>
                <div>
                  <h3 className="flex items-center gap-1.5 font-semibold">
                    {a.title}
                    <ArrowRight className="h-4 w-4 opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">{a.desc}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Card className="mt-4 border-dashed border-border bg-card">
        <CardContent className="flex flex-col items-center gap-2 px-6 py-10 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
            <GraduationCap className="h-6 w-6" />
          </span>
          <p className="font-semibold">Уроки и расписание — скоро</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Запись на занятия, календарь преподавателя и проведение уроков появятся на следующих этапах.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export function AcademyHome() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="academy-theme min-h-screen bg-background">
        <div className="mx-auto max-w-4xl px-4 py-10">
          <div className="h-40 animate-pulse rounded-2xl bg-muted" />
        </div>
      </div>
    );
  }

  if (!user) return <GuestLanding />;
  return <AuthedHub name={user.name?.split(' ')[0] ?? user.email.split('@')[0]} />;
}
