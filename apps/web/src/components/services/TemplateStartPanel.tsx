'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Loader2, Sparkles } from 'lucide-react';
import { TEMPLATE_FRAME_LIMITS, TIMELINE_ASPECTS, type TimelineAspect } from '@allvision/shared';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { useCreateFromTemplateMutation } from '@/store/api/video-projects-api';
import { cn } from '@/lib/utils';

const ASPECT_TITLES: Record<TimelineAspect, string> = {
  '9:16': 'Вертикаль',
  '16:9': 'Горизонт',
  '1:1': 'Квадрат',
  '4:5': 'Лента',
};

/**
 * Запуск шаблона поздравления.
 *
 * Шаблон больше не собирает ролик по загруженной пачке фотографий: он открывает редактор с
 * пустыми кадрами, а человек ставит в них фото и оживляет — по кадру или все разом. Поэтому
 * здесь спрашивается только то, что нельзя решить потом: сколько кадров и какой формат.
 * Всё остальное правится в редакторе, включая число кадров — лишние можно удалить.
 */
export function TemplateStartPanel({
  slug,
  authorized,
  onRequireAuth,
}: {
  slug: string;
  authorized: boolean;
  onRequireAuth: () => void;
}) {
  const router = useRouter();
  const [frames, setFrames] = useState<number>(TEMPLATE_FRAME_LIMITS.default);
  const [aspect, setAspect] = useState<TimelineAspect>('9:16');
  const [createFromTemplate, { isLoading }] = useCreateFromTemplateMutation();

  const start = async () => {
    if (!authorized) {
      onRequireAuth();
      return;
    }
    try {
      const result = await createFromTemplate({ slug, frames, aspect }).unwrap();
      router.push(`/editor/${result.project.id}`);
    } catch (err) {
      const message = (err as { data?: { error?: { message?: string } } })?.data?.error?.message;
      toast({ title: 'Не удалось открыть шаблон', description: message, variant: 'destructive' });
    }
  };

  return (
    <>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 pb-5 lg:pr-5">
        <div className="rounded-lg border border-violet-400/40 bg-violet-500/10 p-4">
          <div className="flex items-start gap-2 text-sm text-slate-200">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-violet-300" />
            <span>
              Откроем редактор с пустыми кадрами этого шаблона. Вы вставите свои фотографии и
              нажмёте «сгенерировать» — по кадру или все сразу. Платится каждый оживлённый
              кадр, а не ролик целиком.
            </span>
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-sm">Сколько кадров</Label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={TEMPLATE_FRAME_LIMITS.min}
              max={TEMPLATE_FRAME_LIMITS.max}
              step={1}
              value={frames}
              onChange={(event) => setFrames(Number(event.target.value))}
              className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-slate-700 accent-amber-400"
              aria-label="Количество кадров"
            />
            <span className="w-8 shrink-0 text-right font-mono text-lg font-bold text-amber-200">{frames}</span>
          </div>
          <p className="text-xs text-slate-500">
            От {TEMPLATE_FRAME_LIMITS.min} до {TEMPLATE_FRAME_LIMITS.max}. Лишние кадры можно
            удалить прямо в редакторе, а недостающие — добавить.
          </p>
        </div>

        <div className="space-y-2">
          <Label className="text-sm">Формат кадра</Label>
          <div className="grid grid-cols-2 gap-2">
            {TIMELINE_ASPECTS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setAspect(option)}
                className={cn(
                  'rounded-lg border px-3 py-2 text-sm transition',
                  aspect === option
                    ? 'border-amber-400 bg-amber-400/10 text-amber-200'
                    : 'border-slate-700 text-slate-300 hover:border-slate-500',
                )}
              >
                {ASPECT_TITLES[option]}
                <span className="ml-1 font-mono text-xs text-slate-500">{option}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="shrink-0 space-y-3 border-t border-slate-800 bg-slate-900 px-6 py-5 shadow-[0_-16px_32px_rgba(2,6,23,0.45)]">
        <Button
          type="button"
          size="lg"
          className="w-full bg-amber-500 text-slate-950 hover:bg-amber-400"
          disabled={isLoading}
          onClick={() => void start()}
        >
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
          Открыть в редакторе
        </Button>
        <p className="text-center text-xs text-slate-500">Открытие бесплатно — платятся только генерации кадров.</p>
      </div>
    </>
  );
}
