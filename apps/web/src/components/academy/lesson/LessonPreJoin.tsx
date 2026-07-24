'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Mic, MicOff, Video, VideoOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { DeviceOption, JoinPrefs } from './use-lesson-video';

/**
 * Пред-вход в урок (green room): запрашивает доступ к камере/микрофону,
 * показывает превью, уровень микрофона и выбор конкретных устройств до входа.
 * По кнопке «Войти» превью-дорожки останавливаются и управление отдаётся LiveKit
 * (разрешение уже выдано — второго запроса браузера нет).
 */
export function LessonPreJoin({
  title,
  onJoin,
  onSkip,
}: {
  title: string;
  onJoin: (prefs: JoinPrefs) => void;
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
  const [cameras, setCameras] = useState<DeviceOption[]>([]);
  const [mics, setMics] = useState<DeviceOption[]>([]);
  const [cameraId, setCameraId] = useState<string>('');
  const [micId, setMicId] = useState<string>('');

  const stopMeter = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    void audioCtxRef.current?.close().catch(() => undefined);
    audioCtxRef.current = null;
  }, []);

  const startMeter = useCallback((stream: MediaStream) => {
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
        for (const value of buffer) { const c = (value - 128) / 128; sum += c * c; }
        setLevel(Math.min(1, Math.sqrt(sum / buffer.length) * 4));
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch { /* без индикатора уровня переживём */ }
  }, []);

  // Захват превью с выбранным устройством. Пересоздаётся при смене камеры/микрофона.
  const acquire = useCallback(async (camDeviceId?: string, micDeviceId?: string) => {
    stopMeter();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: camDeviceId ? { deviceId: { exact: camDeviceId } } : true,
        audio: micDeviceId ? { deviceId: { exact: micDeviceId } } : true,
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      startMeter(stream);

      // Лейблы устройств доступны только после выдачи доступа.
      const list = await navigator.mediaDevices.enumerateDevices();
      const cams = list.filter((d) => d.kind === 'videoinput').map((d) => ({ deviceId: d.deviceId, label: d.label || 'Камера' }));
      const microphones = list.filter((d) => d.kind === 'audioinput').map((d) => ({ deviceId: d.deviceId, label: d.label || 'Микрофон' }));
      setCameras(cams);
      setMics(microphones);
      setCameraId((prev) => prev || stream.getVideoTracks()[0]?.getSettings().deviceId || cams[0]?.deviceId || '');
      setMicId((prev) => prev || stream.getAudioTracks()[0]?.getSettings().deviceId || microphones[0]?.deviceId || '');
      setStatus('ready');
    } catch {
      setStatus('denied');
    }
  }, [startMeter, stopMeter]);

  useEffect(() => {
    let cancelled = false;
    void acquire().then(() => { if (cancelled) streamRef.current?.getTracks().forEach((t) => t.stop()); });
    return () => {
      cancelled = true;
      stopMeter();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
    // Один раз на маунт; смена устройств идёт через onChange ниже.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { streamRef.current?.getVideoTracks().forEach((t) => { t.enabled = camera; }); }, [camera]);
  useEffect(() => { streamRef.current?.getAudioTracks().forEach((t) => { t.enabled = mic; }); }, [mic]);

  const changeCamera = (id: string) => { setCameraId(id); void acquire(id, micId); };
  const changeMic = (id: string) => { setMicId(id); void acquire(cameraId, id); };

  const join = () => {
    stopMeter();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    // Пауза, чтобы ОС успела освободить камеру перед захватом LiveKit (иначе «занято»).
    setTimeout(() => onJoin({ camera, mic, cameraId: cameraId || undefined, micId: micId || undefined }), 350);
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
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground"><VideoOff className="h-6 w-6 opacity-50" /></div>
          )}
          {status === 'ready' && mic && (
            <div className="absolute inset-x-3 bottom-3 h-1.5 overflow-hidden rounded-full bg-background/60">
              <div className="h-full bg-primary transition-[width] duration-75" style={{ width: `${Math.round(level * 100)}%` }} />
            </div>
          )}
        </div>

        {status === 'ready' && (
          <>
            <div className="mt-3 flex items-center justify-center gap-2">
              <Button variant={camera ? 'default' : 'outline'} size="icon" onClick={() => setCamera((v) => !v)} aria-label={camera ? 'Выключить камеру' : 'Включить камеру'}>
                {camera ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
              </Button>
              <Button variant={mic ? 'default' : 'outline'} size="icon" onClick={() => setMic((v) => !v)} aria-label={mic ? 'Выключить микрофон' : 'Включить микрофон'}>
                {mic ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
              </Button>
            </div>

            <div className="mt-3 space-y-2">
              <DeviceSelect icon={<Video className="h-4 w-4" />} value={cameraId} options={cameras} onChange={changeCamera} />
              <DeviceSelect icon={<Mic className="h-4 w-4" />} value={micId} options={mics} onChange={changeMic} />
            </div>
          </>
        )}

        <div className="mt-5 space-y-2">
          {status === 'denied' ? (
            <Button className="w-full" onClick={() => onJoin({ camera: false, mic: false })}>Войти без камеры и микрофона</Button>
          ) : (
            <Button className="w-full" disabled={status !== 'ready'} onClick={join}>Войти в урок</Button>
          )}
          <Button variant="ghost" className="w-full" onClick={onSkip}>Войти без видео</Button>
        </div>
      </div>
    </div>
  );
}

/** Выпадающий список устройств — используется в пред-входе и в шестерёнке урока. */
export function DeviceSelect({
  icon,
  value,
  options,
  onChange,
}: {
  icon: React.ReactNode;
  value: string;
  options: DeviceOption[];
  onChange: (id: string) => void;
}) {
  return (
    <label className="flex items-center gap-2 rounded-lg border border-border bg-background px-2.5">
      <span className="text-muted-foreground">{icon}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none"
      >
        {options.length === 0 && <option value="">Устройство по умолчанию</option>}
        {options.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label}</option>)}
      </select>
    </label>
  );
}
