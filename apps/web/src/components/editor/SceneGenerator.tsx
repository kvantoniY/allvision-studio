'use client';

import { useMemo, useState } from 'react';
import { Loader2, Sparkles, Wand2 } from 'lucide-react';
import {
  CHAT_MODELS,
  SCENE_PRESETS,
  SCENE_PRESET_GROUPS,
  SCENE_PRESET_GROUP_TITLES,
  estimateChatGenerationPriceCoins,
  formatTokens,
  primaryMediaLayer,
  type ChatAspectRatio,
  type TimelineAspect,
  type TimelineScene,
} from '@allvision/shared';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useGetChatModelsQuery } from '@/store/api/user-chat-api';
import { cn } from '@/lib/utils';

/**
 * Панель генерации внутри сцены.
 *
 * Список моделей сознательно сужен до тех, что подходят сцене: если в сцене уже лежит
 * кадр — предлагаем оживить именно его, если пусто — генерацию с нуля. Показывать модель,
 * которая не сможет отработать, значит продавать ошибку.
 */

const DURATION_OPTIONS = [5, 8, 10];

export type SceneGenerationRequest = {
  modelSlug: string;
  prompt: string;
  aspectRatio: ChatAspectRatio;
  duration?: number;
  imageInputRef?: string;
};

function aspectForTimeline(aspect: TimelineAspect): ChatAspectRatio {
  // 4:5 у моделей нет — берём ближайшую вертикаль, иначе провайдер вернёт ошибку формата.
  if (aspect === '4:5') return '9:16';
  return aspect as ChatAspectRatio;
}

export function SceneGenerator({
  scene,
  aspect,
  balance,
  running,
  onGenerate,
}: {
  scene: TimelineScene;
  aspect: TimelineAspect;
  balance: number;
  running: boolean;
  onGenerate: (request: SceneGenerationRequest) => void;
}) {
  // Референсом в генерацию идёт главный слой сцены — тот, что видно на миниатюре.
  const primary = primaryMediaLayer(scene);
  const hasImage = primary?.source.kind === 'image' && Boolean(primary.source.url);
  // Оверрайды цен живут в БД и работают как минимум: без них редактор показывал бы
  // цену ниже той, что спишет сервер.
  const { data: pricing } = useGetChatModelsQuery();
  const [prompt, setPrompt] = useState('');
  const [duration, setDuration] = useState(5);
  const [modelSlug, setModelSlug] = useState<string | null>(null);

  const models = useMemo(() => {
    return CHAT_MODELS.filter((model) => {
      if (model.experimental) return false;
      // Кадр в сцене — это референс: подходят модели, умеющие принимать изображение.
      if (hasImage) return model.acceptsImageInput;
      return model.acceptsTextOnly;
    });
  }, [hasImage]);

  const model = useMemo(
    () => models.find((item) => item.slug === modelSlug) ?? models[0],
    [models, modelSlug],
  );

  const isVideo = model?.category === 'video';
  const price = useMemo(() => {
    if (!model) return 0;
    return estimateChatGenerationPriceCoins(model.slug, {
      duration: isVideo ? duration : undefined,
      priceOverrides: pricing?.modelPriceOverrides,
    });
  }, [model, isVideo, duration, pricing?.modelPriceOverrides]);

  const presets = useMemo(
    () => SCENE_PRESETS.filter((preset) => (preset.needsPhoto ? hasImage : true)),
    [hasImage],
  );

  const enoughCoins = balance >= price;
  const canGenerate = Boolean(model) && !running && enoughCoins && (!model?.requiresPrompt || prompt.trim().length > 0);

  return (
    <section className="space-y-4 rounded-xl border border-violet-500/30 bg-violet-500/5 p-4">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-violet-300" />
        <h3 className="font-semibold text-slate-100">Сгенерировать нейросетью</h3>
      </div>

      <p className="text-xs leading-5 text-slate-400">
        {hasImage
          ? 'Кадр из этой сцены станет референсом — нейросеть оживит именно его.'
          : 'В сцене пока нет материала, поэтому генерация пойдёт по одному описанию.'}
      </p>

      <div className="space-y-2">
        <Label className="text-xs">Готовые сцены</Label>
        <div className="space-y-2">
          {SCENE_PRESET_GROUPS.map((group) => {
            const items = presets.filter((preset) => preset.group === group);
            if (items.length === 0) return null;
            return (
              <div key={group}>
                <div className="mb-1 text-[11px] uppercase tracking-wide text-slate-500">
                  {SCENE_PRESET_GROUP_TITLES[group]}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {items.map((preset) => (
                    <button
                      key={preset.code}
                      type="button"
                      title={preset.description}
                      onClick={() => setPrompt(preset.prompt)}
                      className="rounded-full border border-slate-700 bg-slate-900/60 px-3 py-1 text-xs text-slate-300 transition hover:border-violet-400/60 hover:text-white"
                    >
                      {preset.title}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-xs" htmlFor="scene-prompt">
          Описание сцены
        </Label>
        <Textarea
          id="scene-prompt"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          rows={3}
          placeholder="Что должно происходить в кадре"
          className="text-sm"
        />
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs text-slate-400">
          Модель
          <select
            value={model?.slug ?? ''}
            onChange={(event) => setModelSlug(event.target.value)}
            className="mt-1 h-9 w-full rounded-md border border-slate-700 bg-slate-900 px-2 text-sm text-slate-100"
          >
            {models.map((item) => (
              <option key={item.slug} value={item.slug}>
                {item.title}
              </option>
            ))}
          </select>
        </label>

        {isVideo && (
          <label className="text-xs text-slate-400">
            Длительность
            <div className="mt-1 flex gap-1.5">
              {DURATION_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setDuration(option)}
                  className={cn(
                    'h-9 flex-1 rounded-md border text-sm transition',
                    duration === option
                      ? 'border-violet-400 bg-violet-500/20 text-violet-100'
                      : 'border-slate-700 text-slate-300 hover:border-slate-500',
                  )}
                >
                  {option}с
                </button>
              ))}
            </div>
          </label>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          disabled={!canGenerate}
          onClick={() =>
            model &&
            onGenerate({
              modelSlug: model.slug,
              prompt: prompt.trim(),
              aspectRatio: aspectForTimeline(aspect),
              duration: isVideo ? duration : undefined,
              imageInputRef: hasImage ? primary?.source.url : undefined,
            })
          }
        >
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
          {running ? 'Генерируем…' : `Сгенерировать за ${formatTokens(price)}`}
        </Button>
        {!enoughCoins && <span className="text-xs text-amber-300">Не хватает коинов на балансе</span>}
      </div>
    </section>
  );
}
