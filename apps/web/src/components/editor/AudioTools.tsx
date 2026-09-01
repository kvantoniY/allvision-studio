'use client';

import { useState } from 'react';
import { Loader2, Mic, Music, Plus, Trash2, Upload, Wand2 } from 'lucide-react';
import { VoicePicker } from '@/components/editor/VoicePicker';
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
  /** Голос из каталога: у моделей Lumean диктора выбирает пользователь. */
  voice?: string;
  /** Насколько ровно диктор держит характер: ниже — живее, выше — стабильнее. */
  stability?: number;
  /** Скорость речи. Диапазон узкий — за его пределами сервис откажет. */
  speed?: number;
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
  onAddMusic,
  onPickVoiceFile,
  onRecordVoice,
  onGenerateVoiceover,
  recordings,
  onAddVoiceTrack,
  onRemoveVoiceTrack,
}: {
  timeline: Timeline;
  musicOptions: Array<{ id: string; title: string; publicUrl: string }>;
  balance: number;
  uploading: boolean;
  voiceoverRunning: boolean;
  priceOverrides?: Record<string, number>;
  onAddMusic: (url: string, title: string) => void;
  onPickVoiceFile: () => void;
  onRecordVoice: (file: File) => void;
  onGenerateVoiceover: (request: VoiceoverRequest) => void;
  recordings: VoiceRecording[];
  onAddVoiceTrack: (url: string, title: string) => void;
  onRemoveVoiceTrack: (url: string) => void;
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
        <MusicTab musicOptions={musicOptions} onAddMusic={onAddMusic} />
      ) : (
        <VoiceTab
          timeline={timeline}
          balance={balance}
          uploading={uploading}
          voiceoverRunning={voiceoverRunning}
          priceOverrides={priceOverrides}
          onPickVoiceFile={onPickVoiceFile}
          onRecordVoice={onRecordVoice}
          onGenerateVoiceover={onGenerateVoiceover}
          recordings={recordings}
          onAddVoiceTrack={onAddVoiceTrack}
          onRemoveVoiceTrack={onRemoveVoiceTrack}
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

/**
 * Музыка. Выбор трека ДОБАВЛЯЕТ дорожку, а не заменяет прежнюю: одна песня на ролик была
 * ограничением. Громкость, начало и обрезка живут на самой дорожке внизу — держать те же
 * ручки ещё и здесь значило бы иметь два места, где меняется одно и то же.
 */
function MusicTab({
  musicOptions,
  onAddMusic,
}: {
  musicOptions: Array<{ id: string; title: string; publicUrl: string }>;
  onAddMusic: (url: string, title: string) => void;
}) {
  const [selected, setSelected] = useState('');

  return (
    <div className="space-y-2">
      <select
        value={selected}
        onChange={(event) => setSelected(event.target.value)}
        className="h-9 w-full rounded-md border border-slate-700 bg-slate-900 px-2 text-sm text-slate-100"
        aria-label="Трек из библиотеки"
      >
        <option value="">Выберите трек…</option>
        {musicOptions.map((asset) => (
          <option key={asset.id} value={asset.publicUrl}>
            {asset.title}
          </option>
        ))}
      </select>

      <Button
        type="button"
        variant="outline"
        className="w-full"
        disabled={!selected}
        onClick={() => {
          const asset = musicOptions.find((item) => item.publicUrl === selected);
          if (!asset) return;
          onAddMusic(asset.publicUrl, asset.title);
          setSelected('');
        }}
      >
        <Plus className="h-4 w-4" />
        Добавить дорожку
      </Button>

      {musicOptions.length === 0 && <p className="text-xs text-slate-500">Библиотека музыки пока пуста.</p>}
      <p className="text-xs text-slate-500">
        Громкость, начало и обрезку настраивайте на дорожке внизу. Под голос музыка приглушается сама.
      </p>
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
  onGenerateVoiceover,
  recordings,
  onAddVoiceTrack,
  onRemoveVoiceTrack,
}: {
  timeline: Timeline;
  balance: number;
  uploading: boolean;
  voiceoverRunning: boolean;
  priceOverrides?: Record<string, number>;
  onPickVoiceFile: () => void;
  onRecordVoice: (file: File) => void;
  onGenerateVoiceover: (request: VoiceoverRequest) => void;
  recordings: VoiceRecording[];
  onAddVoiceTrack: (url: string, title: string) => void;
  onRemoveVoiceTrack: (url: string) => void;
}) {
  const [text, setText] = useState('');
  const [modelSlug, setModelSlug] = useState<string>(VOICEOVER_MODELS[0].slug);
  const [emotion, setEmotion] = useState<string>('happy');
  const [section, setSection] = useState<'new' | 'saved'>('new');
  const [voice, setVoice] = useState<{ id: string; name: string } | null>(null);
  const [stability, setStability] = useState(0.5);
  const [speed, setSpeed] = useState(1);

  const model = VOICEOVER_MODELS.find((item) => item.slug === modelSlug) ?? VOICEOVER_MODELS[0];
  const price = applyModelPriceOverride(model.slug, voiceoverPriceCoins(model.slug), priceOverrides);
  const enoughCoins = balance >= price;
  const tooLong = text.trim().length > VOICEOVER_MAX_LENGTH;
  const needsVoice = model.supportsVoiceCatalog && !voice;
  const canGenerate = text.trim().length > 0 && !tooLong && !voiceoverRunning && enoughCoins && !needsVoice;

  if (section === 'saved') {
    return (
      <div className="space-y-3">
        <VoiceSectionTabs section={section} onChange={setSection} recordedCount={recordings.length} />
        <VoiceRecordings
          recordings={recordings}
          onAddToTimeline={onAddVoiceTrack}
          onRemoveFromTimeline={onRemoveVoiceTrack}
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <VoiceSectionTabs section={section} onChange={setSection} recordedCount={recordings.length} />
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

        {model.supportsVoiceCatalog && (
          <div className="space-y-2 rounded-lg border border-slate-800 bg-slate-950/40 p-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-medium text-slate-300">Голос</span>
              <span className="truncate text-[11px] text-violet-200">{voice?.name ?? 'не выбран'}</span>
            </div>
            <VoicePicker value={voice?.id ?? null} onChange={(id, name) => setVoice({ id, name })} />

            <label className="block text-[11px] text-slate-400">
              Характер: {stability < 0.35 ? 'живой' : stability > 0.7 ? 'ровный' : 'сбалансированный'}
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={stability}
                onChange={(event) => setStability(Number(event.target.value))}
                className="mt-1 w-full accent-violet-400"
              />
            </label>
            <label className="block text-[11px] text-slate-400">
              Скорость: {speed.toFixed(2)}×
              <input
                type="range"
                min={0.7}
                max={1.2}
                step={0.05}
                value={speed}
                onChange={(event) => setSpeed(Number(event.target.value))}
                className="mt-1 w-full accent-violet-400"
              />
            </label>
          </div>
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
              ...(model.supportsVoiceCatalog
                ? { voice: voice?.id, stability, speed }
                : {}),
            })
          }
        >
          {voiceoverRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
          {voiceoverRunning ? 'Записываем…' : `Озвучить за ${formatTokens(price)}`}
        </Button>
        {!enoughCoins && <p className="text-xs text-amber-300">Не хватает токенов на балансе</p>}
      </div>
    </div>
  );
}

/** Переключатель внутри «Голоса»: сделать новую запись или взять готовую. */
function VoiceSectionTabs({
  section,
  onChange,
  recordedCount,
}: {
  section: 'new' | 'saved';
  onChange: (next: 'new' | 'saved') => void;
  recordedCount: number;
}) {
  return (
    <div className="grid grid-cols-2 gap-1 rounded-lg border border-slate-800 bg-slate-950/60 p-1">
      <button
        type="button"
        onClick={() => onChange('new')}
        className={cn(
          'rounded-md px-2 py-1 text-[11px] font-medium transition',
          section === 'new' ? 'bg-slate-800 text-slate-100' : 'text-slate-400 hover:text-slate-200',
        )}
      >
        Новая запись
      </button>
      <button
        type="button"
        onClick={() => onChange('saved')}
        className={cn(
          'rounded-md px-2 py-1 text-[11px] font-medium transition',
          section === 'saved' ? 'bg-slate-800 text-slate-100' : 'text-slate-400 hover:text-slate-200',
        )}
      >
        Мои записи{recordedCount > 0 ? ` · ${recordedCount}` : ''}
      </button>
    </div>
  );
}

export type VoiceRecording = {
  id: string;
  url: string;
  title: string;
  /** Уже стоит на дорожке ролика — тогда предлагаем снять, а не добавить второй раз. */
  onTimeline: boolean;
  status?: string;
  progress?: number;
};

/**
 * Готовые записи голоса.
 *
 * Дорожку можно снять с таймлайна, но сама запись остаётся здесь: за синтез уже заплачено,
 * и человек должен видеть, что у него есть, и вернуть запись обратно одним нажатием.
 */
function VoiceRecordings({
  recordings,
  onAddToTimeline,
  onRemoveFromTimeline,
}: {
  recordings: VoiceRecording[];
  onAddToTimeline: (url: string, title: string) => void;
  onRemoveFromTimeline: (url: string) => void;
}) {
  if (recordings.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-slate-800 p-3 text-xs text-slate-500">
        Записей пока нет. Загрузите файл, запишите голос или произнесите текст — они появятся здесь.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {recordings.map((item) => {
        const running = item.status === 'PENDING' || item.status === 'PROCESSING';
        return (
          <div key={item.id} className="space-y-1.5 rounded-lg border border-slate-800 bg-slate-950/50 p-2">
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate text-xs text-slate-200">{item.title}</span>
              {item.onTimeline && <span className="shrink-0 text-[10px] text-violet-300">на дорожке</span>}
            </div>

            {running ? (
              <p className="flex items-center gap-1.5 text-[11px] text-slate-400">
                <Loader2 className="h-3 w-3 animate-spin" />
                Синтезируем… {item.progress ?? 0}%
              </p>
            ) : (
              <>
                <audio controls src={mediaUrl(item.url) ?? undefined} className="h-8 w-full" />
                {item.onTimeline ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => onRemoveFromTimeline(item.url)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Убрать с дорожки
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => onAddToTimeline(item.url, item.title)}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Добавить на дорожку
                  </Button>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
