'use client';

import Link from 'next/link';
import {
  ArrowRight,
  BookOpenCheck,
  Braces,
  CalendarClock,
  Check,
  ChevronRight,
  CirclePlay,
  Gamepad2,
  GraduationCap,
  Languages,
  Library,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Users,
  Wand2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { buildLessonPackages } from '@allvision/shared';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/hooks/use-auth';
import { ParentOnboarding } from '@/components/academy/ParentOnboarding';
import { ACADEMY_FAQS } from '@/lib/academy-landing-content';

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
  { n: 3, title: 'Подготовка учителя', desc: 'Учитель выбирает тему и заранее проверяет персональные материалы.' },
  { n: 4, title: 'Урок-приключение', desc: 'Ребёнок вместе с учителем проходит интерактивные сцены и получает награды.' },
];

const PACKAGES = buildLessonPackages();
// После регистрации ведём в «Семью»: там чеклист «Путь к первому уроку» ведёт родителя
// по шагам до пробного занятия. Параметра intent больше нет — его никто не обрабатывал.
const TRIAL_HREF = '/register?redirect=/family';

function GuestLanding() {
  return (
    <div className="academy-theme min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Sparkles className="h-4 w-4" />
            </span>
            Allvision Academy
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            <a href="#directions" className="transition hover:text-foreground">Направления</a>
            <a href="#lesson" className="transition hover:text-foreground">Как проходит урок</a>
            <a href="#prices" className="transition hover:text-foreground">Цены</a>
            <a href="#faq" className="transition hover:text-foreground">Вопросы</a>
          </nav>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost">
              <Link href="/login">Войти</Link>
            </Button>
            <Button asChild className="hidden sm:inline-flex">
              <Link href={TRIAL_HREF}>Пробный урок</Link>
            </Button>
          </div>
        </div>
      </header>

      <main>
      <section className="relative overflow-hidden">
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(circle_at_50%_10%,hsl(24_94%_50%/0.14),transparent_38%)]" />
        <div className="relative mx-auto max-w-6xl px-4 pb-20 pt-14 text-center sm:pb-24 sm:pt-20">
        <div className="mx-auto mb-5 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">
          <GraduationCap className="h-3.5 w-3.5" /> Персональная онлайн-школа для детей
        </div>
        <h1 className="mx-auto max-w-4xl text-4xl font-extrabold tracking-tight sm:text-6xl">
          Ребёнок — главный герой собственного урока
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
          Живой преподаватель ведёт занятие по видеосвязи, нейросети создают персонажа с внешностью
          ребёнка и сюжетный мир, а браузерная игра превращает материал в интерактивное приключение.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button asChild size="lg">
            <Link href={TRIAL_HREF}>Записаться на пробный <ArrowRight className="ml-2 h-4 w-4" /></Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <a href="#lesson"><CirclePlay className="mr-2 h-4 w-4" /> Как проходит урок</a>
          </Button>
        </div>
        <div className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
          {['Живой преподаватель', 'Персональный сюжет', 'Закрытые детские материалы'].map((item) => (
            <span key={item} className="inline-flex items-center gap-1.5"><Check className="h-4 w-4 text-primary" />{item}</span>
          ))}
        </div>
        </div>
      </section>

      <section id="directions" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16">
        <div className="mb-8 max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">Направления</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Учимся через действие и историю</h2>
          <p className="mt-3 text-muted-foreground">Программа даёт понятный учебный результат, а персональный мир удерживает внимание ребёнка.</p>
        </div>
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

      <section id="lesson" className="scroll-mt-20 bg-secondary/55 py-16">
        <div className="mx-auto max-w-6xl px-4">
        <div className="mx-auto mb-8 max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">Один понятный путь</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Как проходит обучение</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {[
            { icon: GraduationCap, title: 'Учитель ведёт', desc: 'Объясняет, задаёт темп и помогает, если что-то не получается.' },
            { icon: Gamepad2, title: 'Ребёнок действует', desc: 'Отвечает, двигает героя, решает задачи и видит результат своих решений.' },
            { icon: BookOpenCheck, title: 'Родитель видит результат', desc: 'Получает отчёт, рекомендации и материалы после занятия.' },
          ].map((item) => (
            <div key={item.title} className="flex gap-3 rounded-2xl bg-background p-5 shadow-sm">
              <item.icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div><h3 className="font-semibold">{item.title}</h3><p className="mt-1 text-sm text-muted-foreground">{item.desc}</p></div>
            </div>
          ))}
        </div>
        </div>
      </section>

      <section id="prices" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16">
        <div className="mx-auto mb-9 max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">Цены</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Начните с одного урока</h2>
          <p className="mt-3 text-muted-foreground">Без подписки. Абонемент пополняет баланс занятий выбранной длительности.</p>
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
          {[25, 45].map((duration) => {
            const options = PACKAGES.filter((item) => item.durationMin === duration);
            return (
              <Card key={duration} className="overflow-hidden border-border shadow-sm">
                <CardContent className="p-0">
                  <div className="border-b border-border bg-accent/50 p-6">
                    <div className="text-sm font-medium text-accent-foreground">Занятие {duration} минут</div>
                    <div className="mt-1 text-3xl font-bold">от {options[options.length - 1].pricePerLessonRub.toLocaleString('ru-RU')} ₽</div>
                    <div className="mt-1 text-sm text-muted-foreground">за урок в пакете из 16 занятий</div>
                  </div>
                  <div className="divide-y divide-border px-6">
                    {options.map((option) => (
                      <div key={option.count} className="flex items-center justify-between gap-4 py-4 text-sm">
                        <div><span className="font-semibold">{option.count === 1 ? 'Пробный урок' : `${option.count} ${option.count === 4 ? 'занятия' : 'занятий'}`}</span>{option.discountPct ? <span className="ml-2 text-primary">−{option.discountPct}%</span> : null}</div>
                        <div className="text-right"><div className="font-semibold">{option.priceRub.toLocaleString('ru-RU')} ₽</div><div className="text-xs text-muted-foreground">{option.pricePerLessonRub.toLocaleString('ru-RU')} ₽ / урок</div></div>
                      </div>
                    ))}
                  </div>
                  <div className="p-6 pt-4"><Button asChild className="w-full"><Link href={TRIAL_HREF}>Выбрать {duration} минут</Link></Button></div>
                </CardContent>
              </Card>
            );
          })}
        </div>
        <p className="mt-4 text-center text-xs text-muted-foreground">Свободное время и преподаватель выбираются после создания профиля ребёнка.</p>
      </section>

      <section id="faq" className="scroll-mt-20 bg-secondary/55 py-16">
        <div className="mx-auto max-w-3xl px-4">
          <p className="text-center text-sm font-semibold uppercase tracking-[0.16em] text-primary">FAQ</p>
          <h2 className="mt-2 text-center text-3xl font-bold tracking-tight sm:text-4xl">Частые вопросы</h2>
          <Accordion type="single" collapsible className="mt-8 rounded-2xl border border-border bg-background px-5">
            {ACADEMY_FAQS.map((faq, index) => (
              <AccordionItem key={faq.question} value={`faq-${index}`}>
                <AccordionTrigger className="text-left">{faq.question}</AccordionTrigger>
                <AccordionContent className="leading-6 text-muted-foreground">{faq.answer}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
        <div className="overflow-hidden rounded-3xl bg-foreground px-6 py-12 text-center text-background sm:px-12">
          <ShieldCheck className="mx-auto h-8 w-8 text-primary" />
          <h2 className="mt-4 text-3xl font-bold">Познакомьте ребёнка с уроком, где он главный герой</h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-background/70 sm:text-base">Создайте родительский аккаунт, добавьте профиль ребёнка и выберите одно пробное занятие без абонемента.</p>
          <Button asChild size="lg" className="mt-7"><Link href={TRIAL_HREF}>Записаться на пробный <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
        </div>
      </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <div><div className="font-semibold text-foreground">Allvision Academy</div><div className="mt-1">Персональная онлайн-школа для детей</div></div>
          <nav className="flex flex-wrap gap-x-5 gap-y-2">
            <Link href="/about" className="hover:text-foreground">О школе</Link>
            <Link href="/contacts" className="hover:text-foreground">Контакты</Link>
            <Link href="/offer" className="hover:text-foreground">Оферта</Link>
            <Link href="/privacy" className="hover:text-foreground">Конфиденциальность</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

type UserRole = 'USER' | 'PARENT' | 'TEACHER' | 'METHODIST' | 'ADMIN' | 'READONLY_ADMIN';

const ROLE_ACTIONS: Record<UserRole, Array<{ href: string; icon: LucideIcon; title: string; desc: string }>> = {
  USER: [
    { href: '/family', icon: Users, title: 'Семья', desc: 'Профили детей, согласия и AI-персонаж' },
    { href: '/lessons', icon: CalendarClock, title: 'Занятия', desc: 'Баланс, расписание и запись к преподавателю' },
    { href: '/messages', icon: MessageCircle, title: 'Сообщения', desc: 'Диалоги с преподавателями' },
    { href: '/ai', icon: Sparkles, title: 'Нейролаборатория', desc: 'Учебные эксперименты с изображениями и видео' },
  ],
  PARENT: [],
  TEACHER: [
    { href: '/teacher', icon: GraduationCap, title: 'Кабинет преподавателя', desc: 'Календарь, ученики, подготовка и доход' },
    { href: '/teacher/library', icon: Library, title: 'Материалы', desc: 'Личная и общая учебная библиотека' },
    { href: '/messages', icon: MessageCircle, title: 'Сообщения', desc: 'Диалоги с родителями учеников' },
    { href: '/teacher/scene-player', icon: Gamepad2, title: 'Плеер сцен', desc: 'Проверка интерактивных уроков' },
  ],
  METHODIST: [
    { href: '/admin/curriculum', icon: BookOpenCheck, title: 'Учебная программа', desc: 'Курсы, модули, темы и навыки' },
    { href: '/constructor', icon: Wand2, title: 'Конструктор уроков', desc: 'Шаблоны и интерактивные сцены' },
    { href: '/teacher/library', icon: Library, title: 'Библиотека', desc: 'Общие материалы Академии' },
    { href: '/admin/scene-player', icon: Gamepad2, title: 'Плеер сцен', desc: 'Проверка опубликованных шаблонов' },
  ],
  ADMIN: [
    { href: '/admin', icon: ShieldCheck, title: 'Администрирование', desc: 'Операционный контур и модерация' },
    { href: '/admin/curriculum', icon: BookOpenCheck, title: 'Учебная программа', desc: 'Курсы, модули, темы и навыки' },
    { href: '/admin/library', icon: Library, title: 'Материалы', desc: 'Общая библиотека Академии' },
    { href: '/admin/payouts', icon: CalendarClock, title: 'Выплаты', desc: 'Периоды и выплаты преподавателям' },
  ],
  READONLY_ADMIN: [
    { href: '/profile', icon: Users, title: 'Профиль', desc: 'Настройки аккаунта' },
  ],
};
ROLE_ACTIONS.PARENT = ROLE_ACTIONS.USER;

function AuthedHub({ name, role }: { name: string; role: UserRole }) {
  const quickActions = ROLE_ACTIONS[role] ?? ROLE_ACTIONS.USER;
  const isParent = role === 'PARENT' || role === 'USER';
  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <div className="mb-8">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">
          <GraduationCap className="h-3.5 w-3.5" /> Allvision Academy
        </div>
        <h1 className="text-3xl font-bold tracking-tight">Привет, {name}!</h1>
        <p className="mt-2 text-muted-foreground">
          {isParent
            ? 'Здесь виден весь путь: профиль ребёнка, оплата и запись на занятия.'
            : 'Все разделы Allvision Academy собраны в вашем ролевом кабинете.'}
        </p>
      </div>

      {isParent && <ParentOnboarding className="mb-6" />}

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

      <Link href={role === 'TEACHER' ? '/teacher' : role === 'METHODIST' ? '/constructor' : role === 'ADMIN' ? '/admin' : '/lessons'} className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
        Перейти к основной работе <ChevronRight className="h-4 w-4" />
      </Link>
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
  return <AuthedHub name={user.name?.split(' ')[0] ?? user.email.split('@')[0]} role={user.role as UserRole} />;
}
