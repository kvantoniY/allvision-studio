'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Pause, Play } from 'lucide-react';
import { useWaveform } from '@/components/editor/useWaveform';
import { cn } from '@/lib/utils';

/**
 * Плеер готовой озвучки.
 *
 * Системный `<audio controls>` выглядит инородно: серая панель браузера посреди тёмной
 * витрины, и у каждого браузера она своя. Здесь та же дорожка показана волной — по ней
 * видно, где речь, а где пауза, и результат читается как готовая работа, а не как файл.
 *
 * Пики считает тот же `useWaveform`, что и дорожки редактора: файл скачивается один раз
 * на вкладку и кэшируется. Не получилось (CORS, битый файл) — полоса остаётся ровной,
 * плеер при этом работает: звук важнее картинки.
 */

const BAR_WIDTH = 3;
const BAR_GAP = 2;

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export function AudioResultPlayer({ src, className }: { src: string; className?: string }) {
  const peaks = useWaveform(src);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const played = duration > 0 ? Math.min(1, currentTime / duration) : 0;

  // Перерисовываем волну при смене пиков, прогресса и размера контейнера.
  useEffect(() => {
    const canvas = canvasRef.current;
    const box = boxRef.current;
    if (!canvas || !box) return;

    const draw = () => {
      const width = box.clientWidth;
      const height = box.clientHeight;
      if (width <= 0 || height <= 0) return;
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.floor(width * ratio);
      canvas.height = Math.floor(height * ratio);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const bars = Math.max(1, Math.floor(width / (BAR_WIDTH + BAR_GAP)));
      const middle = height / 2;
      // Прослушанная часть светится, остальное приглушено — видно, где сейчас находимся.
      const playedGradient = ctx.createLinearGradient(0, 0, width, 0);
      playedGradient.addColorStop(0, '#fbbf24');
      playedGradient.addColorStop(0.5, '#fb7185');
      playedGradient.addColorStop(1, '#a78bfa');
      const playedBars = Math.round(bars * played);

      for (let bar = 0; bar < bars; bar += 1) {
        const peak = peaks && peaks.length > 0
          ? peaks[Math.min(peaks.length - 1, Math.floor((bar / bars) * peaks.length))] ?? 0
          : 0.25;
        // Минимальная высота: на тишине полоса всё равно должна читаться как дорожка.
        const barHeight = Math.max(2, peak * (height - 6));
        ctx.fillStyle = bar < playedBars ? playedGradient : 'rgba(148,163,184,0.32)';
        ctx.fillRect(bar * (BAR_WIDTH + BAR_GAP), middle - barHeight / 2, BAR_WIDTH, barHeight);
      }
    };

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(box);
    return () => observer.disconnect();
  }, [peaks, played]);

  const seekTo = (clientX: number) => {
    const box = boxRef.current;
    const audio = audioRef.current;
    if (!box || !audio || !Number.isFinite(audio.duration)) return;
    const rect = box.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    audio.currentTime = ratio * audio.duration;
    setCurrentTime(audio.currentTime);
  };

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) void audio.play();
    else audio.pause();
  };

  return (
    <div className={cn('flex items-center gap-3', className)}>
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? 'Пауза' : 'Слушать'}
        className="av-btn-gradient grid h-11 w-11 shrink-0 place-items-center rounded-full"
      >
        {playing ? <Pause className="h-4 w-4 fill-current" /> : <Play className="ml-0.5 h-4 w-4 fill-current" />}
      </button>

      <div
        ref={boxRef}
        onClick={(event) => seekTo(event.clientX)}
        className="relative h-12 min-w-0 flex-1 cursor-pointer"
        role="presentation"
      >
        <canvas ref={canvasRef} className="h-full w-full" />
        {!peaks && (
          <span className="pointer-events-none absolute inset-0 grid place-items-center">
            <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
          </span>
        )}
      </div>

      <span className="shrink-0 text-xs tabular-nums text-slate-400">
        {formatTime(currentTime)} / {formatTime(duration)}
      </span>

      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
        className="hidden"
      />
    </div>
  );
}
