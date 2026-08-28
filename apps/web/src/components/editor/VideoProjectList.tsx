'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Clapperboard, Film, Loader2, Plus, Trash2 } from 'lucide-react';
import {
  formatTimelineDuration,
  primaryMediaLayer,
  timelineDurationSec,
  type Timeline,
} from '@allvision/shared';
import { Button } from '@/components/ui/button';
import { mediaUrl } from '@/components/editor/canvas/useMediaElements';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/hooks/use-toast';
import {
  useCreateVideoProjectMutation,
  useDeleteVideoProjectMutation,
  useListVideoProjectsQuery,
} from '@/store/api/video-projects-api';

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
}


/**
 * Обложка ролика — первый настоящий кадр из его сцен.
 *
 * Берём первый медиа-слой, у которого есть файл: у пустых сцен это заливка, и показывать
 * чёрный прямоугольник вместо превью бессмысленно. Видео браузер сам покажет первым кадром.
 */
function coverOf(timeline: Timeline): { url: string; isVideo: boolean } | null {
  for (const scene of timeline.scenes) {
    const layer = primaryMediaLayer(scene);
    const source = layer?.source;
    if (!source?.url) continue;
    if (source.kind !== 'image' && source.kind !== 'video') continue;
    const url = mediaUrl(source.url);
    if (url) return { url, isVideo: source.kind === 'video' };
  }
  return null;
}

export function VideoProjectList() {
  const router = useRouter();
  const { data, isLoading } = useListVideoProjectsQuery();
  const [createProject, { isLoading: creating }] = useCreateVideoProjectMutation();
  const [deleteProject] = useDeleteVideoProjectMutation();

  const items = data?.items ?? [];

  const onCreate = async () => {
    try {
      const result = await createProject().unwrap();
      router.push(`/editor/${result.project.id}`);
    } catch {
      toast({ title: 'Не удалось создать ролик', variant: 'destructive' });
    }
  };

  return (
    <div className="container space-y-8 py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <h1 className="text-3xl font-black tracking-tight sm:text-4xl">Мои ролики</h1>
          <p className="mt-3 leading-7 text-slate-400">
            Соберите видео из своих фотографий и записей: сцены, переходы, титры и музыка.
            Готовый файл можно скачать целиком.
          </p>
        </div>
        <Button type="button" onClick={onCreate} disabled={creating}>
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Новый ролик
        </Button>
      </header>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-32 rounded-xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-800 bg-slate-900/50 p-10 text-center">
          <Clapperboard className="mx-auto h-8 w-8 text-slate-600" />
          <p className="mt-4 text-slate-300">Здесь появятся ролики, которые вы соберёте.</p>
          <Button type="button" onClick={onCreate} disabled={creating} className="mt-5">
            <Plus className="h-4 w-4" />
            Собрать первый
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((project) => {
            const duration = timelineDurationSec(project.timeline);
            const cover = coverOf(project.timeline);
            return (
              <div key={project.id} className="group overflow-hidden rounded-xl border border-slate-800 bg-slate-900/60 transition hover:border-slate-700">
                <Link href={`/editor/${project.id}`} className="block">
                  <div className="relative aspect-video overflow-hidden bg-slate-950">
                    {cover ? (
                      cover.isVideo ? (
                        <video
                          src={cover.url}
                          muted
                          playsInline
                          preload="metadata"
                          className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                        />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={cover.url}
                          alt=""
                          className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                        />
                      )
                    ) : (
                      <span className="grid h-full w-full place-items-center bg-gradient-to-br from-slate-800 to-slate-950 text-slate-600">
                        <Film className="h-7 w-7" />
                      </span>
                    )}
                    <span className="absolute bottom-2 right-2 rounded bg-slate-950/85 px-1.5 py-0.5 font-mono text-[11px] text-slate-200">
                      {formatTimelineDuration(duration)}
                    </span>
                  </div>
                  <div className="p-4">
                    <h2 className="truncate font-semibold text-slate-100">{project.title}</h2>
                    <p className="mt-1 text-xs text-slate-500">
                      {project.timeline.scenes.length} сцен · {formatDate(project.updatedAt)}
                    </p>
                  </div>
                </Link>
                <div className="flex justify-end border-t border-slate-800 px-2 py-1">
                  <button
                    type="button"
                    onClick={async () => {
                      if (!window.confirm(`Удалить ролик «${project.title}»?`)) return;
                      try {
                        await deleteProject(project.id).unwrap();
                      } catch {
                        toast({ title: 'Не удалось удалить ролик', variant: 'destructive' });
                      }
                    }}
                    className="p-1.5 text-slate-500 transition hover:text-rose-300"
                    aria-label={`Удалить ${project.title}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
