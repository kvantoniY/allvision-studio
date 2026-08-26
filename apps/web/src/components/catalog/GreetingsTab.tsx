'use client';

import Link from 'next/link';
import { Clapperboard, Music4, Scissors, Sparkles, Wand2 } from 'lucide-react';
import type { PublicService } from '@allvision/shared';
import { Badge } from '@/components/ui/badge';
import { VIDEO_EDITOR_ENABLED, VIDEO_EDITOR_PATH } from '@/lib/feature-flags';
import { cn } from '@/lib/utils';
import { ServiceTile } from './ServiceTile';

type GreetingsTabProps = {
  services: PublicService[];
};

const EDITOR_FEATURES = [
  { icon: Scissors, text: 'Свои фото и видео, обрезка сцен' },
  { icon: Wand2, text: 'AI-сцены прямо в ролике' },
  { icon: Music4, text: 'Музыка, титры и переходы' },
];

/**
 * Вкладка с двумя входами: готовый шаблон (купил — получил ролик) и редактор
 * для тех, кто хочет собрать сам. Кнопка редактора стоит выше шаблонов —
 * это главный переход вкладки.
 */
export function GreetingsTab({ services }: GreetingsTabProps) {
  return (
    <div className="space-y-10">
      <section
        className={cn(
          'relative overflow-hidden rounded-2xl border p-6 sm:p-8',
          VIDEO_EDITOR_ENABLED
            ? 'border-amber-400/40 bg-gradient-to-br from-amber-400/10 via-slate-900 to-slate-950'
            : 'border-slate-800 bg-slate-900/60',
        )}
      >
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2">
              <Clapperboard className="h-5 w-5 text-amber-400" />
              <h2 className="text-xl font-bold tracking-tight sm:text-2xl">Собрать ролик самому</h2>
              {!VIDEO_EDITOR_ENABLED && (
                <Badge variant="outline" className="border-slate-600 text-[11px] text-slate-400">
                  Скоро
                </Badge>
              )}
            </div>
            <p className="mt-3 leading-7 text-slate-400">
              Редактор со сценами: свои фото и видео, AI-генерации, музыка, титры и переходы.
              Экспорт целиком или каждая сцена по отдельности.
            </p>
            <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
              {EDITOR_FEATURES.map((feature) => (
                <li key={feature.text} className="flex items-center gap-2 text-sm text-slate-300">
                  <feature.icon className="h-4 w-4 shrink-0 text-amber-300/80" />
                  {feature.text}
                </li>
              ))}
            </ul>
          </div>
          <div className="shrink-0">
            {VIDEO_EDITOR_ENABLED ? (
              <Link
                href={VIDEO_EDITOR_PATH}
                className="inline-flex h-12 w-full items-center justify-center rounded-full bg-amber-400 px-7 text-sm font-semibold text-slate-950 transition hover:bg-amber-300 lg:w-auto"
              >
                Перейти к редактору
              </Link>
            ) : (
              <span
                aria-disabled
                title="Редактор в разработке"
                className="inline-flex h-12 w-full cursor-not-allowed items-center justify-center rounded-full border border-slate-700 px-7 text-sm font-semibold text-slate-500 lg:w-auto"
              >
                Редактор в разработке
              </span>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-2xl">
            <h2 className="text-lg font-bold tracking-tight sm:text-xl">Не подходит ни один шаблон?</h2>
            <p className="mt-2 leading-7 text-slate-400">
              Сделаем поздравление под вас: вы описываете задумку, мы уточняем детали, называем цену
              и собираем ролик вручную.
            </p>
          </div>
          <Link
            href="/orders"
            className="inline-flex h-11 shrink-0 items-center justify-center rounded-full border border-amber-400/60 px-6 text-sm font-semibold text-amber-200 transition hover:bg-amber-400/10"
          >
            Заказать под ключ
          </Link>
        </div>
      </section>

      <section>
        <div className="mb-5 flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-amber-400" />
          <h2 className="text-xl font-bold tracking-tight sm:text-2xl">Готовые шаблоны</h2>
        </div>
        {services.length > 0 ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {services.map((service) => (
              <ServiceTile key={service.id} service={service} showPrice />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-800 bg-slate-900/50 p-8 text-sm text-slate-400">
            Шаблоны видео-поздравлений готовятся к запуску. Загрузите фото — а сцены, музыку и титры
            соберём мы.
          </div>
        )}
      </section>
    </div>
  );
}
