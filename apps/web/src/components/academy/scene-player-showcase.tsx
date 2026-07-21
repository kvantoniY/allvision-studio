'use client';

import { useRef, useState } from 'react';
import {
  Bug,
  CheckCircle2,
  GraduationCap,
  Lightbulb,
  Play,
  RotateCcw,
  ScrollText,
  Sparkles,
  UserRound,
} from 'lucide-react';
import type {
  AcademyScenePlayerRole,
  AcademySceneRuntimeEffect,
  AcademySceneRuntimeState,
} from '@allvision/shared';
import { AcademyScenePlayer, type AcademyScenePlayerHandle } from './scene-player';
import { NUMBER_CASTLE_DEMO_SCENE } from '@/lib/scene-engine/number-castle-demo';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

const EFFECT_LABELS: Record<AcademySceneRuntimeEffect['type'], string> = {
  'play-sound': 'Запрошено воспроизведение звука',
  'show-hint': 'Показана подсказка',
  'play-animation': 'Запущена анимация',
  navigate: 'Разрешён переход к следующей сцене',
  'emit-event': 'Отправлено внешнее событие',
};

export function ScenePlayerShowcase() {
  const playerRef = useRef<AcademyScenePlayerHandle>(null);
  const { toast } = useToast();
  const [role, setRole] = useState<AcademyScenePlayerRole>('student');
  const [debugBoundaries, setDebugBoundaries] = useState(false);
  const [runtime, setRuntime] = useState<AcademySceneRuntimeState | null>(null);
  const [effects, setEffects] = useState<string[]>([]);

  const handleEffect = (effect: AcademySceneRuntimeEffect) => {
    const detail = effect.type === 'show-hint'
      ? effect.text
      : effect.type === 'navigate'
        ? effect.sceneId ?? 'финал урока'
        : effect.type === 'emit-event'
          ? effect.name
          : 'elementId' in effect
            ? effect.elementId
            : '';
    setEffects((current) => [`${EFFECT_LABELS[effect.type]}${detail ? ` · ${detail}` : ''}`, ...current].slice(0, 6));
    if (effect.type === 'show-hint') toast({ title: 'Подсказка', description: effect.text });
    if (effect.type === 'navigate') {
      toast({ title: 'Сцена завершена', description: `Следующая сцена: ${effect.sceneId ?? 'финал урока'}` });
    }
  };

  return (
    <div className="academy-theme min-h-full rounded-2xl bg-background p-1 text-foreground sm:p-3">
      <div className="mx-auto max-w-[1500px] space-y-5 rounded-2xl bg-background p-3 sm:p-5">
        <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Play className="h-5 w-5" />
            </span>
            <div>
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight">Тест-плеер сцен</h1>
                <span className="rounded-full bg-orange-100 px-2.5 py-1 text-xs font-semibold text-orange-800">A6.1 · PixiJS</span>
              </div>
              <p className="max-w-3xl text-sm text-muted-foreground">
                Витрина runtime-ядра на мини-сцене «Замок чисел». Нажмите на свиток, выберите цифру и откройте переход.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <div className="flex rounded-xl border border-border bg-card p-1">
              <button
                type="button"
                onClick={() => setRole('student')}
                className={cn(
                  'inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  role === 'student' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <UserRound className="h-4 w-4" /> Ученик
              </button>
              <button
                type="button"
                onClick={() => setRole('teacher')}
                className={cn(
                  'inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  role === 'teacher' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <GraduationCap className="h-4 w-4" /> Преподаватель
              </button>
            </div>
            <Button
              type="button"
              variant={debugBoundaries ? 'default' : 'outline'}
              onClick={() => setDebugBoundaries((value) => !value)}
            >
              <Bug className="mr-2 h-4 w-4" /> Технические зоны
            </Button>
            <Button type="button" variant="outline" onClick={() => { playerRef.current?.reset(); setEffects([]); }}>
              <RotateCcw className="mr-2 h-4 w-4" /> Сначала
            </Button>
          </div>
        </header>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_330px]">
          <div className="space-y-3">
            <AcademyScenePlayer
              key={debugBoundaries ? 'debug' : 'normal'}
              ref={playerRef}
              scene={NUMBER_CASTLE_DEMO_SCENE}
              role={role}
              debugBoundaries={debugBoundaries}
              onStateChange={setRuntime}
              onEffect={handleEffect}
              className="w-full"
            />
            <div className="grid gap-3 sm:grid-cols-3">
              <StatusCard label="Состояние" value={runtime?.activeStateId ?? 'загрузка'} />
              <StatusCard label="Очки" value={String(runtime?.score ?? 0)} />
              <StatusCard label="Переход" value={runtime?.transitionAllowed ? 'разрешён' : 'закрыт'} positive={runtime?.transitionAllowed} />
            </div>
          </div>

          <aside className="space-y-4">
            <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <ScrollText className="h-4 w-4 text-primary" />
                <h2 className="font-semibold">Что проверяет витрина</h2>
              </div>
              <ol className="space-y-3 text-sm text-muted-foreground">
                <ShowcaseStep done={(runtime?.revision ?? 0) > 1}>Pointer-событие открывает свиток</ShowcaseStep>
                <ShowcaseStep done={runtime?.activeStateId === 'solved'}>Условия проверяют правильный ответ</ShowcaseStep>
                <ShowcaseStep done={(runtime?.score ?? 0) >= 10}>Действия меняют state, видимость и очки</ShowcaseStep>
                <ShowcaseStep done={runtime?.transitionAllowed}>Переход разблокируется только правилом</ShowcaseStep>
              </ol>
            </section>

            <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              <div className="mb-2 flex items-center gap-2">
                <GraduationCap className="h-4 w-4 text-primary" />
                <h2 className="font-semibold">Панель преподавателя</h2>
              </div>
              <p className="mb-3 text-xs text-muted-foreground">
                Переключитесь в роль преподавателя: условие role-is не пропустит команду ученика.
              </p>
              <Button
                type="button"
                className="w-full"
                disabled={role !== 'teacher'}
                onClick={() => playerRef.current?.send({ type: 'teacher-action', customName: 'show-number-hint' })}
              >
                <Lightbulb className="mr-2 h-4 w-4" /> Показать подсказку
              </Button>
            </section>

            <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <h2 className="font-semibold">Эффекты runtime</h2>
              </div>
              {effects.length > 0 ? (
                <ul className="space-y-2 text-xs text-muted-foreground">
                  {effects.map((effect, index) => (
                    <li key={`${effect}-${index}`} className="rounded-lg bg-muted/60 px-3 py-2">{effect}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">Здесь появятся подсказки, звук, анимации и навигация.</p>
              )}
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}

function StatusCard({ label, value, positive = false }: { label: string; value: string; positive?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn('mt-1 font-semibold', positive && 'text-emerald-700')}>{value}</div>
    </div>
  );
}

function ShowcaseStep({ done, children }: { done?: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <CheckCircle2 className={cn('mt-0.5 h-4 w-4 shrink-0', done ? 'text-emerald-600' : 'text-muted-foreground/40')} />
      <span className={done ? 'text-foreground' : undefined}>{children}</span>
    </li>
  );
}
