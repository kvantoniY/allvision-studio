import type { Metadata } from 'next';
import { Sparkles, Target, UserRound } from 'lucide-react';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'О проекте',
  description: 'Allvision Studio — AI-фабрика цифровых подарков: миссия, подход и команда сервиса для создания персонального медиа из фото и идей.',
  path: '/about',
});

export default function AboutPage() {
  return (
    <section className="container py-14 md:py-20">
      <div className="max-w-3xl">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-indigo-500">О проекте</p>
        <h1 className="mt-3 text-4xl font-bold md:text-6xl">Allvision Studio делает AI-медиа понятным и личным</h1>
        <p className="mt-5 text-lg leading-8 text-muted-foreground">
          Мы строим сервис, где технологии помогают не просто генерировать картинки, а бережно работать с воспоминаниями, семейными историями и творческими идеями.
        </p>
      </div>

      <div className="mt-12 grid gap-6 lg:grid-cols-3">
        <div className="rounded-lg border bg-card p-6 dark:border-slate-800">
          <Sparkles className="h-7 w-7 text-amber-500" />
          <h2 className="mt-5 text-2xl font-semibold">История</h2>
          <div className="mt-4 space-y-4 leading-7 text-muted-foreground">
            <p>
              Allvision Studio создан в 2026 году как ответ на растущий спрос на персонализированный AI-контент. Людям нужны не только красивые картинки, но и понятный путь от идеи до результата: загрузить фото, выбрать формат, оплатить честную стоимость и получить готовый файл.
            </p>
            <p>
              На старте сервис фокусируется на шести направлениях: реставрация фото, оживление портретов, трендовые ролики, мультфильмы, реалистичные видео и персональные сказки для детей.
            </p>
            <p>
              Платёжная модель строится вокруг понятной цены до запуска обработки, защищённой оплаты и выдачи результата в личном кабинете.
            </p>
          </div>
        </div>

        <div className="rounded-lg border bg-card p-6 dark:border-slate-800">
          <Target className="h-7 w-7 text-indigo-500" />
          <h2 className="mt-5 text-2xl font-semibold">Миссия</h2>
          <p className="mt-4 leading-7 text-muted-foreground">
            Сделать AI-инструменты доступными каждому — без технических знаний, без дорогих подписок, без ограничений творчества. Allvision Studio должен быть сервисом, где можно быстро попробовать идею и при необходимости перейти к более внимательной ручной работе.
          </p>
        </div>

        <div className="rounded-lg border bg-card p-6 dark:border-slate-800">
          <UserRound className="h-7 w-7 text-emerald-500" />
          <h2 className="mt-5 text-2xl font-semibold">Команда</h2>
          <p className="mt-4 leading-7 text-muted-foreground">
            Основатель — команда Allvision. Разработчик, дизайнер и клиент-сервис в одном лице на старте. По мере роста проекта команда расширяется: отдельно появятся роли для производства видео, поддержки, контента и партнерств.
          </p>
        </div>
      </div>
    </section>
  );
}
