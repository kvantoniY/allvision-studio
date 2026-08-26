'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, ArrowLeft, Check, Download, Film, Loader2 } from 'lucide-react';
import {
  TIMELINE_ASPECTS,
  TIMELINE_LIMITS,
  formatTimelineDuration,
  timelineDurationSec,
  validateTimeline,
  type Timeline,
  type TimelineAspect,
  type TimelineScene,
} from '@allvision/shared';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/hooks/use-toast';
import { SceneInspector } from '@/components/editor/SceneInspector';
import { SceneStrip } from '@/components/editor/SceneStrip';
import { TimelinePlayer } from '@/components/editor/TimelinePlayer';
import { useGetProjectStatusQuery } from '@/store/api/projects-api';
import { useGetPublicMediaAssetsQuery } from '@/store/api/public-api';
import {
  useExportVideoProjectMutation,
  useGetVideoProjectQuery,
  useUpdateVideoProjectMutation,
  useUploadEditorMediaMutation,
} from '@/store/api/video-projects-api';
import { cn } from '@/lib/utils';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:4000');
const AUTOSAVE_DELAY_MS = 1200;

const ASPECT_LABELS: Record<TimelineAspect, string> = {
  '9:16': 'Вертикаль',
  '1:1': 'Квадрат',
  '16:9': 'Горизонт',
  '4:5': 'Лента',
};

function mediaUrl(value?: string | null) {
  if (!value) return null;
  if (value.startsWith('/static/')) return `${API_URL}${value}`;
  return value;
}

function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

function newScene(): TimelineScene {
  return {
    id: uid('scene'),
    source: { kind: 'color', color: '#0b1020' },
    durationSec: 4,
    transition: 'dissolve',
    transitionDurationSec: 0.6,
    muted: false,
    volume: 1,
    overlays: [],
  };
}

/**
 * Редактор ролика.
 *
 * Правки живут в локальном состоянии и уезжают на сервер с задержкой: сохранять
 * каждое нажатие клавиши в поле титра — это запрос на символ, а терять работу
 * при закрытии вкладки нельзя, поэтому автосохранение, а не кнопка «Сохранить».
 */
export function VideoEditor({ id }: { id: string }) {
  const { data, isLoading, isError } = useGetVideoProjectQuery(id);
  const [updateProject] = useUpdateVideoProjectMutation();
  const [uploadMedia, { isLoading: uploading }] = useUploadEditorMediaMutation();
  const [exportProject, { isLoading: exporting }] = useExportVideoProjectMutation();
  const { data: musicData } = useGetPublicMediaAssetsQuery({ kind: 'background-music', active: true });

  const [timeline, setTimeline] = useState<Timeline | null>(null);
  const [title, setTitle] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [exportId, setExportId] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedRef = useRef(false);

  // Ответ сервера принимаем один раз: иначе автосохранение перетирало бы то,
  // что пользователь успел напечатать, пока запрос летел.
  useEffect(() => {
    if (!data?.project || loadedRef.current) return;
    loadedRef.current = true;
    setTimeline(data.project.timeline);
    setTitle(data.project.title);
    setExportId(data.project.lastExportId);
  }, [data]);

  const scheduleSave = useCallback(
    (patch: { title?: string; timeline?: Timeline }) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      setSaveState('saving');
      saveTimer.current = setTimeout(async () => {
        try {
          await updateProject({ id, ...patch }).unwrap();
          setSaveState('saved');
        } catch {
          setSaveState('idle');
          toast({
            title: 'Не удалось сохранить',
            description: 'Проверьте соединение — правки останутся на экране до следующей попытки.',
            variant: 'destructive',
          });
        }
      }, AUTOSAVE_DELAY_MS);
    },
    [id, updateProject],
  );

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
  }, []);

  const applyTimeline = useCallback(
    (next: Timeline) => {
      setTimeline(next);
      scheduleSave({ timeline: next });
    },
    [scheduleSave],
  );

  const patchScene = useCallback(
    (index: number, patch: Partial<TimelineScene>) => {
      if (!timeline) return;
      const scenes = timeline.scenes.map((scene, i) => (i === index ? { ...scene, ...patch } : scene));
      applyTimeline({ ...timeline, scenes });
    },
    [timeline, applyTimeline],
  );

  const addScene = useCallback(() => {
    if (!timeline) return;
    if (timeline.scenes.length >= TIMELINE_LIMITS.maxScenes) {
      toast({ title: `Больше ${TIMELINE_LIMITS.maxScenes} сцен не поместится`, variant: 'destructive' });
      return;
    }
    applyTimeline({ ...timeline, scenes: [...timeline.scenes, newScene()] });
    setSelectedIndex(timeline.scenes.length);
  }, [timeline, applyTimeline]);

  const moveScene = useCallback(
    (index: number, direction: -1 | 1) => {
      if (!timeline) return;
      const target = index + direction;
      if (target < 0 || target >= timeline.scenes.length) return;
      const scenes = [...timeline.scenes];
      [scenes[index], scenes[target]] = [scenes[target], scenes[index]];
      applyTimeline({ ...timeline, scenes });
      setSelectedIndex(target);
    },
    [timeline, applyTimeline],
  );

  const duplicateScene = useCallback(
    (index: number) => {
      if (!timeline) return;
      if (timeline.scenes.length >= TIMELINE_LIMITS.maxScenes) return;
      const copy = { ...timeline.scenes[index], id: uid('scene') };
      const scenes = [...timeline.scenes];
      scenes.splice(index + 1, 0, copy);
      applyTimeline({ ...timeline, scenes });
      setSelectedIndex(index + 1);
    },
    [timeline, applyTimeline],
  );

  const removeScene = useCallback(
    (index: number) => {
      if (!timeline || timeline.scenes.length <= 1) return;
      const scenes = timeline.scenes.filter((_, i) => i !== index);
      applyTimeline({ ...timeline, scenes });
      setSelectedIndex(Math.max(0, index - 1));
    },
    [timeline, applyTimeline],
  );

  const handleUpload = useCallback(
    async (file: File) => {
      if (!timeline) return;
      try {
        const uploaded = await uploadMedia({ id, file }).unwrap();
        // Длительность меряет браузер: на сервере ffprobe нет, а рендер всё равно
        // перемерит файл сам — здесь это нужно только чтобы сцена сразу была правильной длины.
        const durationSec = uploaded.mediaKind === 'video' ? await probeDuration(file) : undefined;
        patchScene(selectedIndex, {
          source: { kind: uploaded.mediaKind === 'video' ? 'video' : 'image', url: uploaded.url },
          trimStartSec: undefined,
          trimEndSec: undefined,
          durationSec: uploaded.mediaKind === 'video' ? durationSec : 4,
        });
      } catch {
        toast({ title: 'Не удалось загрузить файл', description: 'Проверьте формат и размер.', variant: 'destructive' });
      }
    },
    [id, timeline, uploadMedia, patchScene, selectedIndex],
  );

  const { data: exportStatus } = useGetProjectStatusQuery(exportId ?? '', {
    skip: !exportId,
    pollingInterval: exportId ? 3000 : 0,
  });
  const exportRunning = exportStatus?.status === 'PENDING' || exportStatus?.status === 'PROCESSING';
  const exportUrl = exportStatus?.status === 'COMPLETED' ? mediaUrl(exportStatus.resultVideo) : null;

  const issues = useMemo(() => (timeline ? validateTimeline(timeline) : []), [timeline]);
  const duration = useMemo(() => (timeline ? timelineDurationSec(timeline) : 0), [timeline]);

  const handleExport = async () => {
    if (!timeline) return;
    if (issues.length > 0) {
      toast({ title: 'Ролик пока нельзя собрать', description: issues[0].message, variant: 'destructive' });
      return;
    }
    // Даём автосохранению доехать: экспорт читает таймлайн с сервера, а не с экрана.
    if (saveTimer.current) clearTimeout(saveTimer.current);
    try {
      await updateProject({ id, title, timeline }).unwrap();
      const result = await exportProject(id).unwrap();
      setExportId(result.projectId);
      setSaveState('saved');
      toast({
        title: result.alreadyRunning ? 'Экспорт уже идёт' : 'Собираем ролик',
        description: 'Можно закрыть страницу — файл появится здесь, когда будет готов.',
      });
    } catch {
      toast({ title: 'Не удалось запустить сборку', variant: 'destructive' });
    }
  };

  if (isLoading || !timeline) {
    return (
      <div className="container space-y-4 py-8">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="aspect-[9/16] max-h-[50vh] w-full rounded-xl" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="container py-10">
        <Alert variant="destructive" className="max-w-2xl">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Ролик не найден</AlertTitle>
          <AlertDescription>Возможно, он был удалён.</AlertDescription>
        </Alert>
      </div>
    );
  }

  const selectedScene = timeline.scenes[Math.min(selectedIndex, timeline.scenes.length - 1)];
  const musicOptions = musicData?.assets ?? [];

  return (
    <div className="container space-y-6 py-6 lg:max-w-6xl">
      <header className="flex flex-wrap items-center gap-3">
        <Link
          href="/editor"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-slate-700 text-slate-300 transition hover:border-slate-500 hover:text-white"
          aria-label="К списку роликов"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <Input
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
            scheduleSave({ title: event.target.value });
          }}
          className="h-10 max-w-xs flex-1 border-slate-700 bg-slate-900/80 text-base font-semibold"
          aria-label="Название ролика"
        />
        <span className="flex items-center gap-1.5 text-xs text-slate-500">
          {saveState === 'saving' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {saveState === 'saved' && <Check className="h-3.5 w-3.5 text-emerald-400" />}
          {saveState === 'saving' ? 'Сохраняем…' : saveState === 'saved' ? 'Сохранено' : ''}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden font-mono text-xs text-slate-500 sm:inline">{formatTimelineDuration(duration)}</span>
          <Button type="button" onClick={handleExport} disabled={exporting || exportRunning}>
            {exporting || exportRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Film className="h-4 w-4" />}
            {exportRunning ? 'Собираем…' : 'Собрать ролик'}
          </Button>
        </div>
      </header>

      {issues.length > 0 && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Ролик пока нельзя собрать</AlertTitle>
          <AlertDescription>
            <ul className="list-inside list-disc">
              {issues.map((issue) => (
                <li key={`${issue.code}-${issue.sceneId ?? ''}`}>{issue.message}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {exportUrl && (
        <Alert className="border-emerald-500/40 bg-emerald-500/10">
          <Check className="h-4 w-4" />
          <AlertTitle>Ролик готов</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            <span>Файл сохранён в вашем кабинете.</span>
            <a
              href={exportUrl}
              download
              className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500 px-4 py-1.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
            >
              <Download className="h-4 w-4" />
              Скачать
            </a>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr),380px]">
        <div className="space-y-4">
          <TimelinePlayer timeline={timeline} />
          <SceneStrip
            timeline={timeline}
            selectedIndex={selectedIndex}
            onSelect={setSelectedIndex}
            onMove={moveScene}
            onDuplicate={duplicateScene}
            onRemove={removeScene}
            onAdd={addScene}
          />
        </div>

        <div className="space-y-4">
          {selectedScene && (
            <SceneInspector
              scene={selectedScene}
              index={Math.min(selectedIndex, timeline.scenes.length - 1)}
              isLast={selectedIndex >= timeline.scenes.length - 1}
              uploading={uploading}
              onChange={(patch) => patchScene(selectedIndex, patch)}
              onUpload={handleUpload}
            />
          )}

          <div className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <h3 className="font-semibold text-slate-100">Ролик целиком</h3>

            <div className="space-y-2">
              <Label>Формат кадра</Label>
              <div className="flex flex-wrap gap-2">
                {TIMELINE_ASPECTS.map((aspect) => (
                  <button
                    key={aspect}
                    type="button"
                    onClick={() => applyTimeline({ ...timeline, aspect })}
                    className={cn(
                      'rounded-full border px-3 py-1.5 text-sm transition',
                      timeline.aspect === aspect
                        ? 'border-amber-400 bg-amber-400/15 text-amber-200'
                        : 'border-slate-700 text-slate-300 hover:border-slate-500',
                    )}
                  >
                    {ASPECT_LABELS[aspect]}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Музыка</Label>
              <select
                value={timeline.music?.url ?? ''}
                onChange={(event) => {
                  const url = event.target.value;
                  applyTimeline({
                    ...timeline,
                    music: url
                      ? { url, volume: timeline.music?.volume ?? 0.7, fadeInSec: 1.5, fadeOutSec: 2.5, loop: true, startAtSec: 0 }
                      : undefined,
                  });
                }}
                className="h-10 w-full rounded-md border border-slate-700 bg-slate-900 px-2 text-sm text-slate-100"
              >
                <option value="">Без музыки</option>
                {musicOptions.map((asset) => (
                  <option key={asset.id} value={asset.publicUrl}>
                    {asset.title}
                  </option>
                ))}
              </select>
              {musicOptions.length === 0 && (
                <p className="text-xs text-slate-500">Библиотека музыки пока пуста.</p>
              )}
              {timeline.music && (
                <label className="block text-xs text-slate-400">
                  Громкость музыки
                  <input
                    type="range"
                    min={0}
                    max={1.5}
                    step={0.05}
                    value={timeline.music.volume}
                    onChange={(event) =>
                      applyTimeline({ ...timeline, music: { ...timeline.music!, volume: Number(event.target.value) } })
                    }
                    className="mt-1 w-full accent-amber-400"
                  />
                </label>
              )}
            </div>

            <p className="text-xs text-slate-500">
              Сцен: {timeline.scenes.length} из {TIMELINE_LIMITS.maxScenes}. Длительность {formatTimelineDuration(duration)}{' '}
              из {formatTimelineDuration(TIMELINE_LIMITS.maxTotalDurationSec)}.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Длительность видео из самого файла: браузер знает её сразу после чтения метаданных. */
function probeDuration(file: File): Promise<number | undefined> {
  return new Promise((resolve) => {
    const element = document.createElement('video');
    const url = URL.createObjectURL(file);
    const done = (value?: number) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };
    element.preload = 'metadata';
    element.onloadedmetadata = () => done(Number.isFinite(element.duration) ? element.duration : undefined);
    element.onerror = () => done(undefined);
    element.src = url;
  });
}
