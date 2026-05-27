'use client';

import { useEffect, useMemo, useState, type DragEvent, type FormEvent } from 'react';
import { AlertTriangle, ChevronDown, Clock3, Frame, ImageIcon, Loader2, Paperclip, Send, Settings2, Sparkles, UploadCloud, Video, Volume2, VolumeX, X } from 'lucide-react';
import { CHAT_MODELS, estimateChatGenerationPriceCoins, type ChatAspectRatio, type ChatCategory, type ChatModelOption, type PiAPIParamCapability } from '@allvision/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { TokenIcon } from '@/components/ui/token-icon';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useGetMeQuery } from '@/store/api/auth-api';
import { useCreateChatMessageMutation, useGetChatModelsQuery, useUploadChatInputMutation } from '@/store/api/user-chat-api';
import { InputSourcePicker, type SelectedInputSource } from './InputSourcePicker';

type ChatFormProps = {
  chatId: string;
  onCreated: () => void;
  initialReference: SelectedInputSource | null;
  initialPrompt?: string;
  onReferenceConsumed: () => void;
  onPromptConsumed?: () => void;
};

type ChatAdvancedParams = Record<string, string | number | boolean | string[] | undefined>;

const categoryLabels: Record<ChatCategory, string> = {
  image: 'Фото',
  video: 'Видео',
};

function apiErrorMessage(error: unknown, fallback = 'Не удалось запустить генерацию') {
  return (error as { data?: { error?: { message?: string } } })?.data?.error?.message ?? fallback;
}

function defaultModel(category: ChatCategory): ChatModelOption {
  if (category === 'video') {
    return CHAT_MODELS.find((model) => model.category === 'video' && model.acceptsTextOnly) ?? CHAT_MODELS.find((model) => model.category === 'video') ?? CHAT_MODELS[0];
  }
  return CHAT_MODELS.find((model) => model.category === category) ?? CHAT_MODELS[0];
}

function compactModelTitle(title: string) {
  return title.replace(/\s*\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
}

function controlledAdvancedKeys(model: ChatModelOption) {
  return new Set([
    'aspect_ratio',
    'duration',
    'resolution',
    ...(model.audioParam ? [model.audioParam] : []),
  ]);
}

function visibleAdvancedParams(model: ChatModelOption) {
  const controlled = controlledAdvancedKeys(model);
  return model.advancedParams.filter((param) => !controlled.has(param.key));
}

function defaultAdvancedParams(model: ChatModelOption): ChatAdvancedParams {
  const defaults: ChatAdvancedParams = {};
  if (model.supportedResolutions.length > 0) {
    defaults.resolution = model.defaultResolution ?? model.supportedResolutions[0];
  }
  for (const param of visibleAdvancedParams(model)) {
    if (param.default !== undefined && param.default !== '') {
      defaults[param.key] = param.default;
    }
  }
  return defaults;
}

function normaliseAdvancedParams(params: ChatAdvancedParams) {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => {
      if (value === undefined || value === null || value === '') return false;
      if (Array.isArray(value)) return value.length > 0;
      return true;
    }),
  );
}

function missingAdvancedRequirement(model: ChatModelOption, params: Record<string, unknown>) {
  if (model.blockSlug === 'motion-transfer' && !params.video_url && !params.preset_motion) {
    return 'Нужен driving video или preset motion';
  }
  if (model.blockSlug === 'face-swap-video' && !params.target_video) {
    return 'Нужно target video';
  }
  return null;
}

function sourceListValue(value: ChatAdvancedParams[string]): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string' && item.length > 0);
  if (typeof value === 'string') return value.split(',').map((item) => item.trim()).filter(Boolean);
  return [];
}

function fileMediaKind(file: File): SelectedInputSource['mediaKind'] | null {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';
  const name = file.name.toLowerCase();
  if (/\.(jpe?g|png|webp)$/.test(name)) return 'image';
  if (/\.(mp4|mov)$/.test(name)) return 'video';
  if (/\.(mp3|wav|ogg)$/.test(name)) return 'audio';
  return null;
}

function modelAcceptsSource(model: ChatModelOption, mediaKind: SelectedInputSource['mediaKind']) {
  if (mediaKind === 'image') return model.acceptsImageInput;
  if (mediaKind === 'video') return model.acceptsVideoInput;
  return model.acceptsAudioInput;
}

function modelFamilies(models: ChatModelOption[]) {
  const map = new Map<string, { slug: string; title: string; models: ChatModelOption[] }>();
  for (const model of models) {
    const family = map.get(model.familySlug);
    if (family) {
      family.models.push(model);
    } else {
      map.set(model.familySlug, { slug: model.familySlug, title: model.familyTitle, models: [model] });
    }
  }
  return [...map.values()];
}

export function ChatForm({ chatId, onCreated, initialReference, initialPrompt, onReferenceConsumed, onPromptConsumed }: ChatFormProps) {
  const me = useGetMeQuery();
  const modelPricing = useGetChatModelsQuery();
  const [createMessage, createMessageState] = useCreateChatMessageMutation();
  const [uploadInput, uploadInputState] = useUploadChatInputMutation();
  const [category, setCategory] = useState<ChatCategory>('image');
  const [modelSlug, setModelSlug] = useState(defaultModel('image').slug);
  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState<ChatAspectRatio>('1:1');
  const [duration, setDuration] = useState(5);
  const [generateAudio, setGenerateAudio] = useState(false);
  const [source, setSource] = useState<SelectedInputSource | null>(null);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [isDraggingReference, setIsDraggingReference] = useState(false);
  const [advancedParams, setAdvancedParams] = useState<ChatAdvancedParams>(() => defaultAdvancedParams(defaultModel('image')));

  const models = useMemo(() => CHAT_MODELS.filter((model) => model.category === category), [category]);
  const selectedModel = models.find((model) => model.slug === modelSlug) ?? models[0] ?? CHAT_MODELS[0];
  const families = useMemo(() => modelFamilies(models), [models]);
  const selectedFamily = families.find((family) => family.slug === selectedModel.familySlug) ?? families[0];
  const familyModels = selectedFamily?.models ?? models;
  const cleanedAdvancedParams = useMemo(() => normaliseAdvancedParams(advancedParams), [advancedParams]);
  const missingAdvanced = missingAdvancedRequirement(selectedModel, cleanedAdvancedParams);
  const modelPriceOverrides = modelPricing.data?.modelPriceOverrides;
  const balance = me.data?.user.tokenBalance ?? 0;
  const effectiveGenerateAudio = selectedModel.supportsAudio && generateAudio;
  const estimatedCostCoins = estimateChatGenerationPriceCoins(selectedModel.slug, {
    duration: selectedModel.category === 'video' ? duration : undefined,
    generateAudio: effectiveGenerateAudio,
    params: cleanedAdvancedParams,
    priceOverrides: modelPriceOverrides,
  });
  const canPay = balance >= estimatedCostCoins;
  const needsInput = !selectedModel.acceptsTextOnly && (selectedModel.acceptsImageInput || selectedModel.acceptsVideoInput || selectedModel.acceptsAudioInput);
  const canUseInput = selectedModel.acceptsImageInput || selectedModel.acceptsVideoInput || selectedModel.acceptsAudioInput;
  const inputKind = selectedModel.acceptsImageInput ? 'image' : selectedModel.acceptsVideoInput ? 'video' : 'audio';
  const referenceUnsupported = !!source && (
    (source.mediaKind === 'image' && !selectedModel.acceptsImageInput) ||
    (source.mediaKind === 'video' && !selectedModel.acceptsVideoInput) ||
    (source.mediaKind === 'audio' && !selectedModel.acceptsAudioInput)
  );
  const canSubmit = prompt.trim().length > 0 && canPay && (!needsInput || !!source) && !referenceUnsupported && !missingAdvanced && !createMessageState.isLoading && !uploadInputState.isLoading;

  useEffect(() => {
    const next = defaultModel(category);
    setModelSlug(next.slug);
    setAspectRatio(next.supportedAspectRatios[0] ?? 'auto');
    setDuration(next.defaultDurationSec ?? next.durationOptions[0] ?? 5);
    setGenerateAudio(false);
    setSource(null);
    setSubmitAttempted(false);
    setAdvancedParams(defaultAdvancedParams(next));
  }, [category]);

  useEffect(() => {
    if (!selectedModel.supportedAspectRatios.includes(aspectRatio)) {
      setAspectRatio(selectedModel.supportedAspectRatios[0] ?? 'auto');
    }
    if (
      selectedModel.category === 'video'
      && (
        (selectedModel.minDurationSec !== undefined && duration < selectedModel.minDurationSec)
        || (selectedModel.maxDurationSec !== undefined && duration > selectedModel.maxDurationSec)
      )
    ) {
      setDuration(selectedModel.defaultDurationSec ?? selectedModel.durationOptions[0] ?? 5);
    }
    if (!selectedModel.supportsAudio && generateAudio) {
      setGenerateAudio(false);
    }
  }, [aspectRatio, duration, generateAudio, selectedModel]);

  useEffect(() => {
    setAdvancedParams(defaultAdvancedParams(selectedModel));
  }, [selectedModel]);

  useEffect(() => {
    if (!initialReference) return;
    setCategory('image');
    setModelSlug('nano-banana');
    setSource(initialReference);
    onReferenceConsumed();
  }, [initialReference, onReferenceConsumed]);

  useEffect(() => {
    if (!initialPrompt) return;
    setPrompt(initialPrompt);
    onPromptConsumed?.();
  }, [initialPrompt, onPromptConsumed]);

  const uploadReferenceFile = async (file: File) => {
    const mediaKind = fileMediaKind(file);
    if (!mediaKind) {
      toast({ title: 'Этот тип файла нельзя прикрепить как референс', variant: 'destructive' });
      return;
    }
    if (!canUseInput || !modelAcceptsSource(selectedModel, mediaKind)) {
      toast({ title: `Модель ${selectedModel.title} не принимает такой референс`, variant: 'destructive' });
      return;
    }
    const form = new FormData();
    form.append('file', file);
    try {
      const result = await uploadInput(form).unwrap();
      setSource({
        ref: result.input.ref,
        url: result.input.url,
        title: file.name,
        mediaKind: result.input.mediaKind,
        origin: 'upload',
      });
      toast({ title: 'Файл прикреплен' });
    } catch (error) {
      toast({ title: apiErrorMessage(error, 'Не удалось прикрепить файл'), variant: 'destructive' });
    }
  };

  const hasDraggedFiles = (event: DragEvent<HTMLDivElement>) => Array.from(event.dataTransfer.types).includes('Files');

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = canUseInput ? 'copy' : 'none';
    if (canUseInput) setIsDraggingReference(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
    setIsDraggingReference(false);
  };

  const handleDrop = async (event: DragEvent<HTMLDivElement>) => {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    setIsDraggingReference(false);
    const file = event.dataTransfer.files?.[0];
    if (file) await uploadReferenceFile(file);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) {
      setSubmitAttempted(true);
      return;
    }
    try {
      await createMessage({
        chatId,
        body: {
          modelSlug: selectedModel.slug,
          prompt,
          aspectRatio,
          duration: selectedModel.category === 'video' ? duration : undefined,
          generateAudio: selectedModel.category === 'video' ? effectiveGenerateAudio : undefined,
          inputRef: source?.ref,
          imageInputRef: source?.mediaKind === 'image' ? source.ref : undefined,
          videoInputRef: source?.mediaKind === 'video' ? source.ref : undefined,
          audioInputRef: source?.mediaKind === 'audio' ? source.ref : undefined,
          params: Object.keys(cleanedAdvancedParams).length > 0 ? cleanedAdvancedParams : undefined,
        },
      }).unwrap();
      toast({ title: 'Генерация запущена' });
      setPrompt('');
      setSubmitAttempted(false);
      if (!canUseInput) setSource(null);
      onCreated();
    } catch (error) {
      toast({ title: apiErrorMessage(error), variant: 'destructive' });
    }
  };

  const costText = `${estimatedCostCoins} токенов`;
  const submitHint = uploadInputState.isLoading
    ? 'Файл загружается'
    : referenceUnsupported
      ? 'Референс не подходит модели'
      : needsInput && !source
      ? 'Нужен референс'
      : missingAdvanced
        ? missingAdvanced
      : !canPay
        ? 'Недостаточно токенов'
        : submitAttempted && !prompt.trim()
          ? 'Добавьте промпт для запуска'
          : null;

  return (
    <form onSubmit={submit} className="mx-auto max-w-5xl">
      <div
        className={cn(
          'relative overflow-hidden rounded-lg border bg-slate-900 shadow-2xl shadow-black/20 transition',
          isDraggingReference ? 'border-violet-400 ring-2 ring-violet-500/35' : 'border-slate-800',
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {(source || referenceUnsupported || !canPay || selectedModel.experimental) && (
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 bg-slate-950/45 px-3 py-2">
            {source && (
              <div className="flex min-w-0 items-center gap-2 rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5">
                <div className="h-8 w-8 shrink-0 overflow-hidden rounded bg-slate-900">
                  {source.mediaKind === 'image' ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={source.url} alt="" className="h-full w-full object-cover" />
                  ) : source.mediaKind === 'video' ? (
                    <video src={source.url} className="h-full w-full object-cover" muted />
                  ) : (
                    <div className="grid h-full w-full place-items-center text-[9px] text-slate-400">AUDIO</div>
                  )}
                </div>
                <span className="max-w-[220px] truncate text-xs text-slate-200">{source.title}</span>
                <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => setSource(null)}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
            {referenceUnsupported && (
              <div className="flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-100">
                <AlertTriangle className="h-3.5 w-3.5" />
                <span>Модель {selectedModel.title} не принимает этот референс</span>
              </div>
            )}
            {!canPay && (
              <div className="rounded-md border border-red-500/40 bg-red-500/10 px-2.5 py-1.5 text-xs text-red-100">
                На балансе {balance}, нужно {estimatedCostCoins}
              </div>
            )}
            {selectedModel.experimental && <Badge className="bg-amber-500/15 text-amber-200">Бета</Badge>}
          </div>
        )}

        <div className="relative">
          <Textarea
            value={prompt}
            onChange={(event) => {
              setPrompt(event.target.value);
              if (submitAttempted) setSubmitAttempted(false);
            }}
            rows={2}
            placeholder="Опишите результат: сюжет, стиль, камера, настроение..."
            className="min-h-[82px] resize-none border-0 bg-transparent px-4 py-3 text-base leading-7 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
          />
          {(isDraggingReference || uploadInputState.isLoading) && (
            <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center bg-slate-950/80 px-4 backdrop-blur-sm">
              <div className="inline-flex items-center gap-2 rounded-md border border-violet-400/50 bg-violet-500/15 px-3 py-2 text-sm font-semibold text-violet-100">
                {uploadInputState.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
                {uploadInputState.isLoading ? 'Загружаем файл' : 'Отпустите файл, чтобы прикрепить'}
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-slate-800 px-3 py-2.5">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <CategoryControl category={category} onChange={setCategory} />
              <ModelFamilyControl
                selectedFamily={selectedFamily}
                families={families}
                onChange={(familySlug) => {
                  const next = families.find((family) => family.slug === familySlug);
                  if (next?.models[0]) setModelSlug(next.models[0].slug);
                }}
              />
              <ModelFunctionControl selectedModel={selectedModel} models={familyModels} duration={duration} priceOverrides={modelPriceOverrides} onChange={setModelSlug} />
              {canUseInput ? (
                <InputSourcePicker mediaKind={inputKind} value={source} required={needsInput} onChange={setSource} compact iconOnly />
              ) : (
                <Button type="button" variant="outline" size="icon" className="h-9 w-9 border-slate-700 bg-slate-950 text-slate-400" disabled title="Эта модель не принимает референсы" aria-label="Эта модель не принимает референсы">
                  <Paperclip className="h-4 w-4" />
                </Button>
              )}
            </div>

            <div className="flex w-full min-w-0 items-center gap-2 rounded-md border border-slate-800/80 bg-slate-950/55 px-2 py-1.5 md:w-auto md:max-w-[380px]">
              <DetailedSettingsControl
                model={selectedModel}
                category={category}
                aspectRatio={aspectRatio}
                duration={duration}
                generateAudio={effectiveGenerateAudio}
                advancedParams={advancedParams}
                onAspectRatioChange={setAspectRatio}
                onDurationChange={setDuration}
                onGenerateAudioChange={setGenerateAudio}
                onAdvancedParamsChange={setAdvancedParams}
              />
              <div className="min-w-0 flex-1 text-xs text-slate-500">
                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="inline-flex items-center gap-1.5">
                    <TokenIcon className={cn('h-4 w-4', canPay ? 'text-amber-300' : 'text-red-300')} />
                    <span className={canPay ? 'font-semibold text-amber-200' : 'font-semibold text-red-200'}>{costText}</span>
                  </span>
                  <span className="text-slate-600">Баланс {balance}</span>
                  {submitHint && (
                    <span className={cn('basis-full truncate', canPay ? 'text-slate-400' : 'text-red-200')}>{submitHint}</span>
                  )}
                </div>
              </div>
              <Button type="submit" disabled={!canSubmit} className="h-9 shrink-0 bg-amber-500 px-4 text-slate-950 hover:bg-amber-400">
                {createMessageState.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Создать
              </Button>
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}

function CategoryControl({ category, onChange }: { category: ChatCategory; onChange: (value: ChatCategory) => void }) {
  return (
    <div className="inline-grid h-9 grid-cols-2 rounded-md border border-slate-700 bg-slate-950 p-0.5">
      {(['image', 'video'] as const).map((item) => {
        const active = category === item;
        const Icon = item === 'image' ? ImageIcon : Video;
        return (
          <button
            key={item}
            type="button"
            onClick={() => onChange(item)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded px-3 text-sm font-medium transition',
              active ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-white',
            )}
          >
            <Icon className="h-4 w-4" />
            {categoryLabels[item]}
          </button>
        );
      })}
    </div>
  );
}

function ModelFamilyControl({
  selectedFamily,
  families,
  onChange,
}: {
  selectedFamily?: { slug: string; title: string; models: ChatModelOption[] };
  families: { slug: string; title: string; models: ChatModelOption[] }[];
  onChange: (value: string) => void;
}) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-9 max-w-[220px] border-slate-700 bg-slate-950">
          <Sparkles className="h-4 w-4 text-violet-300" />
          <span className="truncate">{selectedFamily?.title ?? 'Модель'}</span>
          <ChevronDown className="h-4 w-4 text-slate-500" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[min(92vw,320px)] border-slate-800 bg-slate-950 text-slate-100">
        <DropdownMenuLabel>Модель</DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-slate-800" />
        <DropdownMenuRadioGroup value={selectedFamily?.slug} onValueChange={onChange}>
          {families.map((family) => (
            <DropdownMenuRadioItem key={family.slug} value={family.slug} className="items-start gap-3 py-2 focus:bg-slate-900">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{family.title}</span>
                  <span className="text-xs text-slate-500">{family.models.length} функций</span>
                </div>
              </div>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ModelFunctionControl({
  selectedModel,
  models,
  duration,
  priceOverrides,
  onChange,
}: {
  selectedModel: ChatModelOption;
  models: ChatModelOption[];
  duration: number;
  priceOverrides?: Record<string, number>;
  onChange: (value: string) => void;
}) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-9 max-w-[260px] border-slate-700 bg-slate-950">
          <Sparkles className="h-4 w-4 text-violet-300" />
          <span className="truncate">{selectedModel.functionTitle || compactModelTitle(selectedModel.title)}</span>
          <ChevronDown className="h-4 w-4 text-slate-500" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[min(92vw,420px)] border-slate-800 bg-slate-950 text-slate-100">
        <DropdownMenuLabel>Функция модели</DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-slate-800" />
        <DropdownMenuRadioGroup value={selectedModel.slug} onValueChange={onChange}>
          {models.map((model) => (
            <DropdownMenuRadioItem key={model.slug} value={model.slug} className="items-start gap-3 py-2 focus:bg-slate-900">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{model.functionTitle || compactModelTitle(model.title)}</span>
                  <span className="text-xs text-amber-300">
                    от {estimateChatGenerationPriceCoins(model.slug, { duration: model.defaultDurationSec ?? duration, priceOverrides })} токенов
                  </span>
                  {model.experimental && <span className="text-xs text-amber-200">бета</span>}
                </div>
                <div className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{model.functionDescription || model.description}</div>
              </div>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const advancedSectionsMeta = {
  references: {
    title: 'Референсы',
    description: 'Дополнительные изображения, видео или аудио, которые PiAPI принимает именно для выбранной функции.',
  },
  quality: {
    title: 'Качество',
    description: 'Настройки разрешения, кадров, seed и стоимости результата.',
  },
  motion: {
    title: 'Движение',
    description: 'Управление камерой, движением, preset motion и shot list.',
  },
  audio: {
    title: 'Аудио',
    description: 'Опции генерации, сохранения или передачи звука, если модель это поддерживает.',
  },
  prompt: {
    title: 'Промпт',
    description: 'Ограничения, negative prompt и расширение промпта.',
  },
} as const;

type AdvancedSectionKey = keyof typeof advancedSectionsMeta;

function advancedSectionForParam(param: PiAPIParamCapability): AdvancedSectionKey {
  if (param.kind === 'source-list' || ['image_urls', 'video_urls', 'audio_urls', 'images', 'video', 'video_url', 'target_video', 'tail_image_url'].includes(param.key)) return 'references';
  if (param.key.includes('audio') || param.key.includes('sound')) return 'audio';
  if (['camera_control', 'shot_type', 'preset_motion', 'motion_direction', 'prefer_multi_shots', 'multi_shots'].includes(param.key)) return 'motion';
  if (['resolution', 'quality', 'seed', 'estimatedFrames'].includes(param.key)) return 'quality';
  return 'prompt';
}

function DetailedSettingsControl({
  model,
  category,
  aspectRatio,
  duration,
  generateAudio,
  advancedParams,
  onAspectRatioChange,
  onDurationChange,
  onGenerateAudioChange,
  onAdvancedParamsChange,
}: {
  model: ChatModelOption;
  category: ChatCategory;
  aspectRatio: ChatAspectRatio;
  duration: number;
  generateAudio: boolean;
  advancedParams: ChatAdvancedParams;
  onAspectRatioChange: (value: ChatAspectRatio) => void;
  onDurationChange: (value: number) => void;
  onGenerateAudioChange: (value: boolean) => void;
  onAdvancedParamsChange: (value: ChatAdvancedParams) => void;
}) {
  const params = visibleAdvancedParams(model);
  const update = (key: string, next: ChatAdvancedParams[string]) => onAdvancedParamsChange({ ...advancedParams, [key]: next });
  const sections = (Object.keys(advancedSectionsMeta) as AdvancedSectionKey[])
    .map((key) => ({ key, params: params.filter((param) => advancedSectionForParam(param) === key) }))
    .filter((section) => section.params.length > 0);
  const resolutionValue = typeof advancedParams.resolution === 'string'
    ? advancedParams.resolution
    : model.defaultResolution ?? model.supportedResolutions[0] ?? '';
  const durationValues = model.durationOptions.length > 0
    ? model.durationOptions
    : [model.defaultDurationSec ?? duration].filter((item): item is number => Number.isFinite(item));
  const durationMin = model.minDurationSec ?? (durationValues.length ? Math.min(...durationValues) : 1);
  const durationMax = model.maxDurationSec ?? (durationValues.length ? Math.max(...durationValues) : 30);
  const AudioIcon = generateAudio ? Volume2 : VolumeX;

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="icon" className="h-9 w-9 border-slate-700 bg-slate-950 text-slate-100 hover:border-violet-500 hover:bg-slate-950" title="Детальные настройки" aria-label="Детальные настройки">
          <Settings2 className="h-4 w-4 text-slate-400" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        side="top"
        sideOffset={8}
        className="max-h-[calc(100dvh-2rem)] w-[min(92vw,560px)] space-y-3 overflow-y-auto border-slate-800 bg-slate-950 p-4 text-slate-100 shadow-2xl shadow-black/40"
      >
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{compactModelTitle(model.title)}</div>
          <div className="mt-1 text-sm font-semibold text-white">{model.functionTitle || compactModelTitle(model.title)}</div>
        </div>
        <div className="rounded-md border border-slate-800 bg-slate-900/60 p-3">
          <div className="mb-3 text-sm font-semibold text-slate-100">Основные параметры</div>
          <div className="grid gap-3 md:grid-cols-2">
            {model.supportedAspectRatios.length > 0 && (
              <label className="space-y-1 text-sm text-slate-100">
                <span className="inline-flex items-center gap-2">
                  <Frame className="h-4 w-4 text-slate-500" />
                  Формат
                </span>
                <select
                  value={aspectRatio}
                  onChange={(event) => onAspectRatioChange(event.target.value as ChatAspectRatio)}
                  className="h-9 w-full rounded-md border border-slate-700 bg-slate-900 px-3 text-sm"
                >
                  {model.supportedAspectRatios.map((ratio) => (
                    <option key={ratio} value={ratio}>{ratio}</option>
                  ))}
                </select>
              </label>
            )}
            {category === 'video' && (
              <label className="space-y-1 text-sm text-slate-100">
                <span className="inline-flex items-center gap-2">
                  <Clock3 className="h-4 w-4 text-slate-500" />
                  Длительность
                </span>
                {durationValues.length > 1 ? (
                  <select
                    value={String(duration)}
                    onChange={(event) => onDurationChange(Number(event.target.value))}
                    className="h-9 w-full rounded-md border border-slate-700 bg-slate-900 px-3 text-sm"
                  >
                    {durationValues.map((item) => (
                      <option key={item} value={item}>{item} сек</option>
                    ))}
                  </select>
                ) : (
                  <Input
                    type="number"
                    min={durationMin}
                    max={durationMax}
                    step={1}
                    value={duration}
                    onChange={(event) => {
                      const next = Number(event.target.value);
                      if (Number.isFinite(next)) onDurationChange(Math.min(durationMax, Math.max(durationMin, Math.round(next))));
                    }}
                    className="h-9 border-slate-700 bg-slate-900"
                  />
                )}
              </label>
            )}
            {model.supportedResolutions.length > 0 && (
              <label className="space-y-1 text-sm text-slate-100">
                <span className="inline-flex items-center gap-2">
                  <Video className="h-4 w-4 text-slate-500" />
                  Качество
                </span>
                <select
                  value={resolutionValue}
                  onChange={(event) => update('resolution', event.target.value)}
                  className="h-9 w-full rounded-md border border-slate-700 bg-slate-900 px-3 text-sm"
                >
                  {model.supportedResolutions.map((resolution) => (
                    <option key={resolution} value={resolution}>{resolution}</option>
                  ))}
                </select>
              </label>
            )}
            {category === 'video' && (
              <div className="space-y-1 text-sm text-slate-100">
                <span>Аудио</span>
                <Button
                  type="button"
                  variant="outline"
                  className={cn(
                    'h-9 w-full justify-start border-slate-700 bg-slate-900',
                    generateAudio && 'border-emerald-500/60 bg-emerald-500/10 text-emerald-100',
                    !model.supportsAudio && 'text-slate-500',
                  )}
                  disabled={!model.supportsAudio}
                  onClick={() => onGenerateAudioChange(!generateAudio)}
                >
                  <AudioIcon className="h-4 w-4" />
                  {model.supportsAudio ? (generateAudio ? 'Со звуком' : 'Без звука') : 'Недоступно'}
                </Button>
              </div>
            )}
          </div>
        </div>
        {sections.map((section) => {
          const meta = advancedSectionsMeta[section.key];
          return (
            <div key={section.key} className="rounded-md border border-slate-800 bg-slate-900/60 p-3">
              <div className="mb-3">
                <div className="text-sm font-semibold text-slate-100">{meta.title}</div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {section.params.map((param) => (
                  <AdvancedParamField
                    key={param.key}
                    param={param}
                    value={advancedParams[param.key]}
                    onChange={(next) => update(param.key, next)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AdvancedParamField({
  param,
  value,
  onChange,
}: {
  param: PiAPIParamCapability;
  value: ChatAdvancedParams[string];
  onChange: (value: ChatAdvancedParams[string]) => void;
}) {
  if (param.kind === 'boolean') {
    return (
      <label className="flex items-center gap-3 rounded-md border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(event) => onChange(event.target.checked)}
          className="h-4 w-4"
        />
        <span className="min-w-0 flex-1">{param.title}</span>
      </label>
    );
  }

  if (param.kind === 'select') {
    const selected = typeof value === 'string' || typeof value === 'number' ? String(value) : String(param.default ?? '');
    return (
      <label className="space-y-1 text-sm text-slate-100">
        <span>{param.title}</span>
        <select
          value={selected}
          onChange={(event) => onChange(event.target.value)}
          className="h-9 w-full rounded-md border border-slate-700 bg-slate-900 px-3 text-sm"
        >
          {(param.options ?? []).map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>
    );
  }

  if (param.kind === 'number') {
    return (
      <label className="space-y-1 text-sm text-slate-100">
        <span>{param.title}</span>
        <Input
          type="number"
          min={param.minimum}
          max={param.maximum}
          value={typeof value === 'number' || typeof value === 'string' ? value : ''}
          onChange={(event) => onChange(event.target.value === '' ? undefined : Number(event.target.value))}
          className="h-9 border-slate-700 bg-slate-900"
        />
      </label>
    );
  }

  if (param.kind === 'source-list') {
    const items = sourceListValue(value);
    const mediaKind = param.mediaKind ?? 'image';
    return (
      <div className="space-y-2 text-sm text-slate-100 md:col-span-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>{param.title}</span>
          <InputSourcePicker
            mediaKind={mediaKind}
            value={null}
            compact
            onChange={(selected) => {
              if (!selected) return;
              onChange(param.multiple ? [...items, selected.ref] : selected.ref);
            }}
          />
        </div>
        <Input
          value={items.join(', ')}
          onChange={(event) => onChange(param.multiple ? sourceListValue(event.target.value) : event.target.value)}
          className="h-9 border-slate-700 bg-slate-900 font-mono text-xs"
          placeholder="asset:id, chat:key, result:id, https://..."
        />
        {items.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {items.map((item) => (
              <button
                key={item}
                type="button"
                className="max-w-[220px] truncate rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-300"
                onClick={() => onChange(param.multiple ? items.filter((current) => current !== item) : undefined)}
              >
                {item}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  const isLong = param.kind === 'textarea';
  return (
    <label className={cn('space-y-1 text-sm text-slate-100', isLong && 'md:col-span-2')}>
      <span>{param.title}</span>
      {isLong ? (
        <Textarea
          value={typeof value === 'string' ? value : ''}
          rows={3}
          onChange={(event) => onChange(event.target.value)}
          className="border-slate-700 bg-slate-900"
        />
      ) : (
        <Input
          value={typeof value === 'string' || typeof value === 'number' ? value : ''}
          onChange={(event) => onChange(event.target.value)}
          className="h-9 border-slate-700 bg-slate-900"
        />
      )}
    </label>
  );
}
