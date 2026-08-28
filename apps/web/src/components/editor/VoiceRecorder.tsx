'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Mic, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';

/**
 * Запись голоса с микрофона прямо в ролике.
 *
 * Записанное сразу уходит тем же путём, что и загруженный файл: для монтажа это обычная
 * аудиодорожка, и отдельной ветки в рендере ей не нужно.
 */
export function VoiceRecorder({
  uploading,
  onRecorded,
}: {
  uploading: boolean;
  onRecorded: (file: File) => void;
}) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    recorderRef.current?.stream.getTracks().forEach((track) => track.stop());
  }, []);

  const start = async () => {
    // Микрофон недоступен без защищённого соединения — на localhost и https он есть.
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      toast({ title: 'Микрофон недоступен', description: 'Браузер не даёт доступ к записи.', variant: 'destructive' });
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const type = recorder.mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type });
        // Расширение по типу: сервер принимает файл по MIME, но осмысленное имя удобнее
        // и в логах, и в списке файлов ролика.
        const extension = type.includes('ogg') ? 'ogg' : type.includes('mp4') ? 'm4a' : 'webm';
        onRecorded(new File([blob], `voice-${Date.now()}.${extension}`, { type }));
      };
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((value) => value + 1), 1000);
    } catch {
      toast({
        title: 'Не удалось включить микрофон',
        description: 'Разрешите доступ в настройках браузера и попробуйте снова.',
        variant: 'destructive',
      });
    }
  };

  const stop = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
  };

  if (recording) {
    return (
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={stop} className="border-rose-500/60 text-rose-200">
          <Square className="h-3.5 w-3.5 fill-current" />
          Остановить
        </Button>
        <span className="flex items-center gap-1.5 font-mono text-xs text-rose-300">
          <span className="h-2 w-2 animate-pulse rounded-full bg-rose-500" />
          {String(Math.floor(seconds / 60)).padStart(2, '0')}:{String(seconds % 60).padStart(2, '0')}
        </span>
      </div>
    );
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={() => void start()} disabled={uploading}>
      {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
      Записать голос
    </Button>
  );
}
