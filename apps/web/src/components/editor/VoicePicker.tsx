'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Loader2, Play, Search, Square } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useListVoicesQuery } from '@/store/api/voices-api';
import { cn } from '@/lib/utils';

/**
 * Каталог голосов.
 *
 * Голосов тысячи, поэтому список подгружается страницами и фильтруется поиском, языком и полом.
 * Каждый голос можно послушать до генерации — иначе выбор превращается в лотерею: имя диктора
 * ничего не говорит о том, как он звучит.
 */
export function VoicePicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (voiceId: string, name: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [gender, setGender] = useState<'male' | 'female' | null>(null);
  const [language, setLanguage] = useState<string | null>('ru');
  const [playing, setPlaying] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Запрос на каждое нажатие клавиши положил бы и наш прокси, и лимит запросов Lumean.
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 400);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => () => {
    audioRef.current?.pause();
  }, []);

  const { data, isFetching } = useListVoicesQuery({
    search: debounced || undefined,
    gender: gender ?? undefined,
    language: language ?? undefined,
    pageSize: 24,
  });

  const preview = (voiceId: string, url: string | null) => {
    if (!url) return;
    audioRef.current?.pause();
    if (playing === voiceId) {
      setPlaying(null);
      return;
    }
    const audio = new Audio(url);
    audioRef.current = audio;
    audio.onended = () => setPlaying(null);
    void audio.play().catch(() => setPlaying(null));
    setPlaying(voiceId);
  };

  const voices = data?.voices ?? [];

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Поиск голоса"
          className="h-8 border-slate-700 bg-slate-950 pl-8 text-xs"
        />
      </div>

      <div className="flex flex-wrap gap-1">
        {([
          { code: null, title: 'Все' },
          { code: 'female', title: 'Женские' },
          { code: 'male', title: 'Мужские' },
        ] as const).map((option) => (
          <button
            key={option.title}
            type="button"
            onClick={() => setGender(option.code)}
            className={cn(
              'rounded-full border px-2.5 py-0.5 text-[11px] transition',
              gender === option.code
                ? 'border-violet-400 bg-violet-500/20 text-violet-100'
                : 'border-slate-700 text-slate-400 hover:text-slate-200',
            )}
          >
            {option.title}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setLanguage((current) => (current === 'ru' ? null : 'ru'))}
          className={cn(
            'rounded-full border px-2.5 py-0.5 text-[11px] transition',
            language === 'ru'
              ? 'border-violet-400 bg-violet-500/20 text-violet-100'
              : 'border-slate-700 text-slate-400 hover:text-slate-200',
          )}
        >
          Знают русский
        </button>
      </div>

      <div className="studio-scroll max-h-56 space-y-1 overflow-y-auto pr-1">
        {isFetching && voices.length === 0 ? (
          <div className="flex items-center gap-2 p-3 text-xs text-slate-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Загружаем каталог…
          </div>
        ) : voices.length === 0 ? (
          <p className="p-3 text-xs text-slate-500">Ничего не нашлось. Попробуйте другой запрос.</p>
        ) : (
          voices.map((voice) => {
            const selected = value === voice.voiceId;
            return (
              <div
                key={voice.voiceId}
                className={cn(
                  'flex items-center gap-2 rounded-lg border p-2 transition',
                  selected ? 'border-violet-400 bg-violet-500/10' : 'border-slate-800 hover:border-slate-700',
                )}
              >
                <button
                  type="button"
                  onClick={() => preview(voice.voiceId, voice.previewUrl)}
                  disabled={!voice.previewUrl}
                  aria-label="Послушать голос"
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-slate-700 text-slate-300 transition hover:text-white disabled:opacity-30"
                >
                  {playing === voice.voiceId ? <Square className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                </button>

                <button
                  type="button"
                  onClick={() => onChange(voice.voiceId, voice.name)}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="block truncate text-xs text-slate-100">{voice.name}</span>
                  <span className="block truncate text-[10px] text-slate-500">
                    {[voice.gender === 'female' ? 'женский' : voice.gender === 'male' ? 'мужской' : null, voice.accent, voice.language]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </button>

                {selected && <Check className="h-4 w-4 shrink-0 text-violet-300" />}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
