'use client';

import { useRouter } from 'next/navigation';
import { Loader2, Scissors } from 'lucide-react';
import { sceneLayers, timelineScenes, type Timeline } from '@allvision/shared';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import {
  useCreateFromProjectMutation,
  useUpdateVideoProjectMutation,
} from '@/store/api/video-projects-api';
import { mediaUrl } from '@/components/editor/canvas/useMediaElements';

/** Длительность видео по ссылке. На сервере ffprobe нет, а браузер знает её из метаданных. */
function probeUrlDuration(url: string): Promise<number | undefined> {
  return new Promise((resolve) => {
    const element = document.createElement('video');
    element.preload = 'metadata';
    element.onloadedmetadata = () => resolve(Number.isFinite(element.duration) ? element.duration : undefined);
    element.onerror = () => resolve(undefined);
    element.src = url;
  });
}

/**
 * Проставляет длительность одиночной видео-сцены.
 *
 * Сервер собирает такую сцену из готового результата, но длины файла не знает: без неё
 * сцена схлопнулась бы до четырёх секунд по умолчанию, и экспорт обрезал бы ролик.
 */
async function withMeasuredDuration(timeline: Timeline): Promise<Timeline | null> {
  const scenes = timelineScenes(timeline);
  if (scenes.length !== 1) return null;
  const scene = scenes[0];
  if (typeof scene.durationSec === 'number') return null;
  const layer = sceneLayers(scene).find((item) => item.kind === 'media');
  if (!layer || layer.kind !== 'media' || layer.source.kind !== 'video' || !layer.source.url) return null;

  const src = mediaUrl(layer.source.url);
  const durationSec = src ? await probeUrlDuration(src) : undefined;
  if (!durationSec) return null;
  return { ...timeline, scenes: [{ ...scene, durationSec }] };
}

/**
 * «Доработать в редакторе»: из готового результата делает редактируемый ролик.
 *
 * Генерации уже оплачены, поэтому кнопка ничего не списывает — она только переносит
 * готовое в редактор. Шаблон поздравления открывается целиком, со сценами, титрами и
 * музыкой; любой другой результат — одной сценой, из которой можно собрать своё.
 */
export function OpenInEditorButton({
  projectId,
  title,
  className,
}: {
  projectId: string;
  title?: string;
  className?: string;
}) {
  const router = useRouter();
  const [createFromProject, { isLoading }] = useCreateFromProjectMutation();
  const [updateProject] = useUpdateVideoProjectMutation();

  return (
    <Button
      type="button"
      variant="outline"
      className={className}
      disabled={isLoading}
      onClick={async () => {
        try {
          const result = await createFromProject({ projectId, ...(title ? { title } : {}) }).unwrap();
          const measured = await withMeasuredDuration(result.project.timeline);
          if (measured) {
            // Ошибку замера глотаем: попасть в редактор важнее, чем угадать длительность,
            // а поправить её можно там же вручную.
            await updateProject({ id: result.project.id, timeline: measured }).unwrap().catch(() => undefined);
          }
          router.push(`/editor/${result.project.id}`);
        } catch (error) {
          const message = (error as { data?: { error?: { message?: string } } })?.data?.error?.message;
          toast({ title: 'Не удалось открыть в редакторе', description: message, variant: 'destructive' });
        }
      }}
    >
      {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Scissors className="h-4 w-4" />}
      Доработать в редакторе
    </Button>
  );
}
