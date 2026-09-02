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
  RotateCcw,
  Sparkles,
  Type,
  SlidersHorizontal,
  Undo2,
} from 'lucide-react';
import {
  COLLAGE_LAYOUT_TITLES,
  TIMELINE_ASPECTS,
  TIMELINE_LIMITS,
  applyGeneratedSource,
  clipEndSec,
  estimateChatGenerationPriceCoins,
  markLayerGeneration,
  sortedClips,
  collageBoxes,
  createTimelineHistory,
  formatTimelineDuration,
  layerSpeed,
  pushTimelineHistory,
  redoTimeline,
  sceneAtTime,
  sceneMediaLayers,
  timelineAudioTracks,
  timelineDurationSec,
  timelineScenes,
  timelineWithAudioTracks,
  undoTimeline,
  validateTimeline,
  type CollageLayout,
  type MediaLayer,
  type SceneLayer,
  type Timeline,
  type TimelineAspect,
  type TimelineClip,
  type TimelineHistory,
  type TimelineNamedAudioTrack,
  type TimelineScene,
  type TimelineTransition,
} from '@allvision/shared';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/hooks/use-toast';
import { ClipTimeline } from '@/components/editor/ClipTimeline';
import { EditorStage } from '@/components/editor/EditorStage';
import { LayerInspector } from '@/components/editor/LayerInspector';
import { MediaLibraryPanel, type MediaLibraryItem } from '@/components/editor/MediaLibraryPanel';
import { SceneGenerator, type SceneGenerationRequest } from '@/components/editor/SceneGenerator';
import { AudioTools, type VoiceRecording, type VoiceoverRequest } from '@/components/editor/AudioTools';
import { GenerationLibrary } from '@/components/editor/GenerationLibrary';
import { TemplateBar, TemplateHint } from '@/components/editor/TemplateFrames';
import type { EditorCatalogService } from '@/store/api/editor-catalog-api';
import { ExportOverlay } from '@/components/editor/ExportOverlay';
import {
  clipSourceLimitSec,
  timelineWithTracks,
  uid,
  useTrackEditor,
  type LayerPatch,
} from '@/components/editor/useTrackEditor';
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
 * Ролик — это дорожки, на которых клипы стоят на своих секундах. Инструменты слева, холст
 * в центре, справа настройки выделенного, снизу монтажная шкала. Прежняя модель «кадры друг
 * за другом» не позволяла ни подвинуть клип, ни оставить паузу, ни положить подпись поверх
 * двух кадров — и правками интерфейса это не лечилось.
 *
 * Ролик, записанный сценами (в том числе шаблон поздравления), переводится на дорожки при
 * открытии: перевод считается из тех же таймингов, по которым ролик рендерится, поэтому
 * ничего не смещается.
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
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [activeTrackIndex, setActiveTrackIndex] = useState(0);
  const [tool, setTool] = useState<ToolCode>('media');
  // Внутри инструмента ИИ две подвкладки: сама генерация и её результаты.
  const [aiTab, setAiTab] = useState<EditorAiTab>('generate');
  /**
   * Открытый лист настроек на телефоне.
   *
   * Отдельно от выбранного инструмента: на большом экране панель видна всегда, а на
   * телефоне она появляется только по нажатию и перекрывает шкалу, поэтому закрывать её
   * надо уметь, не меняя выбранный инструмент.
   */
  const [mobileSheet, setMobileSheet] = useState<ToolCode | 'clip' | null>(null);
  const [hintOpen, setHintOpen] = useState(false);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [exportId, setExportId] = useState<string | null>(null);
  const [showExportScreen, setShowExportScreen] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedRef = useRef(false);
  const uploadTargetRef = useRef<{ clipId: string | null } | null>(null);
  const addFileRef = useRef<HTMLInputElement | null>(null);
  const voiceFileRef = useRef<HTMLInputElement | null>(null);
  const musicFileRef = useRef<HTMLInputElement | null>(null);
  const timelineRef = useRef<Timeline | null>(null);
  // Буфер обмена живёт в ref: он переживает перерисовку и не должен её вызывать.
  const clipboardRef = useRef<TimelineClip | null>(null);
  // История тоже в ref: её глубина нужна только кнопкам.
  const historyRef = useRef<TimelineHistory>(createTimelineHistory());
  const [historyDepth, setHistoryDepth] = useState({ past: 0, future: 0 });

  // Ответ сервера принимаем один раз: иначе автосохранение перетирало бы то,
  // что пользователь успел изменить, пока летел запрос.
  useEffect(() => {
    if (!data?.project || loadedRef.current) return;
    loadedRef.current = true;
    setTimeline(timelineWithTracks(data.project.timeline));
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

  const ops = useTrackEditor(timeline, applyTimeline);
  const tracks = ops.tracks;

  const duration = useMemo(() => (timeline ? timelineDurationSec(timeline) : 0), [timeline]);
  // Часы общие для предпросмотра и шкалы: курсор должен стоять на том кадре,
  // который сейчас на экране.
  const playback = usePlayback(duration);

  const located = selectedClipId ? ops.locate(selectedClipId) : null;
  const selectedClip = located?.clip ?? null;
  const selectedLayer: SceneLayer | null = selectedClip?.layer ?? null;

  // Сцена под курсором нужна панели генерации: она берёт оттуда кадр-референс.
  const scenes = useMemo(() => (timeline ? timelineScenes(timeline) : []), [timeline]);
  const sceneIndex = useMemo(() => {
    if (!timeline) return 0;
    return sceneAtTime(timeline, playback.time)?.activeIndex ?? 0;
  }, [timeline, playback.time]);
  const currentScene: TimelineScene | undefined = scenes[sceneIndex];

  /** Куда класть новый клип: под курсор на активную дорожку. */
  const placement = useCallback(
    () => ({ trackIndex: Math.min(activeTrackIndex, Math.max(0, tracks.length - 1)), startSec: playback.time }),
    [activeTrackIndex, tracks.length, playback.time],
  );

  // --- загрузка файлов ---
  const handleUpload = useCallback(
    async (file: File) => {
      const target = uploadTargetRef.current;
      uploadTargetRef.current = null;
      try {
        const uploaded = await uploadMedia({ id, file }).unwrap();
        const kind = uploaded.mediaKind === 'video' ? ('video' as const) : ('image' as const);
        // Длительность меряет браузер: ffprobe на сервере нет, а клип обязан сразу встать
        // нужной длины — иначе короткое видео дотянется замершим кадром.
        const durationSec = kind === 'video' ? await probeDuration(file) : undefined;

        if (target?.clipId) {
          ops.patchClipLayer(target.clipId, {
            source: { kind, url: uploaded.url },
            trimStartSec: undefined,
            trimEndSec: undefined,
            sourceDurationSec: kind === 'video' ? durationSec : undefined,
          } as Partial<SceneLayer>);
          if (durationSec) ops.patchClip(target.clipId, { durationSec: Number(durationSec.toFixed(2)) });
          return;
        }

        const clipId = ops.addMediaClip({ kind, url: uploaded.url }, { ...placement(), durationSec });
        if (clipId) setSelectedClipId(clipId);
        else toast({ title: 'На дорожке больше нет места', variant: 'destructive' });
      } catch {
        toast({ title: 'Не удалось загрузить файл', description: 'Проверьте формат и размер.', variant: 'destructive' });
      }
    },
    [id, uploadMedia, ops, placement],
  );

  const pickFileFor = (clipId: string | null) => {
    uploadTargetRef.current = { clipId };
    addFileRef.current?.click();
  };

  /** Ставит материал из медиатеки на дорожку. */
  const addFromLibrary = useCallback(
    async (item: MediaLibraryItem, target?: { trackIndex: number; startSec: number }) => {
      const durationSec = item.kind === 'video'
        ? await probeUrlDurationSec(mediaUrl(item.url) ?? item.url)
        : undefined;
      const clipId = ops.addMediaClip(
        { kind: item.kind, url: item.url },
        { ...(target ?? placement()), durationSec },
      );
      if (clipId) setSelectedClipId(clipId);
      else toast({ title: 'На дорожке больше нет места', variant: 'destructive' });
    },
    [ops, placement],
  );

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
    (kind: 'music' | 'voice', url: string, trackTitle?: string) => {
      const current = timelineRef.current;
      if (!current) return;
      const base = timelineWithAudioTracks(current);
      const audio = base.audio ?? [];
      if (audio.length >= TIMELINE_LIMITS.maxAudioTracks) {
        toast({ title: 'Больше дорожек не поместится', variant: 'destructive' });
        return;
      }
      applyTimeline({
        ...base,
        audio: [
          ...audio,
          {
            id: uid(kind),
            kind,
            title: trackTitle,
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

  /**
   * Режет дорожку надвое под курсором.
   *
   * Хвост продолжает файл ровно с той секунды, где кончилась голова, — как разрез клипа
   * на видеодорожке. Затухание на месте разреза снимаем: иначе на стыке двух кусков,
   * стоящих вплотную, звук проваливался бы в тишину и снова возвращался.
   *
   * Повтор у обоих кусков выключаем: после разреза это уже не «песня на весь ролик», а
   * два фрагмента с явными границами, и зацикливание внутри них только путает.
   */
  const splitAudioTrack = useCallback(
    (trackId: string, atSec: number) => {
      const current = timelineRef.current;
      if (!current) return;
      const base = timelineWithAudioTracks(current);
      const list = base.audio ?? [];
      const track = list.find((item) => item.id === trackId);
      if (!track) return;
      if (list.length >= TIMELINE_LIMITS.maxAudioTracks) {
        toast({ title: 'Больше дорожек не поместится', variant: 'destructive' });
        return;
      }

      const startAt = track.startAtSec ?? 0;
      const rollEnd = Math.max(timelineDurationSec(current), atSec + 0.5);
      const end = track.durationSec && track.durationSec > 0 ? startAt + track.durationSec : rollEnd;
      if (atSec <= startAt + 0.2 || atSec >= end - 0.2) {
        toast({ title: 'Поставьте курсор внутри дорожки', variant: 'destructive' });
        return;
      }

      const headLength = Number((atSec - startAt).toFixed(2));
      const head: TimelineNamedAudioTrack = {
        ...track,
        durationSec: headLength,
        loop: false,
        fadeOutSec: 0,
      };
      const tail: TimelineNamedAudioTrack = {
        ...track,
        id: uid(track.kind),
        startAtSec: Number(atSec.toFixed(2)),
        trimStartSec: Number(((track.trimStartSec ?? 0) + headLength).toFixed(2)),
        durationSec: Number((end - atSec).toFixed(2)),
        loop: false,
        fadeInSec: 0,
      };

      applyTimeline({
        ...base,
        audio: list.flatMap((item) => (item.id === trackId ? [head, tail] : [item])),
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

  const handleMusicUpload = useCallback(
    async (file: File) => {
      try {
        const uploaded = await uploadMedia({ id, file }).unwrap();
        if (uploaded.mediaKind !== 'audio') {
          toast({ title: 'Нужен аудиофайл', description: 'MP3, WAV или M4A.', variant: 'destructive' });
          return;
        }
        // Имя файла без расширения — единственное осмысленное название своей музыки.
        addAudioTrack('music', uploaded.url, file.name.replace(/\.[^.]+$/, '').slice(0, 60) || 'Моя музыка');
      } catch {
        toast({ title: 'Не удалось загрузить музыку', description: 'Проверьте формат и размер.', variant: 'destructive' });
      }
    },
    [id, uploadMedia, addAudioTrack],
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
      toast({ title: 'Озвучка не получилась', description: 'Токены вернулись на баланс.', variant: 'destructive' });
      return;
    }
    if (voiceoverStatus?.status !== 'COMPLETED') return;
    setVoiceoverProjectId(null);

    // Дорожку в свою копию ролика уже вписал воркер — забираем оттуда только её,
    // чтобы не затереть правки, сделанные пока шёл синтез.
    void (async () => {
      try {
        const fresh = await refetchProject().unwrap();
        const url = fresh.project.timeline.voiceover?.url
          ?? timelineAudioTracks(fresh.project.timeline).find((track) => track.kind === 'voice')?.url;
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
      } catch (err) {
        const message = (err as { data?: { error?: { message?: string } } })?.data?.error?.message;
        toast({ title: 'Не удалось запустить озвучку', description: message, variant: 'destructive' });
      }
    },
    [generateVoiceover, id],
  );

  // --- генерация в клип ---
  const pendingClip = useMemo(
    () =>
      tracks
        .flatMap((track) => track.clips)
        .find((clip) => clip.layer.kind === 'media' && Boolean(clip.layer.generationProjectId)) ?? null,
    [tracks],
  );
  const runningGenerationId = pendingClip && pendingClip.layer.kind === 'media'
    ? pendingClip.layer.generationProjectId ?? null
    : null;

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
    // Метку снимаем: иначе клип ждёт результат, которого не будет, а поллинг не кончается.
    if (pendingClip) ops.patchClipLayer(pendingClip.id, { generationProjectId: undefined } as Partial<SceneLayer>);
    toast({
      title: 'Генерация не получилась',
      description: 'Токены вернулись на баланс — попробуйте другой кадр или описание.',
      variant: 'destructive',
    });
  }, [runningGenerationId, sceneStatus?.status, pendingClip, ops]);

  useEffect(() => {
    if (!runningGenerationId || sceneStatus?.status !== 'COMPLETED') return;
    if (appliedGenerationRef.current === runningGenerationId) return;
    appliedGenerationRef.current = runningGenerationId;

    void (async () => {
      try {
        const fresh = await refetchProject().unwrap();
        // Воркер уже вписал результат в свою копию ролика — забираем оттуда только
        // материал готового клипа, а не весь таймлайн: правки, сделанные во время
        // генерации, затирать нельзя.
        const generatedLayer = timelineScenes(fresh.project.timeline)
          .flatMap((scene) => sceneMediaLayers(scene))
          .find((layer) => layer.generationProjectId === runningGenerationId);
        const url = generatedLayer?.source.url;
        const kind = generatedLayer?.source.kind;
        if (!url || (kind !== 'image' && kind !== 'video')) {
          // Воркер не нашёл, куда положить кадр. Берём его копию ролика целиком: иначе
          // наше следующее автосохранение затрёт результат, за который уже заплачено.
          applyWithoutHistory(timelineWithTracks(fresh.project.timeline));
          toast({ title: 'Кадр готов', description: 'Ролик обновлён с сервера.' });
          return;
        }

        const current = timelineRef.current;
        if (!current) return;
        const applied = applyGeneratedSource(current, runningGenerationId, { kind, url });
        if (!applied.changed) return;

        // Клип подстраивается под длину видео: иначе короткий ролик дотягивается замершим
        // кадром, и переход идёт уже по застывшей картинке.
        let next = applied.timeline;
        if (kind === 'video') {
          const measured = await probeUrlDurationSec(mediaUrl(url) ?? url);
          if (measured) {
            next = {
              ...next,
              tracks: (next.tracks as Array<{ clips: TimelineClip[] }> | undefined)?.map((track) => ({
                ...track,
                clips: track.clips.map((clip) =>
                  clip.layer.kind === 'media' && clip.layer.source.url === url
                    ? { ...clip, durationSec: Number(measured.toFixed(2)) }
                    : clip,
                ),
              })),
            };
          }
        }
        // Сохраняем сразу: подстановка снимает метку, и обе копии ролика должны сойтись.
        applyWithoutHistory(next);
        toast({ title: 'Кадр готов' });
      } catch {
        toast({ title: 'Генерация готова', description: 'Обновите страницу, если кадр не появился.' });
      }
    })();
  }, [runningGenerationId, sceneStatus?.status, refetchProject, applyWithoutHistory]);

  /** Что показать поверх кадра, пока идёт генерация: рамка с процентом вместо пустого слоя. */
  const generationOverlay = pendingClip && runningGenerationId
    ? {
      layerId: pendingClip.layer.id,
      progress: sceneStatus?.progress ?? 0,
      label: sceneStatus?.status === 'PENDING' ? 'В очереди' : 'Генерируем',
    }
    : null;

  /**
   * Клип, в который встанет результат генерации.
   *
   * По умолчанию заводим НОВЫЙ клип под курсором: подменять то, что человек уже разложил,
   * без спроса нельзя. Заменить выделенный можно, но только явно.
   */
  const targetClipForGeneration = useCallback(
    (replaceSelected: boolean) => {
      if (replaceSelected && selectedClip && selectedClip.layer.kind === 'media') return selectedClip.id;
      return ops.addMediaClip({ kind: 'color', color: '#0b1020' }, placement());
    },
    [selectedClip, ops, placement],
  );

  const handleRunService = useCallback(
    async (service: { slug: string; title: string }, values: Record<string, string>) => {
      if (!timeline) return;
      const frame = currentScene
        ? sceneMediaLayers(currentScene).find((layer) => layer.source.kind === 'image' || layer.source.kind === 'video')
        : undefined;

      const clipId = targetClipForGeneration(false);
      if (!clipId) {
        toast({ title: 'На дорожке больше нет места', variant: 'destructive' });
        return;
      }
      const layerId = ops.locate(clipId)?.clip.layer.id ?? clipId;

      setRunningServiceSlug(service.slug);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      try {
        if (timelineRef.current) await updateProject({ id, timeline: timelineRef.current }).unwrap();
        const result = await generateSceneService({
          id,
          sceneId: clipId,
          body: { serviceSlug: service.slug, layerId, frameUrl: frame?.source.url, values },
        }).unwrap();
        ops.patchClipLayer(clipId, { generationProjectId: result.projectId } as Partial<SceneLayer>);
        setTool('ai');
        setAiTab('library');
        toast({ title: `Запустили «${service.title}»`, description: `Списано ${result.tokensCost} токенов` });
      } catch (err) {
        setRunningServiceSlug(null);
        ops.removeClip(clipId);
        const message = (err as { data?: { error?: { message?: string } } })?.data?.error?.message;
        toast({ title: 'Не удалось запустить услугу', description: message, variant: 'destructive' });
      }
    },
    [timeline, currentScene, targetClipForGeneration, ops, id, updateProject, generateSceneService],
  );

  // --- шаблон поздравления ---
  const template = timeline?.template;

  /** Кадры шаблона — это клипы основной дорожки: остальное человек добавил сам. */
  const frameClips = useMemo(
    () => (template ? sortedClips(tracks[0] ?? { id: 'main', clips: [], hidden: false, muted: false }) : []),
    [template, tracks],
  );

  /** Кадр готов к запуску, когда в нём лежит фотография и он ещё не оживлён. */
  const framesToGenerate = useMemo(
    () => frameClips.filter((clip) =>
      clip.layer.kind === 'media'
      && clip.layer.source.kind === 'image'
      && !clip.layer.generationProjectId),
    [frameClips],
  );

  const framePrice = useMemo(() => {
    if (!template) return 0;
    return estimateChatGenerationPriceCoins(template.model, {
      duration: template.durationSec,
      priceOverrides: chatPricing?.modelPriceOverrides,
    });
  }, [template, chatPricing?.modelPriceOverrides]);

  /**
   * Оживление одного кадра шаблона.
   *
   * Настройки берём из рецепта ролика, а не спрашиваем: шаблон затем и выбран, чтобы не
   * подбирать модель и промпт вручную. Метку ставит сервер — результат встанет в этот же
   * кадр, даже если вкладку закроют.
   */
  const handleFrameGenerate = useCallback(
    async (clipId: string) => {
      const current = timelineRef.current;
      const recipe = current?.template;
      if (!recipe) return false;
      const found = ops.locate(clipId);
      const layer = found?.clip.layer;
      if (!found || !layer || layer.kind !== 'media' || layer.source.kind !== 'image' || !layer.source.url) {
        toast({ title: 'Сначала вставьте фотографию в кадр', variant: 'destructive' });
        return false;
      }

      if (saveTimer.current) clearTimeout(saveTimer.current);
      try {
        // Сервер ищет клип в своей копии ролика — сначала досохраняем.
        await updateProject({ id, timeline: current }).unwrap();
        const result = await generateScene({
          id,
          sceneId: clipId,
          body: {
            modelSlug: recipe.model,
            prompt: recipe.prompt ?? '',
            aspectRatio: current.aspect === '4:5' ? '9:16' : current.aspect,
            duration: recipe.durationSec,
            layerId: layer.id,
            imageInputRef: layer.source.url,
          },
        }).unwrap();
        appliedGenerationRef.current = null;
        /*
         * Метку ставим от АКТУАЛЬНОЙ копии ролика, а не через операции редактора.
         *
         * «Сгенерировать всё» запускает кадры в цикле, без перерисовки между итерациями, а
         * операции замкнуты на дорожки того рендера, в котором создавались. Через них
         * второй кадр стирал бы метку первого — и оплаченный результат не нашёл бы, куда
         * встать. Тот же помощник, что и на сервере, работает от переданного ролика.
         */
        const after = timelineRef.current;
        if (after) {
          const marked = markLayerGeneration(after, clipId, layer.id, result.projectId);
          if (marked.changed) applyWithoutHistory(marked.timeline);
        }
        return true;
      } catch (err) {
        const message = (err as { data?: { error?: { message?: string } } })?.data?.error?.message;
        toast({ title: 'Не удалось оживить кадр', description: message, variant: 'destructive' });
        return false;
      }
    },
    [id, ops, updateProject, generateScene, applyWithoutHistory],
  );

  /**
   * Запуск всех заполненных кадров подряд.
   *
   * Ставим их в очередь по одному и останавливаемся на первой ошибке: если кончились
   * токены, продолжать бессмысленно, а списывать за половину ролика — нечестно.
   */
  const handleGenerateAll = useCallback(async () => {
    if (framesToGenerate.length === 0) return;
    setGeneratingAll(true);
    let started = 0;
    for (const clip of framesToGenerate) {
      // eslint-disable-next-line no-await-in-loop
      const ok = await handleFrameGenerate(clip.id);
      if (!ok) break;
      started += 1;
    }
    setGeneratingAll(false);
    if (started > 0) {
      toast({
        title: `Запустили кадров: ${started}`,
        description: 'Они считаются по очереди — готовые кадры встанут в ролик сами.',
      });
    }
  }, [framesToGenerate, handleFrameGenerate]);

  /** Подсказку показываем один раз на ролик: дальше она живёт под знаком вопроса. */
  const hintKey = `allvision.templateHint.${id}`;
  useEffect(() => {
    if (!template) return;
    try {
      if (window.localStorage.getItem(hintKey)) return;
    } catch {
      // Приватный режим и заблокированное хранилище — не повод прятать подсказку.
    }
    setHintOpen(true);
  }, [template, hintKey]);

  const closeHint = useCallback(() => {
    setHintOpen(false);
    try {
      window.localStorage.setItem(hintKey, '1');
    } catch {
      // Ничего страшного: подсказка просто появится в следующий раз.
    }
  }, [hintKey]);

  const handleGenerate = useCallback(
    async (request: SceneGenerationRequest) => {
      if (!timeline) return;
      const replaceSelected = request.target === 'selected' && selectedClip?.layer.kind === 'media';
      const clipId = targetClipForGeneration(Boolean(replaceSelected));
      if (!clipId) {
        toast({ title: 'На дорожке больше нет места', variant: 'destructive' });
        return;
      }
      const layerId = ops.locate(clipId)?.clip.layer.id ?? clipId;

      if (saveTimer.current) clearTimeout(saveTimer.current);
      try {
        // Сервер ищет клип в своей копии таймлайна, поэтому сначала досохраняем.
        if (timelineRef.current) await updateProject({ id, timeline: timelineRef.current }).unwrap();
        const result = await generateScene({
          id,
          sceneId: clipId,
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
        ops.patchClipLayer(clipId, {
          generationProjectId: result.projectId,
          origin: 'generated',
        } as Partial<SceneLayer>);
        setSelectedClipId(clipId);
        setTool('ai');
        setAiTab('library');
        toast({ title: 'Генерация запущена', description: 'Можно закрыть страницу — кадр сам встанет в ролик.' });
      } catch (err) {
        // Убираем только тот клип, который завели ради этой генерации: чужой кадр,
        // выбранный пользователем, из-за нашей ошибки исчезать не должен.
        if (!replaceSelected) ops.removeClip(clipId);
        const message = (err as { data?: { error?: { message?: string } } })?.data?.error?.message;
        toast({ title: 'Не удалось запустить генерацию', description: message, variant: 'destructive' });
      }
    },
    [timeline, selectedClip, targetClipForGeneration, ops, id, updateProject, generateScene],
  );

  // --- клавиатура ---
  // Ловим на окне, потому что фокус чаще всего на холсте Konva, а он обычный canvas и
  // о клавишах ничего не знает.
  useEffect(() => {
    const isTyping = (target: EventTarget | null) => {
      const node = target as HTMLElement | null;
      if (!node) return false;
      const tag = node.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || node.isContentEditable;
    };

    const onKeyDown = (event: KeyboardEvent) => {
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
        if (!selectedClipId) return;
        const copyId = ops.duplicateClip(selectedClipId);
        if (copyId) setSelectedClipId(copyId);
        else toast({ title: 'На дорожке больше нет места', variant: 'destructive' });
        return;
      }
      if (mod && code === 'KeyC') {
        if (!selectedClip) return;
        event.preventDefault();
        clipboardRef.current = selectedClip;
        toast({ title: 'Клип скопирован' });
        return;
      }
      if (mod && code === 'KeyV') {
        const copied = clipboardRef.current;
        if (!copied) return;
        event.preventDefault();
        const pastedId = ops.addClip(
          { ...copied.layer, id: uid('layer'), generationProjectId: undefined } as SceneLayer,
          { ...placement(), durationSec: copied.durationSec },
        );
        if (pastedId) setSelectedClipId(pastedId);
        else toast({ title: 'На дорожке больше нет места', variant: 'destructive' });
        return;
      }
      if (code === 'KeyS' && !mod && selectedClipId) {
        event.preventDefault();
        const tailId = ops.splitClip(selectedClipId, playback.time);
        if (tailId) setSelectedClipId(tailId);
        return;
      }
      if (event.key === 'Escape') {
        setSelectedClipId(null);
        return;
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedClipId) {
        event.preventDefault();
        ops.removeClip(selectedClipId);
        setSelectedClipId(null);
        return;
      }
      if (code === 'Space') {
        event.preventDefault();
        playback.toggle();
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
      if (delta && selectedClip) {
        event.preventDefault();
        const box = selectedClip.layer.box;
        ops.patchClipLayer(selectedClip.id, {
          box: {
            ...box,
            // Рамку держим в кадре: уехавший за край слой уже не выделить обратно.
            x: Math.min(1 - box.w / 2, Math.max(-box.w / 2, box.x + delta[0])),
            y: Math.min(1 - box.h / 2, Math.max(-box.h / 2, box.y + delta[1])),
          },
        } as Partial<SceneLayer>);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [ops, selectedClipId, selectedClip, undo, redo, playback, placement]);

  // --- экспорт ---
  const { data: exportStatus } = useGetProjectStatusQuery(exportId ?? '', {
    skip: !exportId,
    pollingInterval: exportId ? 3000 : 0,
  });
  const exportRunning = exportStatus?.status === 'PENDING' || exportStatus?.status === 'PROCESSING';
  const exportUrl = exportStatus?.status === 'COMPLETED' ? mediaUrl(exportStatus.resultVideo) : null;

  const issues = useMemo(() => (timeline ? validateTimeline(timeline) : []), [timeline]);

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
  const voiceTracks = timelineAudioTracks(timeline).filter((track) => track.kind === 'voice');
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
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col overflow-hidden lg:h-dvh">
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
            {exportRunning ? 'Собираем…' : 'Собрать ролик за 2 токена'}
          </Button>
        </div>
      </header>

      {(exportRunning || generationOverlay) && (
        <div className="shrink-0 space-y-1.5 border-b border-slate-800 bg-slate-900/60 px-3 py-2 lg:px-4">
          {generationOverlay && (
            <ProgressLine
              label={`${generationOverlay.label} кадр — результат встанет в свой клип`}
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

      {exportUrl && !showExportScreen && (
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

      {template && !showExportScreen && (
        <TemplateBar
          template={template}
          total={frameClips.length}
          withPhoto={framesToGenerate.length}
          generated={frameClips.filter((clip) => clip.layer.kind === 'media' && clip.layer.source.kind === 'video').length}
          running={generatingAll || generating}
          pricePerFrame={framePrice}
          onGenerateAll={handleGenerateAll}
          onShowHint={() => setHintOpen(true)}
        />
      )}

      {template && hintOpen && <TemplateHint template={template} onClose={closeHint} />}

      {showExportScreen ? (
        <ExportOverlay
          projectId={id}
          running={Boolean(exportRunning)}
          failed={exportStatus?.status === 'FAILED'}
          errorMessage={exportStatus?.errorMessage}
          progress={exportStatus?.progress ?? 0}
          resultUrl={exportUrl}
          onRetry={handleExport}
          onBackToEditor={() => setShowExportScreen(false)}
        />
      ) : (
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/*
         * Лента инструментов.
         *
         * На телефоне это закреплённая полоса у нижнего края, как в монтажках: кадр сверху,
         * под ним шкала, инструменты под большим пальцем. Нажатие открывает лист с
         * настройками поверх — панель не вклинивается между кадром и шкалой и не уводит
         * рабочую область за пределы экрана.
         */}
        <nav className={cn(
          'fixed inset-x-0 bottom-0 z-40 flex shrink-0 gap-2 overflow-x-auto border-t border-slate-800 bg-slate-950/95 p-2 backdrop-blur',
          'lg:static lg:z-auto lg:w-[76px] lg:flex-col lg:overflow-visible lg:border-r lg:border-t-0 lg:bg-transparent lg:backdrop-blur-none',
        )}>
          {/*
            * Настройки на телефоне тоже живут в листе. Кнопка одна и меняет смысл по
            * выделению: выделен клип — его настройки, ничего не выделено — настройки ролика.
            * Иначе формат кадра на телефоне было бы негде поменять.
            */}
          <button
            type="button"
            onClick={() => setMobileSheet((current) => (current === 'clip' ? null : 'clip'))}
            className={cn(
              'flex shrink-0 flex-col items-center gap-1 rounded-xl border px-3 py-2.5 text-[11px] font-medium transition lg:hidden',
              mobileSheet === 'clip'
                ? 'border-amber-400 bg-amber-400/10 text-amber-200'
                : 'border-slate-800 bg-slate-900/60 text-slate-400',
            )}
          >
            <SlidersHorizontal className="h-4 w-4" />
            {selectedClip ? 'Клип' : 'Ролик'}
          </button>
          {TOOLS.map((item) => (
            <button
              key={item.code}
              type="button"
              onClick={() => {
                setTool(item.code);
                // Повторное нажатие по открытому инструменту закрывает лист — так быстрее
                // вернуться к шкале, чем искать крестик.
                setMobileSheet((current) => (current === item.code ? null : item.code));
              }}
              className={cn(
                'flex shrink-0 flex-col items-center gap-1 rounded-xl border px-3 py-2.5 text-[11px] font-medium transition lg:w-full',
                tool === item.code && (mobileSheet === item.code || mobileSheet === null)
                  ? 'border-amber-400 bg-amber-400/10 text-amber-200'
                  : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700 hover:text-slate-200',
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </button>
          ))}
        </nav>

        {/* Подложка листа: клик мимо закрывает, как у любой шторки. */}
        {mobileSheet && (
          <button
            type="button"
            aria-label="Закрыть панель"
            onClick={() => setMobileSheet(null)}
            className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          />
        )}

        {/*
         * Панель инструмента стоит сбоку, а не под холстом: иначе она вклинивается между
         * кадром и шкалой, и рабочая область уезжает на два экрана вниз.
         */}
        <section className={cn(
          'shrink-0 overflow-y-auto p-3',
          'fixed inset-x-0 bottom-[68px] z-40 max-h-[54dvh] rounded-t-2xl border border-slate-800 bg-slate-950 shadow-2xl shadow-black/60 transition-transform duration-200',
          mobileSheet && mobileSheet !== 'clip' ? 'translate-y-0' : 'pointer-events-none translate-y-[120%]',
          'lg:pointer-events-auto lg:static lg:z-auto lg:max-h-none lg:w-[330px] lg:translate-y-0 lg:rounded-none lg:border-0 lg:border-r lg:border-slate-800 lg:shadow-none',
        )}>
          <ToolBar
            tool={tool}
            aiTab={aiTab}
            onAiTabChange={setAiTab}
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
            onAddFromLibrary={(item) => void addFromLibrary(item)}
            onAddColor={() => {
              const clipId = ops.addMediaClip({ kind: 'color', color: '#0b1020' }, placement());
              if (clipId) setSelectedClipId(clipId);
            }}
            onAddText={() => {
              const clipId = ops.addTextClip(placement());
              if (clipId) setSelectedClipId(clipId);
              else toast({ title: 'На дорожке больше нет места', variant: 'destructive' });
            }}
            onCollage={(layout) => {
              // Коллаж расставляет по рамкам то, что видно ПОД КУРСОРОМ: на дорожках
              // «сцена» — это набор клипов, идущих в одну секунду.
              const boxes = collageBoxes(layout);
              const active = tracks
                .flatMap((track) => track.clips)
                .filter((clip) => clip.layer.kind === 'media')
                .filter((clip) => playback.getTime() >= clip.startSec && playback.getTime() < clipEndSec(clip));
              active.forEach((clip, index) => {
                const box = layout === 'single' ? boxes[0] : boxes[index];
                if (!box) return;
                ops.patchClipLayer(clip.id, {
                  box,
                  fit: layout === 'single' ? 'contain' : 'cover',
                  rotation: 0,
                } as Partial<SceneLayer>);
              });
            }}
            onAddMusic={(url, trackTitle) => addAudioTrack('music', url, trackTitle)}
            onPickMusicFile={() => musicFileRef.current?.click()}
            recordings={voiceRecordings}
            onAddVoiceTrack={(url, trackTitle) => addAudioTrack('voice', url, trackTitle)}
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
            onUploadReference={uploadReference}
            onInsertGeneration={(url, kind) => {
              void addFromLibrary({ id: url, title: 'Генерация', url, kind, group: 'upload' });
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
            onSelectScene={() => undefined}
            selectedLayerId={selectedLayer?.id ?? null}
            onSelectLayer={(layerId) => setSelectedClipId(ops.clipIdByLayerId(layerId))}
            onChangeLayer={(_index, layerId, patch) => ops.patchLayerById(layerId, patch as Partial<SceneLayer>)}
          />
          {/* Про горячие клавиши на холсте догадаться нельзя — подсказываем строкой. */}
          <p className="hidden shrink-0 text-[11px] text-slate-600 xl:block">
            Пробел — играть · Ctrl+Z — отменить · Ctrl+C/Ctrl+V — копировать клип · Ctrl+D — дублировать ·
            S — разрезать под курсором · Delete — удалить · стрелки — сдвинуть кадр (с Shift — крупнее)
          </p>
        </main>

        <aside className={cn(
          'shrink-0 space-y-3 overflow-y-auto p-3',
          'fixed inset-x-0 bottom-[68px] z-40 max-h-[54dvh] rounded-t-2xl border border-slate-800 bg-slate-950 shadow-2xl shadow-black/60 transition-transform duration-200',
          mobileSheet === 'clip' ? 'translate-y-0' : 'pointer-events-none translate-y-[120%]',
          'lg:pointer-events-auto lg:static lg:z-auto lg:max-h-none lg:w-[330px] lg:translate-y-0 lg:rounded-none lg:border-0 lg:border-l lg:border-slate-800 lg:shadow-none',
        )}>
          <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
            {selectedClip ? (
              <ClipInspector
                clip={selectedClip}
                uploading={uploading}
                onPatchClip={(patch) => ops.patchClip(selectedClip.id, patch)}
                onPatchLayer={(patch) => ops.patchClipLayer(selectedClip.id, patch as Partial<SceneLayer>)}
                onReplaceFile={() => pickFileFor(selectedClip.id)}
                onTransition={(value) => ops.setTransition(selectedClip.id, value)}
                onSpeed={(value) => ops.setClipSpeed(selectedClip.id, value)}
                onSplit={() => {
                  const tailId = ops.splitClip(selectedClip.id, playback.getTime());
                  if (tailId) setSelectedClipId(tailId);
                  else toast({ title: 'Поставьте курсор внутри клипа', variant: 'destructive' });
                }}
                onRemove={() => {
                  ops.removeClip(selectedClip.id);
                  setSelectedClipId(null);
                }}
              />
            ) : (
              <RollSettings
                aspect={timeline.aspect}
                onAspectChange={(aspect) => applyTimeline({ ...timeline, aspect })}
              />
            )}
          </section>
        </aside>
      </div>
      )}

      {/*
       * Нижняя панель — монтажная шкала. Здесь видно, где стоит каждый клип и где именно
       * звучит реплика, и всё это можно подвинуть, а не гадать по числам в настройках.
       */}
      {!showExportScreen && (
      <footer className="shrink-0 border-t border-slate-800 bg-slate-950/80 px-3 pb-[76px] pt-2 lg:px-4 lg:pb-2">
        <ClipTimeline
          timeline={timeline}
          tracks={tracks}
          time={playback.time}
          onSeek={playback.seek}
          subscribeTime={playback.subscribe}
          selectedClipId={selectedClipId}
          onSelectClip={(clipId) => {
            setSelectedClipId(clipId);
            const found = clipId ? ops.locate(clipId) : null;
            if (found) setActiveTrackIndex(found.trackIndex);
          }}
          onMoveClip={(clipId, target) => {
            ops.moveClip(clipId, target);
            if (typeof target.trackIndex === 'number') setActiveTrackIndex(target.trackIndex);
          }}
          onTrimClip={ops.trimClip}
          onDuplicateClip={(clipId) => {
            const copyId = ops.duplicateClip(clipId);
            if (copyId) setSelectedClipId(copyId);
            else toast({ title: 'На дорожке больше нет места', variant: 'destructive' });
          }}
          onRemoveClip={(clipId) => {
            ops.removeClip(clipId);
            if (clipId === selectedClipId) setSelectedClipId(null);
          }}
          onSplitClip={(clipId, atSec) => {
            const tailId = ops.splitClip(clipId, atSec);
            if (tailId) setSelectedClipId(tailId);
            else toast({ title: 'Поставьте курсор внутри клипа', variant: 'destructive' });
          }}
          onTransition={ops.setTransition}
          onAddTrack={() => {
            if (!ops.addTrack()) toast({ title: 'Больше дорожек не поместится', variant: 'destructive' });
          }}
          onRemoveTrack={ops.removeTrack}
          onPatchTrack={ops.patchTrack}
          onSnapToPrevious={ops.snapToPrevious}
          templateMode={Boolean(template)}
          framePriceCoins={framePrice}
          onFramePick={(clipId) => {
            setSelectedClipId(clipId);
            pickFileFor(clipId);
          }}
          onFrameGenerate={(clipId) => void handleFrameGenerate(clipId)}
          onChangeAudio={changeAudioTrack}
          onRemoveAudio={removeAudioTrack}
          onSplitAudio={splitAudioTrack}
          onDropMedia={(trackIndex, startSec, item) => void addFromLibrary(item, { trackIndex, startSec })}
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
        ref={musicFileRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleMusicUpload(file);
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
  aiTab,
  onAiTabChange,
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
  onAddFromLibrary,
  onAddColor,
  onAddText,
  onCollage,
  onAddMusic,
  recordings,
  onAddVoiceTrack,
  onRemoveVoiceTrack,
  onPickVoiceFile,
  onPickMusicFile,
  onRecordVoice,
  onGenerateVoiceover,
  onGenerate,
  onRunService,
  runningServiceSlug,
  onUploadReference,
  onInsertGeneration,
}: {
  tool: ToolCode;
  aiTab: EditorAiTab;
  onAiTabChange: (tab: EditorAiTab) => void;
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
  onAddFromLibrary: (item: MediaLibraryItem) => void;
  onAddColor: () => void;
  onAddText: () => void;
  onCollage: (layout: CollageLayout) => void;
  onAddMusic: (url: string, title: string) => void;
  recordings: VoiceRecording[];
  onAddVoiceTrack: (url: string, title: string) => void;
  onRemoveVoiceTrack: (url: string) => void;
  onPickVoiceFile: () => void;
  onPickMusicFile: () => void;
  onRecordVoice: (file: File) => void;
  onGenerateVoiceover: (request: VoiceoverRequest) => void;
  onUploadReference: (file: File) => Promise<string | null>;
  onInsertGeneration: (url: string, kind: 'image' | 'video') => void;
  onGenerate: (request: SceneGenerationRequest) => void;
  onRunService: (service: EditorCatalogService, values: Record<string, string>) => void;
  runningServiceSlug: string | null;
}) {
  if (tool === 'media') {
    return (
      <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/60 p-3">
        <MediaLibraryPanel uploading={uploading} onPickFile={onPickFile} onAdd={onAddFromLibrary} />
        <Button type="button" variant="outline" size="sm" className="w-full" onClick={onAddColor}>
          Добавить заливку
        </Button>
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
            Расставит по сетке кадры, которые видны под курсором.
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
          Титр встанет отдельным клипом на дорожку поверх кадра — его можно двигать по времени
          и растягивать прямо на холсте.
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
        onPickMusicFile={onPickMusicFile}
        recordings={recordings}
        onAddVoiceTrack={onAddVoiceTrack}
        onRemoveVoiceTrack={onRemoveVoiceTrack}
        onPickVoiceFile={onPickVoiceFile}
        onRecordVoice={onRecordVoice}
        onGenerateVoiceover={onGenerateVoiceover}
      />
    );
  }

  const aiTabs = (
    <div className="mb-2 grid grid-cols-3 gap-1 rounded-lg border border-slate-800 bg-slate-950/60 p-1">
      {([
        { code: 'generate', title: 'Своя' },
        { code: 'services', title: 'Услуги' },
        { code: 'library', title: 'Мои' },
      ] as const).map((item) => (
        <button
          key={item.code}
          type="button"
          onClick={() => onAiTabChange(item.code)}
          className={cn(
            'rounded-md px-2 py-1.5 text-xs font-medium transition',
            aiTab === item.code ? 'bg-slate-800 text-slate-100' : 'text-slate-400 hover:text-slate-200',
          )}
        >
          {item.title}
        </button>
      ))}
    </div>
  );

  if (aiTab === 'library') {
    return (
      <div>
        {aiTabs}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
          <GenerationLibrary onInsert={onInsertGeneration} />
        </div>
      </div>
    );
  }

  return scene ? (
    <div>
      {aiTabs}
      <SceneGenerator
        scene={scene}
        aspect={timeline.aspect}
        balance={balance}
        running={generating}
        selectedLayer={selectedLayer}
        tab={aiTab === 'services' ? 'services' : 'generate'}
        onUploadReference={onUploadReference}
        onGenerate={onGenerate}
        onRunService={onRunService}
        runningServiceSlug={runningServiceSlug}
      />
    </div>
  ) : null;
}

/**
 * Под-вкладки инструмента ИИ.
 *
 * «Своя» — собственная генерация, «Услуги» — готовые сценарии владельца, «Мои» — то, что
 * уже посчиталось. Раньше первые две жили в одной простыне и не помещались на экран.
 */
type EditorAiTab = 'generate' | 'services' | 'library';

/** Ступени скорости: те же, что в любой монтажке, и все укладываются в границы ffmpeg. */
const CLIP_SPEEDS = [0.25, 0.5, 1, 1.5, 2, 4] as const;

const TRANSITION_LABELS: Array<{ code: TimelineTransition; label: string }> = [
  { code: 'cut', label: 'Встык' },
  { code: 'dissolve', label: 'Растворение' },
  { code: 'fade-black', label: 'Через чёрный' },
  { code: 'slide', label: 'Сдвиг' },
];

/**
 * Настройки выделенного клипа.
 *
 * Сначала то, что про клип целиком — когда он идёт и сколько длится, — а ниже настройки
 * самого кадра. Порядок повторяет вопросы, которые возникают у человека.
 */
function ClipInspector({
  clip,
  uploading,
  onPatchClip,
  onPatchLayer,
  onReplaceFile,
  onTransition,
  onSpeed,
  onSplit,
  onRemove,
}: {
  clip: TimelineClip;
  uploading: boolean;
  onPatchClip: (patch: Partial<Omit<TimelineClip, 'id' | 'layer'>>) => void;
  onPatchLayer: (patch: LayerPatch) => void;
  onReplaceFile: () => void;
  onTransition: (value: TimelineTransition) => void;
  onSpeed: (value: number) => void;
  onSplit: () => void;
  onRemove: () => void;
}) {
  const speed = layerSpeed(clip.layer);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-100">
          {clip.layer.kind === 'text' ? 'Титр' : 'Клип'}
        </h3>
        <div className="flex gap-1.5">
          <Button type="button" variant="outline" size="sm" onClick={onSplit}>Разрезать</Button>
          <Button type="button" variant="outline" size="sm" onClick={onRemove}>Удалить</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="block text-xs text-slate-400">
          Начало, сек
          <Input
            type="number"
            min={0}
            step={0.1}
            value={Number(clip.startSec.toFixed(2))}
            onChange={(event) => onPatchClip({ startSec: Math.max(0, Number(event.target.value)) })}
            className="mt-1 h-9"
          />
        </label>
        <label className="block text-xs text-slate-400">
          Длительность, сек
          <Input
            type="number"
            min={0.2}
            max={TIMELINE_LIMITS.maxSceneDurationSec}
            step={0.1}
            value={Number(clip.durationSec.toFixed(2))}
            onChange={(event) => {
              // Та же граница, что и у ручки края: показать больше, чем есть в записи, нельзя.
              const limit = clipSourceLimitSec(clip);
              const wanted = Math.max(0.2, Number(event.target.value));
              onPatchClip({ durationSec: limit === null ? wanted : Math.min(wanted, limit) });
            }}
            className="mt-1 h-9"
          />
        </label>
      </div>

      {clip.layer.kind === 'media' && clip.layer.source.kind === 'video' && (
        <div className="space-y-1.5">
          <Label className="text-xs">Скорость</Label>
          <div className="flex flex-wrap gap-1.5">
            {CLIP_SPEEDS.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => onSpeed(value)}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs transition',
                  Math.abs(speed - value) < 0.001
                    ? 'border-amber-400 bg-amber-400/15 text-amber-200'
                    : 'border-slate-700 text-slate-300 hover:border-slate-500',
                )}
              >
                {value}×
              </button>
            ))}
          </div>
          <p className="text-[11px] text-slate-500">
            Кусок записи остаётся тем же — меняется, за сколько он проигрывается, поэтому
            клип на дорожке станет короче или длиннее. Звук ускоряется вместе с картинкой.
          </p>
        </div>
      )}

      <div className="space-y-1.5">
        <Label className="text-xs">Переход к следующему клипу</Label>
        <div className="flex flex-wrap gap-1.5">
          {TRANSITION_LABELS.map((item) => (
            <button
              key={item.code}
              type="button"
              onClick={() => onTransition(item.code)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs transition',
                clip.transition === item.code
                  ? 'border-amber-400 bg-amber-400/15 text-amber-200'
                  : 'border-slate-700 text-slate-300 hover:border-slate-500',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-slate-500">
          Переход — это наложение соседних клипов: следующий сдвинется навстречу этому.
        </p>
      </div>

      <div className="border-t border-slate-800 pt-3">
        <LayerInspector
          layer={clip.layer}
          uploading={uploading}
          onChange={onPatchLayer}
          onReplaceFile={onReplaceFile}
        />
      </div>
    </div>
  );
}

function RollSettings({
  aspect,
  onAspectChange,
}: {
  aspect: TimelineAspect;
  onAspectChange: (aspect: TimelineAspect) => void;
}) {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-slate-100">Ролик</h3>
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
      <p className="text-xs leading-5 text-slate-500">
        Выделите клип на шкале или кадр на холсте, чтобы настроить его отдельно. Между клипами
        можно оставить паузу — там останется фон.
      </p>
    </div>
  );
}

/**
 * Длительность видео по ссылке.
 *
 * Нужна, когда кадр приехал из генерации или из медиатеки: клип сохраняет прежнюю длину, и
 * если материал короче, ffmpeg дотягивает его последним кадром — видео «застывает».
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
