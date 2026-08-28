'use client';

import { useState } from 'react';
import { Loader2, Mic, Trash2, Upload, Wand2 } from 'lucide-react';
import {
  VOICEOVER_EMOTIONS,
  VOICEOVER_MAX_LENGTH,
  VOICEOVER_MODELS,
  applyModelPriceOverride,
  formatTokens,
  voiceoverPriceCoins,
  type Timeline,
} from '@allvision/shared';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { mediaUrl } from '@/components/editor/canvas/useMediaElements';
import { cn } from '@/lib/utils';

export type VoiceoverRequest = {
  text: string;
  model: string;
  emotion?: string;
};

/**
 * Звук ролика: музыка фоном и голос поверх неё.
 *
 * Дорожки разведены не для красоты — под озвучку рендер приглушает музыку, иначе на
 * телефонном динамике голос в фоне тонет. Готовый файл можно просто загрузить: платить
 * за синтез, когда голос уже записан, незачем.
 */
export function AudioTools({
  timeline,
  musicOptions,
  balance,
  uploading,
  voiceoverRunning,
  priceOverrides,
  onMusicChange,
  onMusicVolume,
  onPickVoiceFile,
  onVoiceoverVolume,
  onVoiceoverRemove,
  onGenerateVoiceover,
}: {
  timeline: Timeline;
  musicOptions: Array<{ id: string; title: string; publicUrl: string }>;
  balance: number;
  uploading: boolean;
  voiceoverRunning: boolean;
  priceOverrides?: Record<string, number>;
  onMusicChange: (url: string) => void;
  onMusicVolume: (volume: number) => void;
  onPickVoiceFile: () => void;
  onVoiceoverVolume: (volume: number) => void;
  onVoiceoverRemove: () => void;
  onGenerateVoiceover: (request: VoiceoverRequest) => void;
}) {
  const [text, setText] = useState('');
  const [modelSlug, setModelSlug] = useState<string>(VOICEOVER_MODELS[0].slug);
  const [emotion, setEmotion] = useState<string>('happy');

  const model = VOICEOVER_MODELS.find((item) => item.slug === modelSlug) ?? VOICEOVER_MODELS[0];
  const price = applyModelPriceOverride(model.slug, voiceoverPriceCoins(model.slug), priceOverrides);
  const enoughCoins = balance >= price;
  const tooLong = text.trim().length > VOICEOVER_MAX_LENGTH;
  const canGenerate = text.trim().length > 0 && !tooLong && !voiceoverRunning && enoughCoins;

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <section className="space-y-2 rounded-xl border border-slate-800 bg-slate-900/60 p-3">
        <Label className="text-xs">Музыка ролика</Label>
        <select
          value={timeline.music?.url ?? ''}
          onChange={(event) => onMusicChange(event.target.value)}
          className="h-9 w-full rounded-md border border-slate-700 bg-slate-900 px-2 text-sm text-slate-100"
        >
          <option value="">Без музыки</option>
          {musicOptions.map((asset) => (
            <option key={asset.id} value={asset.publicUrl}>
              {asset.title}
            </option>
          ))}
        </select>
        {musicOptions.length === 0 && <p className="text-xs text-slate-500">Библиотека музыки пока пуста.</p>}
        {timeline.music && (
          <label className="block text-xs text-slate-400">
            Громкость: {Math.round(timeline.music.volume * 100)}%
            <input
              type="range"
              min={0}
              max={1.5}
              step={0.05}
              value={timeline.music.volume}
              onChange={(event) => onMusicVolume(Number(event.target.value))}
              className="mt-1 w-full accent-amber-400"
            />
          </label>
        )}
        {timeline.voiceover && (
          <p className="text-xs text-slate-500">Под голос музыка приглушается автоматически.</p>
        )}
      </section>

      <section className="space-y-3 rounded-xl border border-violet-500/30 bg-violet-500/5 p-3">
        <div className="flex items-center gap-2">
          <Mic className="h-4 w-4 text-violet-300" />
          <h3 className="text-sm font-semibold text-slate-100">Озвучка</h3>
        </div>

        {timeline.voiceover ? (
          <div className="space-y-2">
            <audio controls src={mediaUrl(timeline.voiceover.url) ?? undefined} className="w-full" />
            <label className="block text-xs text-slate-400">
              Громкость голоса: {Math.round(timeline.voiceover.volume * 100)}%
              <input
                type="range"
                min={0}
                max={1.5}
                step={0.05}
                value={timeline.voiceover.volume}
                onChange={(event) => onVoiceoverVolume(Number(event.target.value))}
                className="mt-1 w-full accent-violet-400"
              />
            </label>
            <Button type="button" variant="outline" size="sm" onClick={onVoiceoverRemove}>
              <Trash2 className="h-4 w-4" />
              Убрать голос
            </Button>
          </div>
        ) : (
          <>
            <Button type="button" variant="outline" size="sm" onClick={onPickVoiceFile} disabled={uploading}>
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Загрузить свою запись
            </Button>

            <div className="space-y-2 border-t border-slate-800 pt-3">
              <Label className="text-xs" htmlFor="voiceover-text">
                Или произнести текст голосом
              </Label>
              <Textarea
                id="voiceover-text"
                value={text}
                onChange={(event) => setText(event.target.value)}
                rows={3}
                placeholder="Текст поздравления"
                className="text-sm"
              />
              {tooLong && (
                <p className="text-xs text-amber-300">
                  Слишком длинный текст: {text.trim().length} из {VOICEOVER_MAX_LENGTH}.
                </p>
              )}

              <div className="flex flex-wrap gap-1.5">
                {VOICEOVER_MODELS.map((item) => (
                  <button
                    key={item.slug}
                    type="button"
                    title={item.description}
                    onClick={() => setModelSlug(item.slug)}
                    className={cn(
                      'rounded-full border px-3 py-1 text-xs transition',
                      model.slug === item.slug
                        ? 'border-violet-400 bg-violet-500/20 text-violet-100'
                        : 'border-slate-700 text-slate-300 hover:border-slate-500',
                    )}
                  >
                    {item.title}
                  </button>
                ))}
              </div>

              {model.supportsEmotion && (
                <div className="flex flex-wrap gap-1.5">
                  {VOICEOVER_EMOTIONS.map((item) => (
                    <button
                      key={item.code}
                      type="button"
                      onClick={() => setEmotion(item.code)}
                      className={cn(
                        'rounded-full border px-3 py-1 text-xs transition',
                        emotion === item.code
                          ? 'border-violet-400 bg-violet-500/20 text-violet-100'
                          : 'border-slate-700 text-slate-300 hover:border-slate-500',
                      )}
                    >
                      {item.title}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  disabled={!canGenerate}
                  onClick={() =>
                    onGenerateVoiceover({
                      text: text.trim(),
                      model: model.slug,
                      emotion: model.supportsEmotion ? emotion : undefined,
                    })
                  }
                >
                  {voiceoverRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                  {voiceoverRunning ? 'Записываем…' : `Озвучить за ${formatTokens(price)}`}
                </Button>
                {!enoughCoins && <span className="text-xs text-amber-300">Не хватает коинов на балансе</span>}
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
