'use client';

import { useState } from 'react';
import { ChevronDown, Clock, Image as ImageIcon, User, Volume2 } from 'lucide-react';
import type { AcademySceneElement } from '@allvision/shared';
import { cn } from '@/lib/utils';

type ElType = AcademySceneElement['type'];

const CATEGORIES: { title: string; types: ElType[] }[] = [
  { title: 'Текст и кнопки', types: ['text', 'button', 'card', 'dialogue'] },
  { title: 'Ответы и ввод', types: ['input'] },
  { title: 'Картинки и фон', types: ['background', 'image', 'foreground', 'video', 'animated-background'] },
  { title: 'Персонажи и предметы', types: ['character', 'npc', 'prop'] },
  { title: 'Игровые', types: ['timer', 'progress', 'indicator', 'particles', 'hotspot', 'collision', 'platform'] },
  { title: 'Звук', types: ['audio'] },
];

const LABELS: Record<ElType, string> = {
  background: 'Фон', 'animated-background': 'Аним. фон', video: 'Видео', foreground: 'Передний план',
  image: 'Картинка', character: 'Персонаж', npc: 'NPC', prop: 'Предмет', text: 'Текст', dialogue: 'Диалог',
  button: 'Кнопка', card: 'Карточка', input: 'Поле ввода', indicator: 'Индикатор', timer: 'Таймер',
  progress: 'Прогресс', particles: 'Частицы', audio: 'Звук', hotspot: 'Зона', collision: 'Столкновение', platform: 'Платформа',
};

/** Иллюстративное мини-превью элемента — сразу видно, что добавляешь. */
function Preview({ type }: { type: ElType }) {
  const box = 'flex h-10 w-full items-center justify-center overflow-hidden rounded-md';
  switch (type) {
    case 'button':
      return <div className={cn(box, 'px-1')}><span className="rounded-md bg-[#f97316] px-2 py-1 text-[10px] font-semibold text-white">Кнопка</span></div>;
    case 'card':
      return <div className={cn(box, 'border border-slate-200 bg-white text-[10px] text-slate-500')}>Карточка</div>;
    case 'dialogue':
      return <div className={cn(box, 'rounded-xl border border-slate-200 bg-white text-[10px] text-slate-500')}>Реплика…</div>;
    case 'text':
      return <div className={cn(box, 'font-bold text-slate-700')}>Aa</div>;
    case 'input':
      return <div className={cn(box, 'px-1')}><span className="flex h-6 w-full items-center rounded border border-slate-300 bg-white px-1 text-[9px] text-slate-400">Ответ…</span></div>;
    case 'character':
      return <div className={cn(box, 'bg-primary/5')}><User className="h-6 w-6 text-primary/50" /></div>;
    case 'npc':
      return <div className={cn(box, 'bg-slate-400/10')}><User className="h-6 w-6 text-slate-500/60" /></div>;
    case 'prop':
      return <div className={cn(box, 'bg-muted')}><span className="h-5 w-5 rounded bg-amber-300/70" /></div>;
    case 'timer':
      return <div className={cn(box, 'gap-1 rounded-full bg-amber-50 text-amber-700')}><Clock className="h-4 w-4" /><span className="text-[10px] font-semibold">5s</span></div>;
    case 'progress':
    case 'indicator':
      return <div className={cn(box, 'px-1')}><span className="flex h-3 w-full items-center rounded-full bg-slate-200"><span className="h-full w-1/2 rounded-full bg-primary/70" /></span></div>;
    case 'particles':
      return <div className={cn(box, 'relative bg-fuchsia-50')}>{[[25, 40], [55, 25], [70, 55]].map(([l, t], i) => <span key={i} className="absolute h-1.5 w-1.5 rounded-full bg-fuchsia-400/70" style={{ left: `${l}%`, top: `${t}%` }} />)}</div>;
    case 'hotspot':
    case 'collision':
      return <div className={cn(box, 'border-2 border-dashed border-sky-400/70 bg-sky-400/10')} />;
    case 'platform':
      return <div className={cn(box, 'items-end')}><span className="h-3 w-full rounded-md border-b-4 border-emerald-700/60 bg-emerald-500/50" /></div>;
    case 'audio':
      return <div className={cn(box, 'bg-violet-50')}><Volume2 className="h-5 w-5 text-violet-500" /></div>;
    default: // картинки/фон/видео
      return <div className={cn(box, 'border-2 border-dashed border-primary/40 bg-primary/5')}><ImageIcon className="h-5 w-5 text-primary/60" /></div>;
  }
}

export function ElementPalette({ onAdd }: { onAdd: (type: ElType) => void }) {
  const [open, setOpen] = useState<string | null>(CATEGORIES[0].title);
  return (
    <div className="space-y-1.5">
      {CATEGORIES.map((cat) => {
        const isOpen = open === cat.title;
        return (
          <div key={cat.title} className="rounded-lg border border-border">
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : cat.title)}
              className="flex w-full items-center justify-between px-2.5 py-1.5 text-xs font-medium"
            >
              {cat.title}
              <ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground transition', isOpen && 'rotate-180')} />
            </button>
            {isOpen && (
              <div className="grid grid-cols-2 gap-1.5 border-t border-border p-1.5">
                {cat.types.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => onAdd(t)}
                    title={`Добавить: ${LABELS[t]}`}
                    className="flex flex-col items-center gap-1 rounded-lg border border-border p-1.5 transition hover:border-primary hover:bg-accent/40"
                  >
                    <Preview type={t} />
                    <span className="text-[10px] text-muted-foreground">{LABELS[t]}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
