'use client';

import { BadgeCheck, CreditCard, Download, FileText, Handshake, ImageUp, MessageCircle, WandSparkles } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Reveal } from './Reveal';

const autoSteps = [
  { icon: ImageUp, title: 'Загрузи фото', text: 'Выберите файл с телефона или компьютера. Чем лучше исходник, тем аккуратнее результат.' },
  { icon: CreditCard, title: 'Оплати токенами', text: 'Стоимость фиксирована и видна заранее: без подписок, скрытых списаний и сложных тарифов.' },
  { icon: Download, title: 'Скачай результат', text: 'После обработки файл появляется в кабинете и готов для отправки родным или публикации.' },
];

const manualSteps = [
  { icon: FileText, title: 'Опиши идею', text: 'Расскажите, что хотите получить: сюжет, длительность, героев, стиль и повод.' },
  { icon: MessageCircle, title: 'Админ связывается', text: 'Мы уточняем детали, предлагаем формат и честно говорим, что можно сделать в рамках бюджета.' },
  { icon: Handshake, title: 'Согласуете и оплачиваете', text: 'После согласования цены, сроков и объема правок заказ переходит в производство.' },
  { icon: BadgeCheck, title: 'Получаете видео', text: 'Финальный файл передается в удобном формате, а небольшие согласованные правки закрываются до сдачи.' },
];

function StepList({ steps }: { steps: typeof autoSteps }) {
  return (
    <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
      {steps.map((step, index) => (
        <div key={step.title} className="rounded-lg border bg-card/80 p-5 dark:border-slate-800">
          <div className="flex h-11 w-11 items-center justify-center rounded-md bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-200">
            <step.icon className="h-5 w-5" />
          </div>
          <div className="mt-5 text-sm font-semibold text-amber-500">Шаг {index + 1}</div>
          <h3 className="mt-2 text-lg font-semibold">{step.title}</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{step.text}</p>
        </div>
      ))}
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
            Автоматические услуги запускаются сразу, а заказные ролики проходят через короткое согласование.
          </p>
        </Reveal>

        <Reveal className="mt-10">
          <Tabs defaultValue="auto" className="w-full">
            <div className="flex justify-center">
              <TabsList>
                <TabsTrigger value="auto">Автогенерация</TabsTrigger>
                <TabsTrigger value="manual">На заказ</TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="auto" className="mt-8">
              <StepList steps={autoSteps} />
            </TabsContent>
            <TabsContent value="manual" className="mt-8">
              <StepList steps={manualSteps} />
            </TabsContent>
          </Tabs>
        </Reveal>
      </div>
    </section>
  );
}
