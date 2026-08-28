'use client';

import { useState } from 'react';
import { Loader2, Mic, Music, Trash2, Upload, Wand2 } from 'lucide-react';
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
import { VoiceRecorder } from '@/components/editor/VoiceRecorder';
import { cn } from '@/lib/utils';

export type VoiceoverRequest = {
  text: string;
  model: string;
  emotion?: string;
};

/**
 * Звук ролика: музыка и голос.
 *
 * Дорожки разведены по вкладкам, а не по двум колонкам: в узкой боковой панели колонки
 * ужимались до нечитаемых полосок и кнопки в них не помещались. Настраивают музыку и голос
 * почти всегда по отдельности, так что переключение ничего не стоит.
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
  onRecordVoice,
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
  onRecordVoice: (file: File) => void;
  onVoiceoverVolume: (volume: number) => void;
  onVoiceoverRemove: () => void;
  onGenerateVoiceover: (request: VoiceoverRequest) => void;
}) {
  const [tab, setTab] = useState<'music' | 'voice'>('music');

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-1 rounded-lg border border-slate-800 bg-slate-950/60 p-1">
        <TabButton active={tab === 'music'} onClick={() => setTab('music')} icon={<Music className="h-3.5 w-3.5" />}>
          Музыка
        </TabButton>
        <TabButton active={tab === 'voice'} onClick={() => setTab('voice')} icon={<Mic className="h-3.5 w-3.5" />}>
          Голос
        </TabButton>
      </div>

      {tab === 'music' ? (
        <MusicTab
          timeline={timeline}
          musicOptions={musicOptions}
          onMusicChange={onMusicChange}
          onMusicVolume={onMusicVolume}
        />
      ) : (
        <VoiceTab
          timeline={timeline}
          balance={balance}
          uploading={uploading}
          voiceoverRunning={voiceoverRunning}
          priceOverrides={priceOverrides}
          onPickVoiceFile={onPickVoiceFile}
          onRecordVoice={onRecordVoice}
          onVoiceoverVolume={onVoiceoverVolume}
          onVoiceoverRemove={onVoiceoverRemove}
          onGenerateVoiceover={onGenerateVoiceover}
        />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition',
        active ? 'bg-slate-800 text-slate-100' : 'text-slate-400 hover:text-slate-200',
      )}
    >
      {icon}
      {children}
    </button>
  );
}

function MusicTab({
  timeline,
  musicOptions,
  onMusicChange,
  onMusicVolume,
}: {
  timeline: Timeline;
  musicOptions: Array<{ id: string; title: string; publicUrl: string }>;
  onMusicChange: (url: string) => void;
  onMusicVolume: (volume: number) => void;
}) {
  return (
    <div className="space-y-2">
      <select
        value={timeline.music?.url ?? ''}
        onChange={(event) => onMusicChange(event.target.value)}
        className="h-9 w-full rounded-md border border-slate-700 bg-slate-900 px-2 text-sm text-slate-100"
        aria-label="Музыка ролика"
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
        <>
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
          <p className="text-xs text-slate-500">
            Начало и обрезку трека двигайте на дорожке внизу. Под голос музыка приглушается сама.
          </p>
        </>
      )}
    </div>
  );
}

function VoiceTab({
  timeline,
  balance,
  uploading,
  voiceoverRunning,
  priceOverrides,
  onPickVoiceFile,
  onRecordVoice,
  onVoiceoverVolume,
  onVoiceoverRemove,
  onGenerateVoiceover,
}: {
  timeline: Timeline;
  balance: number;
  uploading: boolean;
  voiceoverRunning: boolean;
  priceOverrides?: Record<string, number>;
  onPickVoiceFile: () => void;
  onRecordVoice: (file: File) => void;
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

  if (timeline.voiceover) {
    return (
      <div className="space-y-2">
        <audio controls src={mediaUrl(timeline.voiceover.url) ?? undefined} className="w-full" />
        <label className="block text-xs text-slate-400">
          Громкость: {Math.round(timeline.voiceover.volume * 100)}%
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
        <p className="text-xs text-slate-500">Момент, с которого звучит голос, двигается на дорожке внизу.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onPickVoiceFile}
          disabled={uploading}
          title="Загрузить готовую запись"
          aria-label="Загрузить запись"
          className="grid h-9 w-9 place-items-center rounded-lg border border-slate-700 text-slate-300 transition hover:border-slate-500 hover:text-white disabled:opacity-40"
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        </button>
        <VoiceRecorder uploading={uploading} onRecorded={onRecordVoice} />
      </div>

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

        <div className="grid gap-1.5 sm:grid-cols-2">
          <select
            value={model.slug}
            onChange={(event) => setModelSlug(event.target.value)}
            className="h-8 w-full rounded-md border border-slate-700 bg-slate-900 px-2 text-xs text-slate-100"
            aria-label="Голос"
          >
            {VOICEOVER_MODELS.map((item) => (
              <option key={item.slug} value={item.slug}>
                {item.title}
              </option>
            ))}
          </select>
          {model.supportsEmotion && (
            <select
              value={emotion}
              onChange={(event) => setEmotion(event.target.value)}
              className="h-8 w-full rounded-md border border-slate-700 bg-slate-900 px-2 text-xs text-slate-100"
              aria-label="Эмоция"
            >
              {VOICEOVER_EMOTIONS.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.title}
                </option>
              ))}
            </select>
          )}
        </div>

        <Button
          type="button"
          className="w-full"
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
        {!enoughCoins && <p className="text-xs text-amber-300">Не хватает коинов на балансе</p>}
      </div>
    </div>
  );
}
