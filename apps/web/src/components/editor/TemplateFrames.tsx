'use client';

import { HelpCircle, Loader2, Sparkles, X } from 'lucide-react';
import { formatTokens, type TimelineTemplate } from '@allvision/shared';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Панель шаблона над рабочей областью.
 *
 * Шаблон больше не собирает ролик сам: он раскладывает пустые кадры, а человек ставит в них
 * фотографии и запускает генерацию. Значит, ему нужно видеть две вещи — сколько кадров уже
 * готово к запуску и одну кнопку, чтобы не жать «сгенерировать» два десятка раз.
 */
export function TemplateBar({
  template,
  total,
  withPhoto,
  generated,
  running,
  pricePerFrame,
  onGenerateAll,
  onShowHint,
}: {
  template: TimelineTemplate;
  /** Всего кадров в ролике. */
  total: number;
  /** Кадров с фотографией, которые ещё не оживлены. */
  withPhoto: number;
  /** Уже оживлённых кадров. */
  generated: number;
  running: boolean;
  pricePerFrame: number;
  onGenerateAll: () => void;
  onShowHint: () => void;
}) {
  return (
    /*
     * Тоже строго одна строка: `flex-wrap` уводил кнопку запуска на вторую полосу и
     * вместе с шапкой отнимал у кадра половину экрана. Счётчик сжат до «6 · 0» с
     * расшифровкой в подсказке — на телефоне слова «кадров» и «оживлено» стоили строки.
     */
    <div className="flex items-center gap-2 border-b border-slate-800 bg-violet-500/5 px-2 py-1.5 lg:px-4 lg:py-2">
      <Sparkles className="h-4 w-4 shrink-0 text-violet-300" />
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-100">{template.title}</span>
      <span
        className="shrink-0 text-xs tabular-nums text-slate-400"
        title={`Кадров ${total}, оживлено ${generated}`}
      >
        <span className="lg:hidden">{generated}/{total}</span>
        <span className="hidden lg:inline">кадров {total} · оживлено {generated}</span>
      </span>

      <button
        type="button"
        onClick={onShowHint}
        title="Как работать с шаблоном"
        aria-label="Как работать с шаблоном"
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-slate-700 text-slate-400 transition hover:border-violet-400 hover:text-white"
      >
        <HelpCircle className="h-3.5 w-3.5" />
      </button>

      <Button
        type="button"
        size="sm"
        disabled={running || withPhoto === 0}
        onClick={onGenerateAll}
        aria-label="Сгенерировать все кадры"
        className="h-8 w-8 shrink-0 p-0 lg:w-auto lg:px-3"
        title={
          withPhoto === 0
            ? 'Сначала вставьте фотографии в кадры — оживлять пока нечего'
            : `Оживит все кадры с фотографиями подряд: ${withPhoto} шт. по ${pricePerFrame} токенов`
        }
      >
        {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        <span className="hidden lg:inline">
          {running ? 'Запускаем…' : (
            <>
              Сгенерировать всё
              {withPhoto > 0 && (
                <span className="ml-1 text-slate-900/70">
                  · {withPhoto} × {formatTokens(pricePerFrame)}
                </span>
              )}
            </>
          )}
        </span>
      </Button>
    </div>
  );
}

/**
 * Подсказка при первом входе.
 *
 * Пустые кадры на дорожке сами по себе ничего не объясняют: человек пришёл из каталога, где
 * шаблон выглядел готовым роликом. Показываем один раз на ролик — дальше подсказка живёт
 * под знаком вопроса в панели шаблона.
 */
export function TemplateHint({ template, onClose }: { template: TimelineTemplate; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[150] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md space-y-4 rounded-t-2xl border border-slate-800 bg-slate-950 p-5 shadow-2xl sm:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-violet-300" />
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-white">{template.title}</h2>
            <p className="mt-1 text-xs text-slate-400">Осталось два шага — и поздравление готово.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-slate-500 transition hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <ol className="space-y-3">
          {[
            {
              title: 'Вставьте фотографии в кадры',
              text: 'На дорожке внизу стоят пустые кадры. Нажмите на кадр и выберите фото — по одному на кадр.',
            },
            {
              title: 'Нажмите «Сгенерировать»',
              text: 'На кадре — чтобы оживить его одного, или «Сгенерировать всё» сверху, чтобы запустить подряд все кадры с фотографиями. Результат встанет на место кадра сам.',
            },
          ].map((step, index) => (
            <li key={step.title} className="flex gap-3">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-violet-500/20 text-xs font-semibold text-violet-200">
                {index + 1}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-slate-100">{step.title}</span>
                <span className="block text-xs leading-5 text-slate-400">{step.text}</span>
              </span>
            </li>
          ))}
        </ol>

        <p className="text-[11px] leading-4 text-slate-500">
          Лишние кадры можно удалить, а любой кадр — переснять заново: платится каждая
          генерация отдельно, а не весь ролик разом.
        </p>

        <Button type="button" className={cn('w-full')} onClick={onClose}>
          Понятно, начнём
        </Button>
      </div>
    </div>
  );
}
