'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Mic, MicOff, Video, VideoOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Пред-вход в урок (green room): запрашивает доступ к камере/микрофону,
 * показывает превью себя и уровень микрофона, даёт выключить устройства до входа.
 * По кнопке «Войти» превью-дорожки останавливаются и управление отдаётся LiveKit,
 * который переиспользует уже выданное разрешение (без второго запроса браузера).
 */
export function LessonPreJoin({
  title,
  onJoin,
  onSkip,
}: {
  title: string;
  onJoin: (prefs: { camera: boolean; mic: boolean }) => void;
  onSkip: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef(0);

  const [status, setStatus] = useState<'requesting' | 'ready' | 'denied'>('requesting');
  const [camera, setCamera] = useState(true);
  const [mic, setMic] = useState(true);
  const [level, setLevel] = useState(0);

  // Запрос доступа + превью. Делаем один раз при монтировании.
  useEffect(() => {
    let cancelled = false;

    const stopMeter = () => {
      cancelAnimationFrame(rafRef.current);
      void audioCtxRef.current?.close().catch(() => undefined);
      audioCtxRef.current = null;
    };

    const startMeter = (stream: MediaStream) => {
      try {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new Ctor();
        audioCtxRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
        const buffer = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          analyser.getByteTimeDomainData(buffer);
          let sum = 0;
          for (const value of buffer) {
            const c = (value - 128) / 128;
            sum += c * c;
          }
          setLevel(Math.min(1, Math.sqrt(sum / buffer.length) * 4));
          rafRef.current = requestAnimationFrame(tick);
        };
        tick();
      } catch {
        /* без индикатора уровня переживём */
      }
    };

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        startMeter(stream);
        setStatus('ready');
      } catch {
        if (!cancelled) setStatus('denied');
      }
    })();

    return () => {
      cancelled = true;
      stopMeter();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  // Включение/выключение превью-дорожек до входа.
  useEffect(() => {
    streamRef.current?.getVideoTracks().forEach((t) => { t.enabled = camera; });
  }, [camera]);
  useEffect(() => {
    streamRef.current?.getAudioTracks().forEach((t) => { t.enabled = mic; });
  }, [mic]);

  const join = () => {
    // Освобождаем устройства, чтобы LiveKit захватил их без конфликта.
    cancelAnimationFrame(rafRef.current);
    void audioCtxRef.current?.close().catch(() => undefined);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    onJoin({ camera, mic });
  };

  return (
    <div className="academy-theme flex min-h-dvh items-center justify-center bg-background p-4 text-foreground">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h1 className="text-lg font-semibold">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Проверьте камеру и микрофон перед входом.</p>

        <div className="relative mt-4 aspect-video overflow-hidden rounded-xl bg-muted">
          <video ref={videoRef} autoPlay playsInline muted className={cn('h-full w-full scale-x-[-1] object-cover', (!camera || status !== 'ready') && 'hidden')} />
          {status === 'requesting' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              Разрешите доступ к камере и микрофону
            </div>
          )}
          {status === 'denied' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-6 text-center text-sm text-muted-foreground">
              <VideoOff className="h-6 w-6 opacity-50" />
              Доступ к камере и микрофону запрещён. Разрешите его в настройках браузера и обновите страницу — или войдите без видео.
            </div>
          )}
          {status === 'ready' && !camera && (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
              <VideoOff className="h-6 w-6 opacity-50" />
            </div>
          )}
          {/* Индикатор уровня микрофона */}
          {status === 'ready' && mic && (
            <div className="absolute inset-x-3 bottom-3 h-1.5 overflow-hidden rounded-full bg-background/60">
              <div className="h-full bg-primary transition-[width] duration-75" style={{ width: `${Math.round(level * 100)}%` }} />
            </div>
          )}
        </div>

        {status === 'ready' && (
          <div className="mt-3 flex items-center justify-center gap-2">
            <Button variant={camera ? 'default' : 'outline'} size="icon" onClick={() => setCamera((v) => !v)} aria-label={camera ? 'Выключить камеру' : 'Включить камеру'}>
              {camera ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
            </Button>
            <Button variant={mic ? 'default' : 'outline'} size="icon" onClick={() => setMic((v) => !v)} aria-label={mic ? 'Выключить микрофон' : 'Включить микрофон'}>
              {mic ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
            </Button>
          </div>
        )}

        <div className="mt-5 space-y-2">
          {status === 'denied' ? (
            <Button className="w-full" onClick={() => onJoin({ camera: false, mic: false })}>Войти без камеры и микрофона</Button>
          ) : (
            <Button className="w-full" disabled={status !== 'ready'} onClick={join}>
              Войти в урок
            </Button>
          )}
          <Button variant="ghost" className="w-full" onClick={onSkip}>Войти без видео</Button>
        </div>
      </div>
    </div>
  );
}
