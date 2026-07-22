'use client';

import { useState } from 'react';
import { AlertTriangle, CheckCircle2, ImageOff, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  useGetInstanceGenerationsQuery,
  useRegenerateSceneMutation,
  type SceneGenerationItem,
} from '@/store/api/academy-lesson-instances-api';

function apiErr(err: unknown): string {
  const d = (err as { data?: { error?: { message?: string } } })?.data;
  return d?.error?.message ?? 'Ошибка';
}

const STATUS_LABEL: Record<SceneGenerationItem['status'], string> = {
  NOT_NEEDED: 'по шаблону',
  BLOCKED: 'нужен AI-персонаж',
  NOT_STARTED: 'не запускалась',
  PENDING: 'в очереди',
  PROCESSING: 'генерируется',
  COMPLETED: 'готова',
  FAILED: 'ошибка',
};

function StatusIcon({ status }: { status: SceneGenerationItem['status'] }) {
  if (status === 'PENDING' || status === 'PROCESSING') return <Loader2 className="h-4 w-4 animate-spin text-amber-600" />;
  if (status === 'COMPLETED') return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
  if (status === 'FAILED' || status === 'BLOCKED') return <AlertTriangle className="h-4 w-4 text-destructive" />;
  if (status === 'NOT_NEEDED') return <ImageOff className="h-4 w-4 text-muted-foreground" />;
  return <Sparkles className="h-4 w-4 text-muted-foreground" />;
}

/**
 * Панель генераций урока для преподавателя: видно по каждой сцене, нужна ли AI-генерация
 * (сцены с участием персонажа ученика), в каком она статусе, и можно перегенерировать
 * в любой момент до занятия. Послойные сцены собраны по шаблону и не переделываются.
 */
export function SceneGenerationsPanel({ instanceId }: { instanceId: string }) {
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useGetInstanceGenerationsQuery(instanceId, {
    // Пока что-то генерируется — частый опрос, иначе спокойный фоновый.
    pollingInterval: 4000,
    skipPollingIfUnfocused: true,
  });
  const [regenerate, { isLoading: regenerating }] = useRegenerateSceneMutation();
  const [pendingScene, setPendingScene] = useState<string | null>(null);

  if (isLoading || !data) return null;

  const { total, ready, running, failed, scenes, hasCharacter } = data;
  const progress = total > 0 ? Math.round((ready / total) * 100) : 100;

  const doRegenerate = async (sceneId: string) => {
    setPendingScene(sceneId);
    try {
      await regenerate({ instanceId, sceneId }).unwrap();
      toast({ title: 'Генерация запущена', description: 'Новая иллюстрация заменит текущую, когда будет готова.' });
    } catch (err) {
      toast({ title: 'Не удалось перегенерировать', description: apiErr(err), variant: 'destructive' });
    } finally {
      setPendingScene(null);
    }
  };

  return (
    <div className="mt-2 w-full rounded-xl border border-border bg-muted/30 p-3">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 text-left">
        <Sparkles className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">Иллюстрации урока</span>
        <span
          className={cn(
            'text-xs',
            failed > 0 ? 'text-destructive' : running > 0 ? 'text-amber-700' : 'text-muted-foreground',
          )}
        >
          {total === 0
            ? 'все сцены по шаблону, генерации не нужны'
            : running > 0
              ? `генерируется ${running} · готово ${ready} из ${total}`
              : failed > 0
                ? `готово ${ready} из ${total} · ошибок ${failed}`
                : `готово ${ready} из ${total}`}
        </span>
        <span className="ml-auto text-xs text-muted-foreground">{open ? 'Свернуть' : 'Подробно'}</span>
      </button>

      {total > 0 && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-border">
          <div
            className={cn('h-full transition-[width]', failed > 0 ? 'bg-destructive' : 'bg-primary')}
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {!hasCharacter && total > 0 && (
        <p className="mt-2 text-xs text-destructive">
          У ребёнка нет утверждённого AI-персонажа — сцены с персонажем показываются в универсальном виде.
        </p>
      )}

      {open && (
        <div className="mt-3 space-y-1.5 border-t border-border pt-3">
          {scenes.map((scene) => (
            <div key={scene.sceneId} className="flex items-center gap-2 rounded-lg bg-background/60 px-2 py-1.5">
              <span className="w-6 shrink-0 text-xs text-muted-foreground">{scene.index + 1}.</span>
              {scene.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- закрытый файл отдаётся авторизованным endpoint'ом
                <img src={scene.previewUrl} alt="" className="h-8 w-12 shrink-0 rounded object-cover" />
              ) : (
                <span className="flex h-8 w-12 shrink-0 items-center justify-center rounded bg-muted">
                  <StatusIcon status={scene.status} />
                </span>
              )}
              <span className="min-w-0 flex-1 truncate text-sm">{scene.title}</span>
              <span
                className={cn(
                  'shrink-0 text-xs',
                  scene.status === 'COMPLETED' ? 'text-emerald-700'
                    : scene.status === 'FAILED' || scene.status === 'BLOCKED' ? 'text-destructive'
                      : scene.status === 'PENDING' || scene.status === 'PROCESSING' ? 'text-amber-700'
                        : 'text-muted-foreground',
                )}
              >
                {STATUS_LABEL[scene.status]}
              </span>
              {scene.needsGeneration && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="shrink-0"
                  disabled={regenerating || !hasCharacter || scene.status === 'PENDING' || scene.status === 'PROCESSING'}
                  onClick={() => void doRegenerate(scene.sceneId)}
                  aria-label="Перегенерировать сцену"
                  title="Перегенерировать иллюстрацию с персонажем ученика"
                >
                  {pendingScene === scene.sceneId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                </Button>
              )}
            </div>
          ))}
          <p className="pt-1 text-[11px] text-muted-foreground">
            Переделываются только сцены, где участвует AI-персонаж ученика. Остальные собраны по шаблону урока.
          </p>
        </div>
      )}
    </div>
  );
}
