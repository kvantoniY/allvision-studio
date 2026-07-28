'use client';

import Link from 'next/link';
import { ArrowRight, Camera, CalendarClock, Check, CreditCard, ShieldCheck, Sparkles, UserPlus, Wand2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ChildProfileDto } from '@allvision/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useListChildrenQuery } from '@/store/api/family-api';
import { useGetBalanceQuery, useGetLessonsQuery } from '@/store/api/academy-booking-api';

/**
 * Путь родителя к первому уроку. Раньше он был неявным: шесть шагов размазаны по двум
 * страницам, а внутри «Семьи» ещё и спрятаны в свёрнутой карточке ребёнка — родитель
 * после регистрации не понимал, что делать дальше. Чеклист показывает весь путь,
 * подсвечивает ровно один следующий шаг и ведёт к нему одной кнопкой.
 */

export type OnboardingStepId =
  | 'child'
  | 'consents'
  | 'photos'
  | 'character'
  | 'balance'
  | 'booking';

type Step = {
  id: OnboardingStepId;
  title: string;
  hint: string;
  icon: LucideIcon;
  done: boolean;
  /** Ребёнок, к которому относится шаг (для раскрытия нужной карточки). */
  childId?: string;
};

function buildSteps(children: ChildProfileDto[], lessonsPaid: number, lessonsBooked: number): Step[] {
  // Ведём родителя по первому неготовому ребёнку — иначе при двух детях подсказки путаются.
  const child = children.find((c) => !c.readyForLessons) ?? children[0];
  const status = child?.characterStatus ?? null;
  const characterHint = status === 'GENERATING'
    ? 'Персонаж генерируется — обычно несколько минут'
    : status === 'READY'
      ? 'Персонаж готов: осталось нажать «Утвердить»'
      : status === 'FAILED'
        ? 'Генерация не удалась — запустите ещё раз'
        : 'Из фотографий соберём набор: портрет, профиль, полный рост, эмоции';

  return [
    {
      id: 'child',
      title: 'Профиль ребёнка',
      hint: 'Имя, возраст и пожелания для преподавателя',
      icon: UserPlus,
      done: children.length > 0,
    },
    {
      id: 'consents',
      title: 'Согласия на обработку данных',
      hint: 'Нужны, чтобы загрузить фото и создать персонажа',
      icon: ShieldCheck,
      done: Boolean(child?.photoConsentsComplete),
      childId: child?.id,
    },
    {
      id: 'photos',
      title: 'Фотографии ребёнка',
      hint: 'Чёткое лицо, разные ракурсы — хранятся в закрытом хранилище',
      icon: Camera,
      done: (child?.photosCount ?? 0) > 0,
      childId: child?.id,
    },
    {
      id: 'character',
      title: 'AI-персонаж',
      hint: characterHint,
      icon: Wand2,
      done: status === 'APPROVED',
      childId: child?.id,
    },
    {
      id: 'balance',
      title: 'Оплаченное занятие',
      hint: 'Пробный урок — одно занятие без абонемента',
      icon: CreditCard,
      done: lessonsPaid > 0 || lessonsBooked > 0,
    },
    {
      id: 'booking',
      title: 'Запись к преподавателю',
      hint: 'Выберите преподавателя, курс и удобное время',
      icon: CalendarClock,
      done: lessonsBooked > 0,
    },
  ];
}

export function ParentOnboarding({
  onAddChild,
  onFocusChild,
  className,
}: {
  /** Есть на странице «Семья»: открывает форму добавления ребёнка. */
  onAddChild?: () => void;
  /** Есть на странице «Семья»: раскрывает карточку нужного ребёнка. */
  onFocusChild?: (childId: string) => void;
  className?: string;
}) {
  const childrenQuery = useListChildrenQuery();
  const balance = useGetBalanceQuery();
  const lessons = useGetLessonsQuery();

  const children = childrenQuery.data?.items ?? [];
  const paid = (balance.data?.balance ?? []).reduce((sum, item) => sum + item.available, 0);
  const booked = lessons.data?.lessons.length ?? 0;

  // Пока данные не пришли, не мигаем чеклистом «ничего не сделано».
  if (childrenQuery.isLoading || balance.isLoading || lessons.isLoading) return null;

  const steps = buildSteps(children, paid, booked);
  const doneCount = steps.filter((s) => s.done).length;
  if (doneCount === steps.length) return null;

  const current = steps.find((s) => !s.done)!;
  const percent = Math.round((doneCount / steps.length) * 100);

  const actionFor = (step: Step) => {
    switch (step.id) {
      case 'child':
        return onAddChild
          ? <Button size="sm" onClick={onAddChild}>Добавить ребёнка</Button>
          : <Button asChild size="sm"><Link href="/family">Добавить ребёнка</Link></Button>;
      case 'consents':
      case 'photos':
      case 'character':
        return onFocusChild && step.childId
          ? <Button size="sm" onClick={() => onFocusChild(step.childId!)}>Перейти к шагу</Button>
          : <Button asChild size="sm"><Link href="/family">Перейти к шагу</Link></Button>;
      case 'balance':
        return <Button asChild size="sm"><Link href="/lessons?buy=1">Оплатить занятие</Link></Button>;
      case 'booking':
        return <Button asChild size="sm"><Link href="/lessons?tab=book">Выбрать время</Link></Button>;
      default:
        return null;
    }
  };

  return (
    <Card className={cn('animate-academy-in border-primary/30 bg-accent/40 shadow-sm', className)}>
      <CardContent className="p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 font-semibold">
              <Sparkles className="h-4 w-4 text-primary" /> Путь к первому уроку
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Шаг {doneCount + 1} из {steps.length}: {current.title.toLowerCase()}
            </p>
          </div>
          <span className="text-sm font-semibold text-primary">{percent}%</span>
        </div>

        <div className="mb-4 h-2 overflow-hidden rounded-full bg-background">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${percent}%` }} />
        </div>

        <ol className="space-y-1.5">
          {steps.map((step) => {
            const isCurrent = step.id === current.id;
            return (
              <li
                key={step.id}
                className={cn(
                  'flex flex-wrap items-center gap-3 rounded-xl px-3 py-2.5 transition',
                  isCurrent ? 'bg-card shadow-sm' : 'opacity-70',
                )}
              >
                <span
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                    step.done ? 'bg-primary text-primary-foreground' : isCurrent ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground',
                  )}
                >
                  {step.done ? <Check className="h-4 w-4" /> : <step.icon className="h-4 w-4" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn('block text-sm font-medium', step.done && 'text-muted-foreground line-through')}>
                    {step.title}
                  </span>
                  {isCurrent && <span className="block text-xs text-muted-foreground">{step.hint}</span>}
                </span>
                {isCurrent && actionFor(step)}
              </li>
            );
          })}
        </ol>

        {current.id === 'balance' && (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
            <ArrowRight className="h-3.5 w-3.5" /> Пробный урок — 25 минут, без абонемента и подписки.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
