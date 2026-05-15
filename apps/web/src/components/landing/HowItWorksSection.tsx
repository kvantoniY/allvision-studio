'use client';

import { BadgeCheck, Download, Gift, ImageUp, WandSparkles } from 'lucide-react';
import { Reveal } from './Reveal';

const giftSteps = [
  { icon: Gift, title: 'Выберите повод и формат', text: 'Ностальгия, тренд, детский сюжет или открытка к важной дате — каталог сразу показывает подходящие подарки.' },
  { icon: ImageUp, title: 'Загрузите фото или впишите имя', text: 'Форма просит только то, что нужно для выбранного сценария: фото, имя, повод или один короткий выбор.' },
  { icon: Download, title: 'Получите подарок за 2–5 минут', text: 'Standard подходит для тёплого семейного результата, Pro добавляет максимальный wow-эффект.' },
];

function StepList() {
  return (
    <div className="grid gap-5 md:grid-cols-3">
      {giftSteps.map((step, index) => (
        <div key={step.title} className="rounded-lg border bg-card/80 p-5 dark:border-slate-800">
          <div className="flex h-11 w-11 items-center justify-center rounded-md bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-200">
            <step.icon className="h-5 w-5" />
          </div>
          <div className="mt-5 text-sm font-semibold text-amber-500">Шаг {index + 1}</div>
          <h3 className="mt-2 text-lg font-semibold">{step.title}</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{step.text}</p>
        </div>
      ))}
      <div className="rounded-lg border border-amber-300/40 bg-amber-500/10 p-5 md:col-span-3">
        <div className="flex items-start gap-3">
          <BadgeCheck className="mt-0.5 h-5 w-5 text-amber-500" />
          <p className="text-sm leading-6 text-muted-foreground">
            Цена в токенах видна до запуска. Если готовый pipeline падает с технической ошибкой, токены возвращаются на баланс.
          </p>
        </div>
      </div>
    </div>
  );
}

export function HowItWorksSection() {
  return (
    <section className="border-y bg-slate-50 py-20 dark:border-slate-800 dark:bg-slate-950/60">
      <div className="container">
        <Reveal className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 text-sm font-medium uppercase tracking-[0.18em] text-indigo-500">
            <WandSparkles className="h-4 w-4" />
            Процесс
          </div>
          <h2 className="mt-3 text-3xl font-bold md:text-5xl">Как это работает</h2>
          <p className="mt-4 text-lg leading-8 text-muted-foreground">
            Мы убрали сложный слой генерации из интерфейса: вы выбираете подарок, а подготовленный сценарий делает остальное.
          </p>
        </Reveal>

        <Reveal className="mt-10">
          <StepList />
        </Reveal>
      </div>
    </section>
  );
}
