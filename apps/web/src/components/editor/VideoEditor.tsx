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
  Images,
  Music,
  Redo2,
  RotateCcw,
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
  sceneAtTime,
  sceneLayers,
  sceneMediaLayers,
  timelineAudioTracks,
  timelineDurationSec,
  timelineWithAudioTracks,
  validateTimeline,
  type CollageLayout,
  type MediaLayer,
  type SceneLayer,
  type Timeline,
  type TimelineAspect,
  type TimelineHistory,
  type TimelineNamedAudioTrack,
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
import { TimelineTracks } from '@/components/editor/TimelineTracks';
import { AudioTools, type VoiceRecording, type VoiceoverRequest } from '@/components/editor/AudioTools';
import { GenerationLibrary } from '@/components/editor/GenerationLibrary';
import type { EditorCatalogService } from '@/store/api/editor-catalog-api';
import { ExportOverlay } from '@/components/editor/ExportOverlay';
import { newScene, uid, useEditorOperations, type LayerPatch } from '@/components/editor/useEditorTimeline';
import { usePlayback } from '@/components/editor/usePlayback';
import { useGetProjectStatusQuery } from '@/store/api/projects-api';
import { useGetPublicMediaAssetsQuery } from '@/store/api/public-api';
import {
  useExportVideoProjectMutation,
  useGenerateSceneMutation,
  useGenerateSceneServiceMutation,
  useGenerateVoiceoverMutation,
  useGetVideoProjectQuery,
  useListVoiceoversQuery,
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
  { code: 'library', label: 'Мои', icon: Images },
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
  const { data, isLoading, isError, error, refetch: refetchProject } = useGetVideoProjectQuery(id);
  const [updateProject] = useUpdateVideoProjectMutation();
  const [uploadMedia, { isLoading: uploading }] = useUploadEditorMediaMutation();
  const [exportProject, { isLoading: exporting }] = useExportVideoProjectMutation();
  const [generateScene, { isLoading: generating }] = useGenerateSceneMutation();
  const [generateSceneService] = useGenerateSceneServiceMutation();
  const [runningServiceSlug, setRunningServiceSlug] = useState<string | null>(null);
  const [generateVoiceover, { isLoading: generatingVoiceover }] = useGenerateVoiceoverMutation();
  const { data: me } = useGetMeQuery();
  const { data: musicData } = useGetPublicMediaAssetsQuery({ kind: 'background-music', active: true });
  // Оверрайды цен общие с чатом: показывать цену ниже той, что спишет сервер, нельзя.
  const { data: chatPricing } = useGetChatModelsQuery();
  const voiceoverList = useListVoiceoversQuery(id);

  const [timeline, setTimeline] = useState<Timeline | null>(null);
  const [title, setTitle] = useState('');
  const [sceneIndex, setSceneIndex] = useState(0);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [tool, setTool] = useState<ToolCode>('media');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [exportId, setExportId] = useState<string | null>(null);
  const [showExportScreen, setShowExportScreen] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedRef = useRef(false);
  const uploadTargetRef = useRef<{ sceneIndex: number; layerId: string | null } | null>(null);
  const addFileRef = useRef<HTMLInputElement | null>(null);
  const voiceFileRef = useRef<HTMLInputElement | null>(null);
  const timelineRef = useRef<Timeline | null>(null);
  // Буфер обмена слоями живёт в ref: он переживает переход между сценами и не должен
  // перерисовывать редактор при копировании.
  const clipboardRef = useRef<SceneLayer | null>(null);
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

  /** Загружает файл-референс для генерации и отдаёт публичную ссылку. */
  const uploadReference = useCallback(
    async (file: File) => {
      try {
        const uploaded = await uploadMedia({ id, file }).unwrap();
        return uploaded.url;
      } catch {
        toast({ title: 'Не удалось загрузить референс', variant: 'destructive' });
        return null;
      }
    },
    [id, uploadMedia],
  );

  // --- звуковые дорожки ---
  /** Добавляет дорожку в конец списка. Новая запись не заменяет прежнюю, а встаёт рядом. */
  const addAudioTrack = useCallback(
    (kind: 'music' | 'voice', url: string, title?: string) => {
      const current = timelineRef.current;
      if (!current) return;
      const base = timelineWithAudioTracks(current);
      const tracks = base.audio ?? [];
      if (tracks.length >= TIMELINE_LIMITS.maxAudioTracks) {
        toast({ title: 'Больше дорожек не поместится', variant: 'destructive' });
        return;
      }
      applyTimeline({
        ...base,
        audio: [
          ...tracks,
          {
            id: uid(kind),
            kind,
            title,
            url,
            volume: kind === 'voice' ? 1 : 0.7,
            fadeInSec: kind === 'voice' ? 0.2 : 1,
            fadeOutSec: kind === 'voice' ? 0.4 : 1.5,
            // Голос не зацикливаем: реплика короче ролика должна прозвучать один раз.
            loop: kind === 'music',
            startAtSec: 0,
            trimStartSec: 0,
          },
        ],
      });
    },
    [applyTimeline],
  );

  const changeAudioTrack = useCallback(
    (trackId: string, patch: Partial<TimelineNamedAudioTrack>) => {
      const current = timelineRef.current;
      if (!current) return;
      const base = timelineWithAudioTracks(current);
      applyTimeline({
        ...base,
        audio: (base.audio ?? []).map((track) => (track.id === trackId ? { ...track, ...patch } : track)),
      });
    },
    [applyTimeline],
  );

  const removeAudioTrack = useCallback(
    (trackId: string) => {
      const current = timelineRef.current;
      if (!current) return;
      const base = timelineWithAudioTracks(current);
      applyTimeline({ ...base, audio: (base.audio ?? []).filter((track) => track.id !== trackId) });
    },
    [applyTimeline],
  );

  const setVoiceover = useCallback(
    (url: string | null) => {
      if (!url) return;
      addAudioTrack('voice', url, 'Озвучка');
    },
    [addAudioTrack],
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
  const pendingLayer = currentScene
    ? sceneMediaLayers(currentScene).find((layer) => Boolean(layer.generationProjectId)) ?? null
    : null;
  const runningGenerationId = pendingLayer?.generationProjectId ?? null;

  const { data: sceneStatus } = useGetProjectStatusQuery(runningGenerationId ?? '', {
    skip: !runningGenerationId,
    pollingInterval: runningGenerationId ? 3000 : 0,
  });
  const generationRunning = sceneStatus?.status === 'PENDING' || sceneStatus?.status === 'PROCESSING';

  const appliedGenerationRef = useRef<string | null>(null);
  useEffect(() => {
    if (!runningGenerationId || sceneStatus?.status !== 'FAILED') return;
    if (appliedGenerationRef.current === runningGenerationId) return;
    appliedGenerationRef.current = runningGenerationId;
    // Метку снимаем: иначе слой ждёт результат, которого не будет, а поллинг не кончается.
    if (pendingLayer) ops.changeLayer(sceneIndex, pendingLayer.id, { generationProjectId: undefined });
    toast({
      title: 'Генерация не получилась',
      description: 'Коины вернулись на баланс — попробуйте другой кадр или описание.',
      variant: 'destructive',
    });
  }, [runningGenerationId, sceneStatus?.status, pendingLayer, ops, sceneIndex]);

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
        if (!url || (kind !== 'image' && kind !== 'video')) {
          // Воркер не нашёл, куда положить кадр. Берём его копию ролика целиком: иначе
          // наше следующее автосохранение затрёт результат, за который уже заплачено.
          applyWithoutHistory(fresh.project.timeline);
          toast({ title: 'Кадр готов', description: 'Ролик обновлён с сервера.' });
          return;
        }

        const current = timelineRef.current;
        if (!current) return;
        const applied = applyGeneratedSource(current, runningGenerationId, { kind, url });
        // Сцена подстраивается под длину клипа: иначе короткое видео дотягивается замершим
        // кадром, и переход происходит по застывшей картинке.
        if (applied.changed && kind === 'video') {
          const measured = await probeUrlDurationSec(mediaUrl(url) ?? url);
          if (measured) {
            applied.timeline = {
              ...applied.timeline,
              scenes: applied.timeline.scenes.map((scene) =>
                sceneMediaLayers(scene).some((layer) => layer.source.url === url)
                  ? { ...scene, durationSec: Number(measured.toFixed(2)) }
                  : scene,
              ),
            };
          }
        }
        // Сохраняем сразу: подстановка снимает метку со слоя, и обе копии ролика должны
        // сойтись. Иначе сервер продолжит считать, что слой ждёт генерацию.
        if (applied.changed) applyWithoutHistory(applied.timeline);
        toast({ title: 'Кадр готов' });
      } catch {
        toast({ title: 'Генерация готова', description: 'Обновите страницу, если кадр не появился.' });
      }
    })();
  }, [runningGenerationId, sceneStatus?.status, refetchProject, applyWithoutHistory]);

  /** Что показать поверх кадра, пока идёт генерация: рамка с процентом вместо пустого слоя. */
  const generationOverlay = pendingLayer && runningGenerationId
    ? {
      layerId: pendingLayer.id,
      progress: sceneStatus?.progress ?? 0,
      label: sceneStatus?.status === 'PENDING' ? 'В очереди' : 'Генерируем',
    }
    : null;

  const handleRunService = useCallback(
    async (service: { slug: string; title: string }) => {
      const scene = currentScene;
      if (!timeline || !scene) return;
      const frame = sceneMediaLayers(scene).find((layer) => layer.source.kind === 'image' || layer.source.kind === 'video');

      // Результат должен вернуться в кадр, поэтому слой для него заводим заранее: если его
      // не назвать, воркеру некуда будет положить готовое.
      const layerId = selectedLayer?.kind === 'media'
        ? selectedLayer.id
        : ops.addMediaLayer(sceneIndex, { kind: 'color', color: '#0b1020' });
      if (!layerId) {
        toast({ title: 'В сцене слишком много слоёв', variant: 'destructive' });
        return;
      }

      setRunningServiceSlug(service.slug);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      try {
        if (timelineRef.current) await updateProject({ id, timeline: timelineRef.current }).unwrap();
        const result = await generateSceneService({
          id,
          sceneId: scene.id,
          body: { serviceSlug: service.slug, layerId, frameUrl: frame?.source.url },
        }).unwrap();
        ops.changeLayer(sceneIndex, layerId, { generationProjectId: result.projectId });
        toast({ title: `Запустили «${service.title}»`, description: `Списано ${result.tokensCost} коинов` });
      } catch (error) {
        setRunningServiceSlug(null);
        const message = (error as { data?: { error?: { message?: string } } })?.data?.error?.message;
        toast({ title: 'Не удалось запустить услугу', description: message, variant: 'destructive' });
      }
    },
    [currentScene, timeline, selectedLayer, ops, sceneIndex, id, updateProject, generateSceneService],
  );

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
            ...(request.params ? { params: request.params } : {}),
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
      // Сравниваем ФИЗИЧЕСКУЮ клавишу, а не символ: в русской раскладке Ctrl+Z даёт «я»,
      // Ctrl+D — «в», и по event.key ни одно сочетание не срабатывало.
      const code = event.code;

      if (mod && code === 'KeyZ') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && code === 'KeyY') {
        event.preventDefault();
        redo();
        return;
      }
      if (mod && code === 'KeyD') {
        event.preventDefault();
        if (!selectedLayerId) return;
        const copyId = ops.duplicateLayer(sceneIndex, selectedLayerId);
        if (copyId) setSelectedLayerId(copyId);
        else toast({ title: 'В сцене слишком много слоёв', variant: 'destructive' });
        return;
      }
      if (mod && code === 'KeyC') {
        if (!selectedLayer) return;
        event.preventDefault();
        clipboardRef.current = selectedLayer;
        toast({ title: 'Слой скопирован' });
        return;
      }
      if (mod && code === 'KeyV') {
        if (!clipboardRef.current) return;
        event.preventDefault();
        const pastedId = ops.pasteLayer(sceneIndex, clipboardRef.current);
        if (pastedId) setSelectedLayerId(pastedId);
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
  }, [ops, sceneIndex, selectedLayerId, selectedLayer, undo, redo]);

  // --- экспорт ---
  const { data: exportStatus } = useGetProjectStatusQuery(exportId ?? '', {
    skip: !exportId,
    pollingInterval: exportId ? 3000 : 0,
  });
  const exportRunning = exportStatus?.status === 'PENDING' || exportStatus?.status === 'PROCESSING';
  const exportUrl = exportStatus?.status === 'COMPLETED' ? mediaUrl(exportStatus.resultVideo) : null;

  const issues = useMemo(() => (timeline ? validateTimeline(timeline) : []), [timeline]);
  const duration = useMemo(() => (timeline ? timelineDurationSec(timeline) : 0), [timeline]);
  // Часы общие для предпросмотра и таймлайна: курсор должен стоять на том кадре,
  // который сейчас на экране.
  const playback = usePlayback(duration);


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
      setShowExportScreen(true);
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
    // 404 — ролика правда нет. Всё остальное (сервер перезапускается, связь пропала) —
    // временно, и говорить в таком случае «возможно, он удалён» значит пугать зря.
    const missing = (error as { status?: number } | undefined)?.status === 404;
    return (
      <div className="container py-10">
        <Alert variant="destructive" className="max-w-2xl">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{missing ? 'Ролик не найден' : 'Не удалось открыть ролик'}</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            <span>
              {missing
                ? 'Возможно, он был удалён.'
                : 'Похоже, связь с сервером пропала — ролик цел, попробуйте ещё раз.'}
            </span>
            {!missing && (
              <Button type="button" variant="outline" size="sm" onClick={() => void refetchProject()}>
                <RotateCcw className="h-4 w-4" />
                Повторить
              </Button>
            )}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const musicOptions = musicData?.assets ?? [];

  // Записи голоса: то, что стоит на дорожках, плюс синтез, снятый с них. Загруженные файлы
  // и записи с микрофона проектов не создают, поэтому берём их из самих дорожек.
  const voiceTracks = timeline ? timelineAudioTracks(timeline).filter((track) => track.kind === 'voice') : [];
  const onTimelineUrls = new Set(voiceTracks.map((track) => track.url));
  const voiceRecordings: VoiceRecording[] = [
    ...voiceTracks.map((track) => ({
      id: track.id,
      url: track.url,
      title: track.title ?? 'Запись',
      onTimeline: true,
    })),
    ...(voiceoverList.data?.items ?? [])
      .filter((item) => item.url && !onTimelineUrls.has(item.url))
      .map((item) => ({
        id: item.id,
        url: item.url as string,
        title: item.text ? item.text.slice(0, 40) : 'Озвучка',
        onTimeline: false,
        status: item.status,
        progress: item.progress,
      })),
  ];

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col overflow-hidden md:h-dvh">
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-slate-800 px-3 py-2 lg:px-4">
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
            {exportRunning ? 'Собираем…' : 'Собрать ролик за 2 коина'}
          </Button>
        </div>
      </header>

      {(exportRunning || generationOverlay) && (
        <div className="shrink-0 space-y-1.5 border-b border-slate-800 bg-slate-900/60 px-3 py-2 lg:px-4">
          {generationOverlay && (
            <ProgressLine
              label={`${generationOverlay.label} кадр — сцена ${sceneIndex + 1}`}
              percent={generationOverlay.progress}
              tone="violet"
            />
          )}
          {exportRunning && (
            <ProgressLine
              label="Собираем ролик — файл появится здесь же, можно не ждать на странице"
              percent={exportStatus?.progress ?? 0}
              tone="amber"
            />
          )}
        </div>
      )}

      {issues.length > 0 && (
        <Alert variant="destructive" className="mx-3 mt-2 shrink-0 lg:mx-4">
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
        <Alert className="mx-3 mt-2 shrink-0 border-emerald-500/40 bg-emerald-500/10 lg:mx-4">
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

      {showExportScreen ? (
        <ExportOverlay
          projectId={id}
          running={Boolean(exportRunning)}
          progress={exportStatus?.progress ?? 0}
          resultUrl={exportUrl}
          onBackToEditor={() => setShowExportScreen(false)}
        />
      ) : (
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Лента инструментов. На узком экране становится горизонтальной строкой. */}
        <nav className="flex shrink-0 gap-2 overflow-x-auto border-b border-slate-800 p-2 lg:w-[76px] lg:flex-col lg:overflow-visible lg:border-b-0 lg:border-r">
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

        {/*
         * Панель инструмента стоит сбоку, а не под холстом. Раньше она вклинивалась между
         * кадром и лентой сцен, и рабочая область уезжала на два экрана вниз.
         */}
        {/*
          * Нижний отступ колонки убран для вкладки ИИ: её форма прилипает к низу, а padding
          * скролл-контейнера поднимал бы её над краем — та самая щель под кнопкой.
          */}
        <section
          className={cn(
            'shrink-0 overflow-y-auto border-b border-slate-800 px-3 pt-3 lg:w-[330px] lg:border-b-0 lg:border-r',
            tool === 'ai' ? 'pb-0' : 'pb-3',
          )}
        >
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
            onAddMusic={(url, title) => addAudioTrack('music', url, title)}
            recordings={voiceRecordings}
            onAddVoiceTrack={(url, title) => addAudioTrack('voice', url, title)}
            onRemoveVoiceTrack={(url) => {
              const track = voiceTracks.find((item) => item.url === url);
              if (track) removeAudioTrack(track.id);
            }}
            onPickVoiceFile={() => voiceFileRef.current?.click()}
            onRecordVoice={(file) => void handleVoiceUpload(file)}
            onGenerateVoiceover={handleGenerateVoiceover}
            onGenerate={handleGenerate}
            onRunService={handleRunService}
            runningServiceSlug={runningServiceSlug}
            serviceProgress={sceneStatus?.progress ?? 0}
            onUploadReference={uploadReference}
            onInsertGeneration={(url, kind) => {
              const layerId = ops.addMediaLayer(sceneIndex, { kind, url });
              if (!layerId) {
                toast({ title: 'В сцене слишком много слоёв', variant: 'destructive' });
                return;
              }
              setSelectedLayerId(layerId);
              // Длину сцены подгоняем под клип: короткое видео иначе дотянется замершим кадром.
              if (kind === 'video') {
                void probeUrlDurationSec(mediaUrl(url) ?? url).then((measured) => {
                  if (measured) ops.patchScene(sceneIndex, { durationSec: Number(measured.toFixed(2)) });
                });
              }
            }}
          />
        </section>

        <main className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 p-3">
          <EditorStage
            className="min-h-0 flex-1"
            generationOverlay={generationOverlay}
            playback={playback}
            timeline={timeline}
            selectedSceneIndex={sceneIndex}
            onSelectScene={setSceneIndex}
            selectedLayerId={selectedLayerId}
            onSelectLayer={setSelectedLayerId}
            onChangeLayer={(index, layerId, patch) => ops.changeLayer(index, layerId, patch)}
          />

          {/* Про горячие клавиши на холсте догадаться нельзя — подсказываем строкой. */}
          <p className="hidden shrink-0 text-[11px] text-slate-600 xl:block">
            Ctrl+Z — отменить · Ctrl+C/Ctrl+V — копировать слой · Ctrl+D — дублировать · Delete — удалить ·
            стрелки — сдвинуть (с Shift — крупнее) · Esc — снять выделение
          </p>
        </main>

        <aside className="shrink-0 space-y-3 overflow-y-auto border-t border-slate-800 p-3 lg:w-[330px] lg:border-l lg:border-t-0">
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


      )}

      {/*
       * Нижняя панель — то, что тянется во времени: сцены и звук. Здесь видно, где именно
       * звучит реплика, и её можно подвинуть, а не гадать по числу в настройках.
       */}
      {!showExportScreen && (
      <footer className="shrink-0 space-y-2 border-t border-slate-800 bg-slate-950/80 px-3 py-2 lg:px-4">
        <TimelineTracks
          timeline={timeline}
          totalSec={duration}
          time={playback.time}
          onSeek={(sec) => {
            playback.seek(sec);
            const at = sceneAtTime(timeline, sec);
            if (at) setSceneIndex(at.activeIndex);
          }}
          selectedSceneIndex={sceneIndex}
          onSelectScene={setSceneIndex}
          onSceneDuration={(index, durationSec) => ops.patchScene(index, { durationSec })}
          onSceneTransition={(index, transition) => ops.patchScene(index, { transition })}
          onDuplicateScene={duplicateScene}
          onRemoveScene={removeScene}
          onAddScene={addScene}
          onChangeTrack={changeAudioTrack}
          onRemoveTrack={removeAudioTrack}
        />
      </footer>
      )}

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
  onAddMusic,
  recordings,
  onAddVoiceTrack,
  onRemoveVoiceTrack,
  onPickVoiceFile,
  onRecordVoice,
  onGenerateVoiceover,
  onGenerate,
  onRunService,
  runningServiceSlug,
  serviceProgress,
  onUploadReference,
  onInsertGeneration,
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
  onAddMusic: (url: string, title: string) => void;
  recordings: VoiceRecording[];
  onAddVoiceTrack: (url: string, title: string) => void;
  onRemoveVoiceTrack: (url: string) => void;
  onPickVoiceFile: () => void;
  onRecordVoice: (file: File) => void;
  onGenerateVoiceover: (request: VoiceoverRequest) => void;
  onUploadReference: (file: File) => Promise<string | null>;
  onInsertGeneration: (url: string, kind: 'image' | 'video') => void;
  onGenerate: (request: SceneGenerationRequest) => void;
  onRunService: (service: EditorCatalogService) => void;
  runningServiceSlug: string | null;
  serviceProgress: number;
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
        onAddMusic={onAddMusic}
        recordings={recordings}
        onAddVoiceTrack={onAddVoiceTrack}
        onRemoveVoiceTrack={onRemoveVoiceTrack}
        onPickVoiceFile={onPickVoiceFile}
        onRecordVoice={onRecordVoice}
        onGenerateVoiceover={onGenerateVoiceover}
      />
    );
  }

  if (tool === 'library') {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
        <GenerationLibrary onInsert={onInsertGeneration} />
      </div>
    );
  }

  return scene ? (
    <SceneGenerator
      scene={scene}
      aspect={timeline.aspect}
      balance={balance}
      running={generating}
      selectedLayer={selectedLayer}
      onUploadReference={onUploadReference}
      onGenerate={onGenerate}
      onRunService={onRunService}
      runningServiceSlug={runningServiceSlug}
      serviceProgress={serviceProgress}
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
/**
 * Длительность видео по ссылке.
 *
 * Нужна, когда кадр приехал из генерации: сцена сохраняет прежнюю длину, и если клип
 * короче, ffmpeg дотягивает сцену последним кадром — видео «застывает» и переход идёт уже
 * по замершей картинке. Ровно на это и жаловались.
 */
function probeUrlDurationSec(url: string): Promise<number | undefined> {
  return new Promise((resolve) => {
    const element = document.createElement('video');
    element.preload = 'metadata';
    element.onloadedmetadata = () => resolve(Number.isFinite(element.duration) ? element.duration : undefined);
    element.onerror = () => resolve(undefined);
    element.src = url;
  });
}

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

/**
 * Полоса прогресса для длинной операции.
 *
 * Раньше и генерация, и сборка шли молча: кнопка меняла подпись, а понять, началось ли
 * что-нибудь и где искать результат, было нельзя.
 */
function ProgressLine({
  label,
  percent,
  tone,
}: {
  label: string;
  percent: number;
  tone: 'violet' | 'amber';
}) {
  const value = Math.max(2, Math.min(100, Math.round(percent)));
  return (
    <div className="flex items-center gap-3">
      <Loader2 className={cn('h-3.5 w-3.5 shrink-0 animate-spin', tone === 'violet' ? 'text-violet-300' : 'text-amber-300')} />
      <span className="min-w-0 flex-1 truncate text-xs text-slate-300">{label}</span>
      <div className="h-1.5 w-40 shrink-0 overflow-hidden rounded-full bg-slate-800">
        <div
          className={cn('h-full rounded-full transition-all', tone === 'violet' ? 'bg-violet-400' : 'bg-amber-400')}
          style={{ width: `${value}%` }}
        />
      </div>
      <span className="w-10 shrink-0 text-right font-mono text-[11px] text-slate-400">{value}%</span>
    </div>
  );
}
