'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { AlertTriangle, ChevronDown, Clock3, Frame, ImageIcon, Loader2, Paperclip, Send, Sparkles, Video, Volume2, VolumeX, X } from 'lucide-react';
import { CHAT_MODELS, estimateChatGenerationCostCoins, type ChatCategory, type ChatModelOption } from '@allvision/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { TokenIcon } from '@/components/ui/token-icon';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useGetMeQuery } from '@/store/api/auth-api';
import { useCreateChatMessageMutation } from '@/store/api/user-chat-api';
import { InputSourcePicker, type SelectedInputSource } from './InputSourcePicker';

type ChatFormProps = {
  chatId: string;
  onCreated: () => void;
  initialReference: SelectedInputSource | null;
  initialPrompt?: string;
  onReferenceConsumed: () => void;
  onPromptConsumed?: () => void;
};

const categoryLabels: Record<ChatCategory, string> = {
  image: 'Фото',
  video: 'Видео',
};

function apiErrorMessage(error: unknown) {
  return (error as { data?: { error?: { message?: string } } })?.data?.error?.message ?? 'Не удалось запустить генерацию';
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

export function ChatForm({ chatId, onCreated, initialReference, initialPrompt, onReferenceConsumed, onPromptConsumed }: ChatFormProps) {
  const me = useGetMeQuery();
  const [createMessage, createMessageState] = useCreateChatMessageMutation();
  const [category, setCategory] = useState<ChatCategory>('image');
  const [modelSlug, setModelSlug] = useState(defaultModel('image').slug);
  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState<'1:1' | '9:16' | '16:9' | 'auto'>('1:1');
  const [duration, setDuration] = useState(5);
  const [generateAudio, setGenerateAudio] = useState(false);
  const [source, setSource] = useState<SelectedInputSource | null>(null);

  const models = useMemo(() => CHAT_MODELS.filter((model) => model.category === category), [category]);
  const selectedModel = models.find((model) => model.slug === modelSlug) ?? models[0] ?? CHAT_MODELS[0];
  const balance = me.data?.user.tokenBalance ?? 0;
  const effectiveGenerateAudio = selectedModel.supportsAudio && generateAudio;
  const estimatedCostCoins = estimateChatGenerationCostCoins(selectedModel.slug, {
    duration: selectedModel.category === 'video' ? duration : undefined,
    generateAudio: effectiveGenerateAudio,
  });
  const canPay = balance >= estimatedCostCoins;
  const needsInput = !selectedModel.acceptsTextOnly && selectedModel.acceptsImageInput;
  const canUseInput = selectedModel.acceptsImageInput || selectedModel.acceptsVideoInput;
  const inputKind = selectedModel.acceptsVideoInput && !selectedModel.acceptsImageInput ? 'video' : 'image';
  const referenceUnsupported = !!source && (
    (source.mediaKind === 'image' && !selectedModel.acceptsImageInput) ||
    (source.mediaKind === 'video' && !selectedModel.acceptsVideoInput)
  );
  const canSubmit = prompt.trim().length > 0 && canPay && (!needsInput || !!source) && !referenceUnsupported && !createMessageState.isLoading;

  useEffect(() => {
    const next = defaultModel(category);
    setModelSlug(next.slug);
    setAspectRatio(next.supportedAspectRatios[0] ?? 'auto');
    setDuration(next.defaultDurationSec ?? next.durationOptions[0] ?? 5);
    setGenerateAudio(false);
    setSource(null);
  }, [category]);

  useEffect(() => {
    if (!selectedModel.supportedAspectRatios.includes(aspectRatio)) {
      setAspectRatio(selectedModel.supportedAspectRatios[0] ?? 'auto');
    }
    if (selectedModel.category === 'video' && !selectedModel.durationOptions.includes(duration)) {
      setDuration(selectedModel.defaultDurationSec ?? selectedModel.durationOptions[0] ?? 5);
    }
    if (!selectedModel.supportsAudio && generateAudio) {
      setGenerateAudio(false);
    }
  }, [aspectRatio, duration, generateAudio, selectedModel]);

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

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
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
        },
      }).unwrap();
      toast({ title: 'Генерация запущена' });
      setPrompt('');
      if (!selectedModel.acceptsImageInput) setSource(null);
      onCreated();
    } catch (error) {
      toast({ title: apiErrorMessage(error), variant: 'destructive' });
    }
  };

  const statusText = !prompt.trim()
    ? 'Напишите промпт'
    : referenceUnsupported
      ? 'Референс не подходит модели'
      : needsInput && !source
        ? 'Нужен референс'
        : canPay
          ? `${estimatedCostCoins} токенов`
          : 'Недостаточно токенов';

  return (
    <form onSubmit={submit} className="mx-auto max-w-5xl">
      <div className="overflow-hidden rounded-lg border border-slate-800 bg-slate-900 shadow-2xl shadow-black/20">
        {(source || referenceUnsupported || !canPay || selectedModel.experimental) && (
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 bg-slate-950/45 px-3 py-2">
            {source && (
              <div className="flex min-w-0 items-center gap-2 rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5">
                <div className="h-8 w-8 shrink-0 overflow-hidden rounded bg-slate-900">
                  {source.mediaKind === 'image' ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={source.url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <video src={source.url} className="h-full w-full object-cover" muted />
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

        <Textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          rows={2}
          placeholder="Опишите результат: сюжет, стиль, камера, настроение..."
          className="min-h-[76px] resize-none border-0 bg-transparent px-4 py-3 text-base leading-7 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
        />

        <div className="flex flex-col gap-3 border-t border-slate-800 px-3 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <CategoryControl category={category} onChange={setCategory} />
            <ModelControl selectedModel={selectedModel} models={models} onChange={setModelSlug} />
            <AspectControl
              value={aspectRatio}
              values={selectedModel.supportedAspectRatios}
              onChange={(value) => setAspectRatio(value as typeof aspectRatio)}
            />
            {category === 'video' && <DurationControl value={duration} values={selectedModel.durationOptions} onChange={setDuration} />}
            {category === 'video' && (
              <AudioControl
                enabled={effectiveGenerateAudio}
                supported={selectedModel.supportsAudio}
                onChange={setGenerateAudio}
              />
            )}
            {canUseInput ? (
              <InputSourcePicker mediaKind={inputKind} value={source} required={needsInput} onChange={setSource} compact />
            ) : (
              <Button type="button" variant="outline" size="sm" className="h-9 border-slate-700 bg-slate-950 text-slate-400" disabled>
                <Paperclip className="h-4 w-4" />
                Без референса
              </Button>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 lg:justify-end">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <TokenIcon className={cn('h-4 w-4', canPay ? 'text-amber-300' : 'text-red-300')} />
              <span className={canPay ? 'text-slate-400' : 'text-red-200'}>{statusText}</span>
              <span className="hidden text-slate-600 sm:inline">Баланс {balance}</span>
            </div>
            <Button type="submit" disabled={!canSubmit} className="h-10 bg-amber-500 px-4 text-slate-950 hover:bg-amber-400">
              {createMessageState.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Создать
            </Button>
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

function ModelControl({
  selectedModel,
  models,
  onChange,
}: {
  selectedModel: ChatModelOption;
  models: ChatModelOption[];
  onChange: (value: string) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-9 max-w-[260px] border-slate-700 bg-slate-950">
          <Sparkles className="h-4 w-4 text-violet-300" />
          <span className="truncate">{compactModelTitle(selectedModel.title)}</span>
          <ChevronDown className="h-4 w-4 text-slate-500" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[min(92vw,420px)] border-slate-800 bg-slate-950 text-slate-100">
        <DropdownMenuLabel>Модель</DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-slate-800" />
        <DropdownMenuRadioGroup value={selectedModel.slug} onValueChange={onChange}>
          {models.map((model) => (
            <DropdownMenuRadioItem key={model.slug} value={model.slug} className="items-start gap-3 py-2 focus:bg-slate-900">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{model.title}</span>
                  <span className="text-xs text-amber-300">
                    от {estimateChatGenerationCostCoins(model.slug, { duration: model.defaultDurationSec })} токенов
                  </span>
                  {model.experimental && <span className="text-xs text-amber-200">бета</span>}
                </div>
                <div className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{model.description}</div>
              </div>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AspectControl({
  value,
  values,
  onChange,
}: {
  value: string;
  values: string[];
  onChange: (value: string) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-9 border-slate-700 bg-slate-950">
          <Frame className="h-4 w-4 text-slate-400" />
          {value}
          <ChevronDown className="h-4 w-4 text-slate-500" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="border-slate-800 bg-slate-950 text-slate-100">
        <DropdownMenuLabel>Формат</DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-slate-800" />
        <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
          {values.map((ratio) => (
            <DropdownMenuRadioItem key={ratio} value={ratio} className="focus:bg-slate-900">
              {ratio}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DurationControl({ value, values, onChange }: { value: number; values: number[]; onChange: (value: number) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-9 border-slate-700 bg-slate-950">
          <Clock3 className="h-4 w-4 text-slate-400" />
          {value} сек
          <ChevronDown className="h-4 w-4 text-slate-500" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="border-slate-800 bg-slate-950 text-slate-100">
        <DropdownMenuLabel>Длительность</DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-slate-800" />
        {values.map((item) => (
          <DropdownMenuItem key={item} className="focus:bg-slate-900" onClick={() => onChange(item)}>
            {item} секунд
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AudioControl({
  enabled,
  supported,
  onChange,
}: {
  enabled: boolean;
  supported: boolean;
  onChange: (value: boolean) => void;
}) {
  const Icon = enabled ? Volume2 : VolumeX;
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={cn(
        'h-9 border-slate-700 bg-slate-950',
        enabled && 'border-emerald-500/60 bg-emerald-500/10 text-emerald-100',
        !supported && 'text-slate-500',
      )}
      disabled={!supported}
      aria-pressed={enabled}
      title={supported ? 'Включить или выключить генерацию звука' : 'Эта модель не генерирует звук'}
      onClick={() => onChange(!enabled)}
    >
      <Icon className="h-4 w-4" />
      {supported ? (enabled ? 'Со звуком' : 'Без звука') : 'Звук недоступен'}
    </Button>
  );
}
