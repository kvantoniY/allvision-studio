'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Loader2, Send, Sparkles } from 'lucide-react';
import { CHAT_MODELS, type ChatCategory, type ChatModelOption } from '@allvision/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useGetMeQuery } from '@/store/api/auth-api';
import { useGenerateChatMutation } from '@/store/api/user-chat-api';
import { InputSourcePicker, type SelectedInputSource } from './InputSourcePicker';

type ChatFormProps = {
  onCreated: (projectId: string) => void;
  initialReference: SelectedInputSource | null;
  onReferenceConsumed: () => void;
};

const categoryLabels: Record<ChatCategory, string> = {
  image: 'Фото',
  video: 'Видео',
};

function apiErrorMessage(error: unknown) {
  return (error as { data?: { error?: { message?: string } } })?.data?.error?.message ?? 'Не удалось запустить генерацию';
}

function defaultModel(category: ChatCategory): ChatModelOption {
  return CHAT_MODELS.find((model) => model.category === category) ?? CHAT_MODELS[0];
}

export function ChatForm({ onCreated, initialReference, onReferenceConsumed }: ChatFormProps) {
  const me = useGetMeQuery();
  const [generate, generateState] = useGenerateChatMutation();
  const [category, setCategory] = useState<ChatCategory>('image');
  const [modelSlug, setModelSlug] = useState(defaultModel('image').slug);
  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState<'1:1' | '9:16' | '16:9' | 'auto'>('1:1');
  const [duration, setDuration] = useState(5);
  const [source, setSource] = useState<SelectedInputSource | null>(null);

  const models = useMemo(() => CHAT_MODELS.filter((model) => model.category === category), [category]);
  const selectedModel = models.find((model) => model.slug === modelSlug) ?? models[0] ?? CHAT_MODELS[0];
  const balance = me.data?.user.tokenBalance ?? 0;
  const canPay = balance >= selectedModel.estimatedCostCoins;
  const needsInput = !selectedModel.acceptsTextOnly && selectedModel.acceptsImageInput;
  const canUseInput = selectedModel.acceptsImageInput || selectedModel.acceptsVideoInput;
  const inputKind = selectedModel.acceptsVideoInput && !selectedModel.acceptsImageInput ? 'video' : 'image';
  const canSubmit = prompt.trim().length > 0 && canPay && (!needsInput || !!source) && !generateState.isLoading;

  useEffect(() => {
    const next = defaultModel(category);
    setModelSlug(next.slug);
    setAspectRatio(next.supportedAspectRatios[0] ?? 'auto');
    setSource(null);
  }, [category]);

  useEffect(() => {
    if (!selectedModel.supportedAspectRatios.includes(aspectRatio)) {
      setAspectRatio(selectedModel.supportedAspectRatios[0] ?? 'auto');
    }
  }, [aspectRatio, selectedModel]);

  useEffect(() => {
    if (!initialReference) return;
    setCategory('image');
    setModelSlug('nano-banana');
    setSource(initialReference);
    onReferenceConsumed();
  }, [initialReference, onReferenceConsumed]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    try {
      const result = await generate({
        modelSlug: selectedModel.slug,
        prompt,
        aspectRatio,
        duration: selectedModel.category === 'video' ? duration : undefined,
        imageInputRef: source?.mediaKind === 'image' ? source.ref : undefined,
        videoInputRef: source?.mediaKind === 'video' ? source.ref : undefined,
      }).unwrap();
      toast({ title: 'Генерация запущена' });
      setPrompt('');
      if (!selectedModel.acceptsImageInput) setSource(null);
      onCreated(result.projectId);
    } catch (error) {
      toast({ title: apiErrorMessage(error), variant: 'destructive' });
    }
  };

  return (
    <Card className="border-slate-800 bg-slate-900">
      <CardContent className="p-4">
        <form onSubmit={submit} className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {(['image', 'video'] as const).map((item) => (
              <Button
                key={item}
                type="button"
                variant={category === item ? 'default' : 'outline'}
                onClick={() => setCategory(item)}
                className={cn(category === item && 'bg-violet-600 hover:bg-violet-500')}
              >
                {item === 'image' ? <Sparkles className="h-4 w-4" /> : null}
                {categoryLabels[item]}
              </Button>
            ))}
          </div>

          <div className="grid gap-3 lg:grid-cols-[1fr_0.6fr]">
            <div className="space-y-2">
              <Label>Модель</Label>
              <select
                value={selectedModel.slug}
                onChange={(event) => setModelSlug(event.target.value)}
                className="h-11 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100"
              >
                {models.map((model) => (
                  <option key={model.slug} value={model.slug}>
                    {model.title} · {model.estimatedCostCoins} коинов{model.experimental ? ' · бета' : ''}
                  </option>
                ))}
              </select>
              <p className="text-xs leading-5 text-slate-500">{selectedModel.description}</p>
            </div>
            <div className="rounded-md border border-slate-800 bg-slate-950 p-3 text-sm text-slate-300">
              <div className="flex items-center justify-between gap-3">
                <span>Стоимость</span>
                <span className="font-semibold text-amber-300">{selectedModel.estimatedCostCoins} коинов · ~{selectedModel.estimatedCostCoins} ₽</span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <span>Баланс</span>
                <span className={canPay ? 'text-emerald-300' : 'text-red-300'}>
                  {balance} коинов · {canPay ? 'хватит' : 'не хватает'}
                </span>
              </div>
              {selectedModel.experimental && <Badge className="mt-3 bg-amber-500/15 text-amber-200">Бета</Badge>}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Промпт</Label>
            <Textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              rows={4}
              placeholder="Опишите сцену, стиль, камеру, настроение и важные ограничения..."
              className="resize-none bg-slate-950"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_0.7fr]">
            <div className="space-y-2">
              <Label>Соотношение сторон</Label>
              <div className="flex flex-wrap gap-2">
                {selectedModel.supportedAspectRatios.map((ratio) => (
                  <Button
                    key={ratio}
                    type="button"
                    variant={aspectRatio === ratio ? 'default' : 'outline'}
                    onClick={() => setAspectRatio(ratio)}
                    className={cn(aspectRatio === ratio && 'bg-violet-600 hover:bg-violet-500')}
                  >
                    {ratio}
                  </Button>
                ))}
              </div>
            </div>
            {category === 'video' && (
              <div className="space-y-2">
                <Label>Длительность</Label>
                <div className="flex gap-2">
                  {[5, 10].map((item) => (
                    <Button
                      key={item}
                      type="button"
                      variant={duration === item ? 'default' : 'outline'}
                      onClick={() => setDuration(item)}
                      className={cn(duration === item && 'bg-violet-600 hover:bg-violet-500')}
                    >
                      {item} сек
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {canUseInput ? (
            <InputSourcePicker mediaKind={inputKind} value={source} required={needsInput} onChange={setSource} />
          ) : (
            <div className="rounded-md border border-slate-800 bg-slate-950 p-3 text-sm text-slate-500">
              Эта модель работает только с текстовым промптом, референс не нужен.
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-slate-500">
              {!prompt.trim() ? 'Напишите промпт.' : needsInput && !source ? 'Прикрепите изображение для этой модели.' : canPay ? 'Можно запускать.' : 'Недостаточно коинов.'}
            </div>
            <Button type="submit" disabled={!canSubmit} className="bg-amber-500 text-slate-950 hover:bg-amber-400">
              {generateState.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Создать
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
