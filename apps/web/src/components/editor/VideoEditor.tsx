'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Download,
  Film,
  Image as ImageIcon,
  LayoutGrid,
  Loader2,
  Music,
  Redo2,
  Sparkles,
  Type,
  Undo2,
  Upload,
} from 'lucide-react';
import {
  COLLAGE_LAYOUT_TITLES,
  TIMELINE_ASPECTS,
  TIMELINE_LIMITS,
  applyGeneratedSource,
  createTimelineHistory,
  formatTimelineDuration,
  pushTimelineHistory,
  redoTimeline,
  undoTimeline,
  sceneLayers,
  sceneMediaLayers,
  timelineDurationSec,
  validateTimeline,
  type CollageLayout,
  type MediaLayer,
  type SceneLayer,
  type Timeline,
  type TimelineAspect,
  type TimelineHistory,
  type TimelineScene,
} from '@allvision/shared';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/hooks/use-toast';
import { EditorStage } from '@/components/editor/EditorStage';
import { LayerInspector } from '@/components/editor/LayerInspector';
import { LayerPanel } from '@/components/editor/LayerPanel';
import { SceneGenerator, type SceneGenerationRequest } from '@/components/editor/SceneGenerator';
import { SceneStrip } from '@/components/editor/SceneStrip';
import { AudioTools, type VoiceoverRequest } from '@/components/editor/AudioTools';
import { newScene, uid, useEditorOperations, type LayerPatch } from '@/components/editor/useEditorTimeline';
import { useGetProjectStatusQuery } from '@/store/api/projects-api';
import { useGetPublicMediaAssetsQuery } from '@/store/api/public-api';
import {
  useExportVideoProjectMutation,
  useGenerateSceneMutation,
  useGenerateVoiceoverMutation,
  useGetVideoProjectQuery,
  useUpdateVideoProjectMutation,
  useUploadEditorMediaMutation,
} from '@/store/api/video-projects-api';
import { useGetMeQuery } from '@/store/api/auth-api';
import { useGetChatModelsQuery } from '@/store/api/user-chat-api';
import { cn } from '@/lib/utils';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:4000');
const AUTOSAVE_DELAY_MS = 1200;

const ASPECT_LABELS: Record<TimelineAspect, string> = {
  '9:16': 'Вертикаль',
  '1:1': 'Квадрат',
  '16:9': 'Горизонт',
  '4:5': 'Лента',
};

const TOOLS = [
  { code: 'media', label: 'Медиа', icon: ImageIcon },
  { code: 'text', label: 'Текст', icon: Type },
  { code: 'audio', label: 'Звук', icon: Music },
  { code: 'ai', label: 'ИИ', icon: Sparkles },
] as const;

type ToolCode = (typeof TOOLS)[number]['code'];

function mediaUrl(value?: string | null) {
  if (!value) return null;
  if (value.startsWith('/static/')) return `${API_URL}${value}`;
  return value;
}

/**
 * Редактор ролика.
 *
 * Раскладка повторяет то, к чему приучили монтажки: инструменты слева, холст в центре,
 * лента сцен под ним, а справа — слои и настройки того, что выделено. Постоянная стопка
 * всех настроек сразу и была тем, что делало прежнюю панель нечитаемой.
 */
export function VideoEditor({ id }: { id: string }) {
  const { data, isLoading, isError, refetch: refetchProject } = useGetVideoProjectQuery(id);
  const [updateProject] = useUpdateVideoProjectMutation();
  const [uploadMedia, { isLoading: uploading }] = useUploadEditorMediaMutation();
  const [exportProject, { isLoading: exporting }] = useExportVideoProjectMutation();
  const [generateScene, { isLoading: generating }] = useGenerateSceneMutation();
  const [generateVoiceover, { isLoading: generatingVoiceover }] = useGenerateVoiceoverMutation();
  const { data: me } = useGetMeQuery();
  const { data: musicData } = useGetPublicMediaAssetsQuery({ kind: 'background-music', active: true });
  // Оверрайды цен общие с чатом: показывать цену ниже той, что спишет сервер, нельзя.
  const { data: chatPricing } = useGetChatModelsQuery();

  const [timeline, setTimeline] = useState<Timeline | null>(null);
  const [title, setTitle] = useState('');
  const [sceneIndex, setSceneIndex] = useState(0);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [tool, setTool] = useState<ToolCode>('media');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [exportId, setExportId] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedRef = useRef(false);
  const uploadTargetRef = useRef<{ sceneIndex: number; layerId: string | null } | null>(null);
  const addFileRef = useRef<HTMLInputElement | null>(null);
  const voiceFileRef = useRef<HTMLInputElement | null>(null);
  const timelineRef = useRef<Timeline | null>(null);
  // История живёт в ref: её глубина нужна только кнопкам, а перерисовывать редактор
  // на каждую запись незачем.
  const historyRef = useRef<TimelineHistory>(createTimelineHistory());
  const [historyDepth, setHistoryDepth] = useState({ past: 0, future: 0 });

  // Ответ сервера принимаем один раз: иначе автосохранение перетирало бы то,
  // что пользователь успел изменить, пока летел запрос.
  useEffect(() => {
    if (!data?.project || loadedRef.current) return;
    loadedRef.current = true;
    setTimeline(data.project.timeline);
    setTitle(data.project.title);
    setExportId(data.project.lastExportId);
  }, [data]);

  useEffect(() => {
    timelineRef.current = timeline;
  }, [timeline]);

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

  /** Применяет раскладку без записи в историю: так возвращаются отмена и повтор. */
  const applyWithoutHistory = useCallback(
    (next: Timeline) => {
      setTimeline(next);
      timelineRef.current = next;
      scheduleSave({ timeline: next });
    },
    [scheduleSave],
  );

  const applyTimeline = useCallback(
    (next: Timeline) => {
      const previous = timelineRef.current;
      if (previous) historyRef.current = pushTimelineHistory(historyRef.current, previous, Date.now());
      setHistoryDepth({ past: historyRef.current.past.length, future: historyRef.current.future.length });
      applyWithoutHistory(next);
    },
    [applyWithoutHistory],
  );

  const undo = useCallback(() => {
    const current = timelineRef.current;
    if (!current) return;
    const result = undoTimeline(historyRef.current, current);
    if (!result) return;
    historyRef.current = result.history;
    setHistoryDepth({ past: result.history.past.length, future: result.history.future.length });
    applyWithoutHistory(result.timeline);
  }, [applyWithoutHistory]);

  const redo = useCallback(() => {
    const current = timelineRef.current;
    if (!current) return;
    const result = redoTimeline(historyRef.current, current);
    if (!result) return;
    historyRef.current = result.history;
    setHistoryDepth({ past: result.history.past.length, future: result.history.future.length });
    applyWithoutHistory(result.timeline);
  }, [applyWithoutHistory]);

  const ops = useEditorOperations(timeline, applyTimeline);

  const currentScene: TimelineScene | undefined =
    timeline?.scenes[Math.min(sceneIndex, (timeline?.scenes.length ?? 1) - 1)];
  const layers: SceneLayer[] = useMemo(() => (currentScene ? sceneLayers(currentScene) : []), [currentScene]);
  const selectedLayer = layers.find((layer) => layer.id === selectedLayerId) ?? null;

  // Выделение живёт внутри сцены: при переходе на другую оно должно сбрасываться.
  useEffect(() => {
    setSelectedLayerId(null);
  }, [sceneIndex]);

  // --- сцены ---
  const addScene = useCallback(() => {
    if (!timeline) return;
    if (timeline.scenes.length >= TIMELINE_LIMITS.maxScenes) {
      toast({ title: `Больше ${TIMELINE_LIMITS.maxScenes} сцен не поместится`, variant: 'destructive' });
      return;
    }
    applyTimeline({ ...timeline, scenes: [...timeline.scenes, newScene()] });
    setSceneIndex(timeline.scenes.length);
  }, [timeline, applyTimeline]);

  const moveScene = useCallback(
    (index: number, direction: -1 | 1) => {
      if (!timeline) return;
      const target = index + direction;
      if (target < 0 || target >= timeline.scenes.length) return;
      const scenes = [...timeline.scenes];
      [scenes[index], scenes[target]] = [scenes[target], scenes[index]];
      applyTimeline({ ...timeline, scenes });
      setSceneIndex(target);
    },
    [timeline, applyTimeline],
  );

  const duplicateScene = useCallback(
    (index: number) => {
      if (!timeline || timeline.scenes.length >= TIMELINE_LIMITS.maxScenes) return;
      const source = timeline.scenes[index];
      // У копии новые идентификаторы: иначе метка генерации и выделение указывали бы
      // сразу на две сцены.
      const copy: TimelineScene = {
        ...source,
        id: uid('scene'),
        layers: sceneLayers(source).map((layer) => ({ ...layer, id: uid('layer'), generationProjectId: undefined })),
        source: undefined,
        overlays: [],
      };
      const scenes = [...timeline.scenes];
      scenes.splice(index + 1, 0, copy);
      applyTimeline({ ...timeline, scenes });
      setSceneIndex(index + 1);
    },
    [timeline, applyTimeline],
  );

  const removeScene = useCallback(
    (index: number) => {
      if (!timeline || timeline.scenes.length <= 1) return;
      applyTimeline({ ...timeline, scenes: timeline.scenes.filter((_, i) => i !== index) });
      setSceneIndex(Math.max(0, index - 1));
    },
    [timeline, applyTimeline],
  );

  // --- загрузка файлов ---
  const handleUpload = useCallback(
    async (file: File) => {
      const target = uploadTargetRef.current ?? { sceneIndex, layerId: selectedLayerId };
      uploadTargetRef.current = null;
      try {
        const uploaded = await uploadMedia({ id, file }).unwrap();
        const kind = uploaded.mediaKind === 'video' ? ('video' as const) : ('image' as const);
        // Длительность меряет браузер: ffprobe на сервере нет, а рендер всё равно
        // перемерит файл сам — здесь это нужно, чтобы сцена сразу была нужной длины.
        const durationSec = kind === 'video' ? await probeDuration(file) : undefined;

        if (target.layerId) {
          ops.changeLayer(target.sceneIndex, target.layerId, {
            source: { kind, url: uploaded.url },
            trimStartSec: undefined,
            trimEndSec: undefined,
          });
        } else {
          const layerId = ops.addMediaLayer(target.sceneIndex, { kind, url: uploaded.url });
          if (layerId) setSelectedLayerId(layerId);
        }
        if (kind === 'video' && durationSec) ops.patchScene(target.sceneIndex, { durationSec });
      } catch {
        toast({ title: 'Не удалось загрузить файл', description: 'Проверьте формат и размер.', variant: 'destructive' });
      }
    },
    [id, uploadMedia, ops, sceneIndex, selectedLayerId],
  );

  const pickFileFor = (layerId: string | null) => {
    uploadTargetRef.current = { sceneIndex, layerId };
    addFileRef.current?.click();
  };

  // --- озвучка ---
  const setVoiceover = useCallback(
    (url: string | null) => {
      if (!timelineRef.current) return;
      const current = timelineRef.current;
      applyTimeline({
        ...current,
        voiceover: url
          ? { url, volume: 1, fadeInSec: 0.2, fadeOutSec: 0.4, loop: false, startAtSec: 0 }
          : undefined,
      });
    },
    [applyTimeline],
  );

  const handleVoiceUpload = useCallback(
    async (file: File) => {
      try {
        const uploaded = await uploadMedia({ id, file }).unwrap();
        if (uploaded.mediaKind !== 'audio') {
          toast({ title: 'Нужен аудиофайл', description: 'MP3, WAV или M4A.', variant: 'destructive' });
          return;
        }
        setVoiceover(uploaded.url);
      } catch {
        toast({ title: 'Не удалось загрузить запись', description: 'Проверьте формат и размер.', variant: 'destructive' });
      }
    },
    [id, uploadMedia, setVoiceover],
  );

  const [voiceoverProjectId, setVoiceoverProjectId] = useState<string | null>(null);
  const { data: voiceoverStatus } = useGetProjectStatusQuery(voiceoverProjectId ?? '', {
    skip: !voiceoverProjectId,
    pollingInterval: voiceoverProjectId ? 3000 : 0,
  });
  const voiceoverRunning =
    generatingVoiceover || voiceoverStatus?.status === 'PENDING' || voiceoverStatus?.status === 'PROCESSING';

  useEffect(() => {
    if (!voiceoverProjectId) return;
    if (voiceoverStatus?.status === 'FAILED') {
      setVoiceoverProjectId(null);
      toast({ title: 'Озвучка не получилась', description: 'Коины вернулись на баланс.', variant: 'destructive' });
      return;
    }
    if (voiceoverStatus?.status !== 'COMPLETED') return;
    setVoiceoverProjectId(null);

    // Дорожку в свою копию ролика уже вписал воркер — забираем оттуда только её,
    // чтобы не затереть правки, сделанные пока шёл синтез.
    void (async () => {
      try {
        const fresh = await refetchProject().unwrap();
        const url = fresh.project.timeline.voiceover?.url;
        if (url) {
          setVoiceover(url);
          toast({ title: 'Голос записан' });
        }
      } catch {
        toast({ title: 'Озвучка готова', description: 'Обновите страницу, если дорожка не появилась.' });
      }
    })();
  }, [voiceoverProjectId, voiceoverStatus?.status, refetchProject, setVoiceover]);

  const handleGenerateVoiceover = useCallback(
    async (request: VoiceoverRequest) => {
      try {
        const result = await generateVoiceover({ id, body: request }).unwrap();
        setVoiceoverProjectId(result.projectId);
        toast({ title: 'Озвучка запущена', description: 'Голос сам встанет в ролик.' });
      } catch (error) {
        const message = (error as { data?: { error?: { message?: string } } })?.data?.error?.message;
        toast({ title: 'Не удалось запустить озвучку', description: message, variant: 'destructive' });
      }
    },
    [generateVoiceover, id],
  );

  // --- генерация в слой ---
  const runningGenerationId = currentScene
    ? sceneMediaLayers(currentScene).find((layer) => Boolean(layer.generationProjectId))?.generationProjectId ?? null
    : null;

  const { data: sceneStatus } = useGetProjectStatusQuery(runningGenerationId ?? '', {
    skip: !runningGenerationId,
    pollingInterval: runningGenerationId ? 3000 : 0,
  });
  const generationRunning = sceneStatus?.status === 'PENDING' || sceneStatus?.status === 'PROCESSING';

  const appliedGenerationRef = useRef<string | null>(null);
  useEffect(() => {
    if (!runningGenerationId || sceneStatus?.status !== 'COMPLETED') return;
    if (appliedGenerationRef.current === runningGenerationId) return;
    appliedGenerationRef.current = runningGenerationId;

    void (async () => {
      try {
        const fresh = await refetchProject().unwrap();
        // Воркер уже вписал результат в свою копию ролика — забираем оттуда только
        // материал готового слоя, а не весь таймлайн: правки, сделанные во время
        // генерации, затирать нельзя.
        const generatedLayer = fresh.project.timeline.scenes
          .flatMap((scene) => sceneMediaLayers(scene))
          .find((layer) => layer.generationProjectId === runningGenerationId);
        const url = generatedLayer?.source.url;
        const kind = generatedLayer?.source.kind;
        if (!url || (kind !== 'image' && kind !== 'video')) return;

        setTimeline((current) => {
          if (!current) return current;
          const applied = applyGeneratedSource(current, runningGenerationId, { kind, url });
          return applied.changed ? applied.timeline : current;
        });
        toast({ title: 'Кадр готов' });
      } catch {
        toast({ title: 'Генерация готова', description: 'Обновите страницу, если кадр не появился.' });
      }
    })();
  }, [runningGenerationId, sceneStatus?.status, refetchProject]);

  const handleGenerate = useCallback(
    async (request: SceneGenerationRequest) => {
      const scene = currentScene;
      if (!timeline || !scene) return;

      // По умолчанию результат встаёт в НОВЫЙ слой поверх сцены: подменять то, что человек
      // уже разложил, без спроса нельзя. Заменить выделенный слой можно, но только явно.
      const replaceSelected = request.target === 'selected' && selectedLayer?.kind === 'media';
      const layerId = replaceSelected
        ? selectedLayer!.id
        : ops.addMediaLayer(sceneIndex, { kind: 'color', color: '#0b1020' });
      if (!layerId) {
        toast({ title: 'В сцене слишком много слоёв', variant: 'destructive' });
        return;
      }

      if (saveTimer.current) clearTimeout(saveTimer.current);
      try {
        // Сервер ищет сцену в своей копии таймлайна, поэтому сначала досохраняем.
        if (timelineRef.current) await updateProject({ id, timeline: timelineRef.current }).unwrap();
        const result = await generateScene({
          id,
          sceneId: scene.id,
          body: {
            modelSlug: request.modelSlug,
            prompt: request.prompt,
            aspectRatio: request.aspectRatio,
            // Слой называем серверу: он поставит метку в свою копию ролика, и результат
            // доедет, даже если вкладку закроют до автосохранения.
            layerId,
            ...(request.duration ? { duration: request.duration } : {}),
            ...(request.imageInputRef ? { imageInputRef: request.imageInputRef } : {}),
          },
        }).unwrap();
        appliedGenerationRef.current = null;
        ops.changeLayer(sceneIndex, layerId, { generationProjectId: result.projectId, origin: 'generated' });
        setSelectedLayerId(layerId);
        toast({ title: 'Генерация запущена', description: 'Можно закрыть страницу — кадр сам встанет в сцену.' });
      } catch (error) {
        // Убираем только тот слой, который завели ради этой генерации: чужой кадр,
        // выбранный пользователем, из-за нашей ошибки исчезать не должен.
        if (!replaceSelected) ops.removeLayer(sceneIndex, layerId);
        const message = (error as { data?: { error?: { message?: string } } })?.data?.error?.message;
        toast({ title: 'Не удалось запустить генерацию', description: message, variant: 'destructive' });
      }
    },
    [timeline, currentScene, ops, sceneIndex, id, updateProject, generateScene, selectedLayer],
  );

  // --- клавиатура ---
  // Горячие клавиши редактора. Ловим на окне, потому что фокус чаще всего на холсте Konva,
  // а он обычный canvas и о клавишах ничего не знает.
  useEffect(() => {
    const isTyping = (target: EventTarget | null) => {
      const node = target as HTMLElement | null;
      if (!node) return false;
      const tag = node.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || node.isContentEditable;
    };

    const onKeyDown = (event: KeyboardEvent) => {
      // Пока человек пишет титр или название, клавиши принадлежат полю, а не редактору.
      if (isTyping(event.target)) return;
      const mod = event.ctrlKey || event.metaKey;

      if (mod && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        redo();
        return;
      }
      if (mod && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        if (!selectedLayerId) return;
        const copyId = ops.duplicateLayer(sceneIndex, selectedLayerId);
        if (copyId) setSelectedLayerId(copyId);
        else toast({ title: 'В сцене слишком много слоёв', variant: 'destructive' });
        return;
      }
      if (event.key === 'Escape') {
        setSelectedLayerId(null);
        return;
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedLayerId) {
        event.preventDefault();
        ops.removeLayer(sceneIndex, selectedLayerId);
        setSelectedLayerId(null);
        return;
      }

      const step = event.shiftKey ? 0.05 : 0.005;
      const nudge: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      };
      const delta = nudge[event.key];
      if (delta && selectedLayerId) {
        event.preventDefault();
        ops.nudgeLayer(sceneIndex, selectedLayerId, delta[0], delta[1]);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [ops, sceneIndex, selectedLayerId, undo, redo]);

  // --- экспорт ---
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
    if (saveTimer.current) clearTimeout(saveTimer.current);
    try {
      await updateProject({ id, title, timeline }).unwrap();
      const result = await exportProject(id).unwrap();
      setExportId(result.projectId);
      setSaveState('saved');
      toast({
        title: result.alreadyRunning ? 'Сборка уже идёт' : 'Собираем ролик',
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

  const musicOptions = musicData?.assets ?? [];

  return (
    <div className="mx-auto w-full max-w-[1700px] px-3 py-4 lg:px-6">
      <header className="mb-4 flex flex-wrap items-center gap-3">
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
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={undo}
              disabled={historyDepth.past === 0}
              title="Отменить (Ctrl+Z)"
              aria-label="Отменить"
              className="grid h-9 w-9 place-items-center rounded-lg border border-slate-700 text-slate-300 transition hover:border-slate-500 hover:text-white disabled:opacity-35 disabled:hover:border-slate-700"
            >
              <Undo2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={redo}
              disabled={historyDepth.future === 0}
              title="Вернуть (Ctrl+Shift+Z)"
              aria-label="Вернуть"
              className="grid h-9 w-9 place-items-center rounded-lg border border-slate-700 text-slate-300 transition hover:border-slate-500 hover:text-white disabled:opacity-35 disabled:hover:border-slate-700"
            >
              <Redo2 className="h-4 w-4" />
            </button>
          </div>
          <span className="hidden font-mono text-xs text-slate-500 sm:inline">{formatTimelineDuration(duration)}</span>
          <Button type="button" onClick={handleExport} disabled={exporting || exportRunning}>
            {exporting || exportRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Film className="h-4 w-4" />}
            {exportRunning ? 'Собираем…' : 'Собрать ролик'}
          </Button>
        </div>
      </header>

      {issues.length > 0 && (
        <Alert variant="destructive" className="mb-4">
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
        <Alert className="mb-4 border-emerald-500/40 bg-emerald-500/10">
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

      <div className="grid gap-4 lg:grid-cols-[76px,minmax(0,1fr),340px]">
        {/* Лента инструментов. На узком экране становится горизонтальной строкой. */}
        <nav className="flex gap-2 overflow-x-auto lg:flex-col lg:overflow-visible">
          {TOOLS.map((item) => (
            <button
              key={item.code}
              type="button"
              onClick={() => setTool(item.code)}
              className={cn(
                'flex shrink-0 flex-col items-center gap-1 rounded-xl border px-3 py-2.5 text-[11px] font-medium transition lg:w-full',
                tool === item.code
                  ? 'border-amber-400 bg-amber-400/10 text-amber-200'
                  : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700 hover:text-slate-200',
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="min-w-0 space-y-4">
          <EditorStage
            timeline={timeline}
            selectedSceneIndex={sceneIndex}
            onSelectScene={setSceneIndex}
            selectedLayerId={selectedLayerId}
            onSelectLayer={setSelectedLayerId}
            onChangeLayer={(index, layerId, patch) => ops.changeLayer(index, layerId, patch)}
          />

          {/* Про горячие клавиши на холсте догадаться нельзя — подсказываем строкой. */}
          <p className="hidden text-[11px] text-slate-600 lg:block">
            Ctrl+Z — отменить · Ctrl+D — дублировать слой · Delete — удалить · стрелки — сдвинуть
            (с Shift — крупнее) · Esc — снять выделение
          </p>

          <ToolBar
            tool={tool}
            uploading={uploading}
            musicOptions={musicOptions}
            timeline={timeline}
            balance={me?.user?.tokenBalance ?? 0}
            generating={generating || generationRunning}
            scene={currentScene}
            selectedLayer={selectedLayer?.kind === 'media' ? selectedLayer : null}
            voiceoverRunning={Boolean(voiceoverRunning)}
            priceOverrides={chatPricing?.modelPriceOverrides}
            onPickFile={() => pickFileFor(null)}
            onAddColor={() => {
              const layerId = ops.addMediaLayer(sceneIndex, { kind: 'color', color: '#0b1020' });
              if (layerId) setSelectedLayerId(layerId);
            }}
            onAddText={() => setSelectedLayerId(ops.addTextLayer(sceneIndex))}
            onCollage={(layout) => ops.applyCollage(sceneIndex, layout)}
            onMusicChange={(url) =>
              applyTimeline({
                ...timeline,
                music: url
                  ? {
                      url,
                      volume: timeline.music?.volume ?? 0.7,
                      fadeInSec: 1.5,
                      fadeOutSec: 2.5,
                      loop: true,
                      startAtSec: 0,
                    }
                  : undefined,
              })
            }
            onMusicVolume={(volume) =>
              timeline.music && applyTimeline({ ...timeline, music: { ...timeline.music, volume } })
            }
            onPickVoiceFile={() => voiceFileRef.current?.click()}
            onVoiceoverVolume={(volume) =>
              timeline.voiceover && applyTimeline({ ...timeline, voiceover: { ...timeline.voiceover, volume } })
            }
            onVoiceoverRemove={() => setVoiceover(null)}
            onGenerateVoiceover={handleGenerateVoiceover}
            onGenerate={handleGenerate}
          />

          <SceneStrip
            timeline={timeline}
            selectedIndex={sceneIndex}
            onSelect={setSceneIndex}
            onMove={moveScene}
            onDuplicate={duplicateScene}
            onRemove={removeScene}
            onAdd={addScene}
          />
        </div>

        <aside className="space-y-4">
          {currentScene && (
            <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-100">Слои сцены</h3>
                <span className="text-[11px] text-slate-500">
                  {layers.length} из {TIMELINE_LIMITS.maxLayersPerScene}
                </span>
              </div>
              <LayerPanel
                scene={currentScene}
                selectedLayerId={selectedLayerId}
                onSelect={setSelectedLayerId}
                onMove={(layerId, direction) => ops.moveLayer(sceneIndex, layerId, direction)}
                onDuplicate={(layerId) => {
                  const copyId = ops.duplicateLayer(sceneIndex, layerId);
                  if (copyId) setSelectedLayerId(copyId);
                  else toast({ title: 'В сцене слишком много слоёв', variant: 'destructive' });
                }}
                onRemove={(layerId) => {
                  ops.removeLayer(sceneIndex, layerId);
                  if (layerId === selectedLayerId) setSelectedLayerId(null);
                }}
                onChange={(layerId, patch) => ops.changeLayer(sceneIndex, layerId, patch)}
              />
            </section>
          )}

          <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
            {selectedLayer ? (
              <>
                <h3 className="mb-3 text-sm font-semibold text-slate-100">Настройки слоя</h3>
                <LayerInspector
                  layer={selectedLayer}
                  uploading={uploading}
                  onChange={(patch: LayerPatch) => ops.changeLayer(sceneIndex, selectedLayer.id, patch)}
                  onReplaceFile={() => pickFileFor(selectedLayer.id)}
                />
              </>
            ) : (
              currentScene && (
                <SceneSettings
                  scene={currentScene}
                  isLast={sceneIndex >= timeline.scenes.length - 1}
                  aspect={timeline.aspect}
                  onSceneChange={(patch) => ops.patchScene(sceneIndex, patch)}
                  onAspectChange={(aspect) => applyTimeline({ ...timeline, aspect })}
                />
              )
            )}
          </section>
        </aside>
      </div>

      <input
        ref={voiceFileRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleVoiceUpload(file);
          event.target.value = '';
        }}
      />
      <input
        ref={addFileRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleUpload(file);
          event.target.value = '';
        }}
      />
    </div>
  );
}

function ToolBar({
  tool,
  uploading,
  musicOptions,
  timeline,
  balance,
  generating,
  scene,
  selectedLayer,
  voiceoverRunning,
  priceOverrides,
  onPickFile,
  onAddColor,
  onAddText,
  onCollage,
  onMusicChange,
  onMusicVolume,
  onPickVoiceFile,
  onVoiceoverVolume,
  onVoiceoverRemove,
  onGenerateVoiceover,
  onGenerate,
}: {
  tool: ToolCode;
  uploading: boolean;
  musicOptions: Array<{ id: string; title: string; publicUrl: string }>;
  timeline: Timeline;
  balance: number;
  generating: boolean;
  scene?: TimelineScene;
  selectedLayer: MediaLayer | null;
  voiceoverRunning: boolean;
  priceOverrides?: Record<string, number>;
  onPickFile: () => void;
  onAddColor: () => void;
  onAddText: () => void;
  onCollage: (layout: CollageLayout) => void;
  onMusicChange: (url: string) => void;
  onMusicVolume: (volume: number) => void;
  onPickVoiceFile: () => void;
  onVoiceoverVolume: (volume: number) => void;
  onVoiceoverRemove: () => void;
  onGenerateVoiceover: (request: VoiceoverRequest) => void;
  onGenerate: (request: SceneGenerationRequest) => void;
}) {
  if (tool === 'media') {
    return (
      <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/60 p-3">
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onPickFile} disabled={uploading}>
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Добавить фото или видео
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onAddColor}>
            Добавить заливку
          </Button>
        </div>
        <div>
          <Label className="text-xs">Разложить коллажем</Label>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {(Object.keys(COLLAGE_LAYOUT_TITLES) as CollageLayout[]).map((layout) => (
              <button
                key={layout}
                type="button"
                onClick={() => onCollage(layout)}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300 transition hover:border-amber-400/60 hover:text-amber-200"
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                {COLLAGE_LAYOUT_TITLES[layout]}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-slate-500">
            Расставит кадры сцены по сетке. Слои, которым не хватило места, останутся как были.
          </p>
        </div>
      </div>
    );
  }

  if (tool === 'text') {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
        <Button type="button" variant="outline" size="sm" onClick={onAddText}>
          <Type className="h-4 w-4" />
          Добавить титр
        </Button>
        <p className="mt-2 text-xs text-slate-500">
          Титр появится поверх сцены — его можно двигать и растягивать прямо на холсте.
        </p>
      </div>
    );
  }

  if (tool === 'audio') {
    return (
      <AudioTools
        timeline={timeline}
        musicOptions={musicOptions}
        balance={balance}
        uploading={uploading}
        voiceoverRunning={voiceoverRunning}
        priceOverrides={priceOverrides}
        onMusicChange={onMusicChange}
        onMusicVolume={onMusicVolume}
        onPickVoiceFile={onPickVoiceFile}
        onVoiceoverVolume={onVoiceoverVolume}
        onVoiceoverRemove={onVoiceoverRemove}
        onGenerateVoiceover={onGenerateVoiceover}
      />
    );
  }

  return scene ? (
    <SceneGenerator
      scene={scene}
      aspect={timeline.aspect}
      balance={balance}
      running={generating}
      selectedLayer={selectedLayer}
      onGenerate={onGenerate}
    />
  ) : null;
}

function SceneSettings({
  scene,
  isLast,
  aspect,
  onSceneChange,
  onAspectChange,
}: {
  scene: TimelineScene;
  isLast: boolean;
  aspect: TimelineAspect;
  onSceneChange: (patch: Partial<TimelineScene>) => void;
  onAspectChange: (aspect: TimelineAspect) => void;
}) {
  const transitions: Array<{ code: TimelineScene['transition']; label: string }> = [
    { code: 'cut', label: 'Встык' },
    { code: 'dissolve', label: 'Растворение' },
    { code: 'fade-black', label: 'Через чёрный' },
    { code: 'slide', label: 'Сдвиг' },
  ];

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-slate-100">Сцена и ролик</h3>

      <label className="block text-xs text-slate-400">
        Длительность сцены, сек
        <Input
          type="number"
          min={TIMELINE_LIMITS.minSceneDurationSec}
          max={TIMELINE_LIMITS.maxSceneDurationSec}
          step={0.5}
          value={scene.durationSec ?? 4}
          onChange={(event) => onSceneChange({ durationSec: Number(event.target.value) })}
          className="mt-1 h-9"
        />
      </label>

      {!isLast && (
        <div className="space-y-1.5">
          <Label className="text-xs">Переход к следующей</Label>
          <div className="flex flex-wrap gap-1.5">
            {transitions.map((item) => (
              <button
                key={item.code}
                type="button"
                onClick={() => onSceneChange({ transition: item.code })}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs transition',
                  scene.transition === item.code
                    ? 'border-amber-400 bg-amber-400/15 text-amber-200'
                    : 'border-slate-700 text-slate-300 hover:border-slate-500',
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <Label className="text-xs">Формат кадра</Label>
        <div className="flex flex-wrap gap-1.5">
          {TIMELINE_ASPECTS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => onAspectChange(item)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs transition',
                aspect === item
                  ? 'border-amber-400 bg-amber-400/15 text-amber-200'
                  : 'border-slate-700 text-slate-300 hover:border-slate-500',
              )}
            >
              {ASPECT_LABELS[item]}
            </button>
          ))}
        </div>
      </div>

      <label className="block text-xs text-slate-400">
        Цвет подложки
        <input
          type="color"
          value={scene.background ?? '#000000'}
          onChange={(event) => onSceneChange({ background: event.target.value })}
          className="mt-1 h-9 w-full cursor-pointer rounded border border-slate-700 bg-transparent"
        />
      </label>

      <p className="text-xs text-slate-500">Выделите слой на холсте, чтобы настроить его отдельно.</p>
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
