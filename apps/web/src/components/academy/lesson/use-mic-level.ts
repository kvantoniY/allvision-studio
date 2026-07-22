'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Локальный уровень микрофона для индикатора речи вокруг плитки участника.
 * Звук НИКУДА не передаётся — наружу уходит только флаг «говорит» по WebSocket;
 * реальная передача аудио появится вместе с LiveKit (A8).
 */
export function useMicLevel(enabled: boolean, onSpeakingChange?: (speaking: boolean) => void) {
  const [level, setLevel] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const speakingRef = useRef(false);
  const changeRef = useRef(onSpeakingChange);
  changeRef.current = onSpeakingChange;

  useEffect(() => {
    if (!enabled) {
      setLevel(0);
      if (speakingRef.current) {
        speakingRef.current = false;
        setSpeaking(false);
        changeRef.current?.(false);
      }
      return;
    }

    let stream: MediaStream | null = null;
    let context: AudioContext | null = null;
    let raf = 0;
    let stopped = false;
    // Порог входа выше порога выхода — иначе индикатор дребезжит на границе.
    let quietFrames = 0;

    const start = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (stopped) return;
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        context = new Ctor();
        const source = context.createMediaStreamSource(stream);
        const analyser = context.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
        const buffer = new Uint8Array(analyser.frequencyBinCount);

        const tick = () => {
          analyser.getByteTimeDomainData(buffer);
          let sum = 0;
          for (const value of buffer) {
            const centered = (value - 128) / 128;
            sum += centered * centered;
          }
          const rms = Math.sqrt(sum / buffer.length);
          const next = Math.min(1, rms * 4);
          setLevel(next);

          if (next > 0.12) {
            quietFrames = 0;
            if (!speakingRef.current) {
              speakingRef.current = true;
              setSpeaking(true);
              changeRef.current?.(true);
            }
          } else if (speakingRef.current) {
            quietFrames += 1;
            if (quietFrames > 25) {
              speakingRef.current = false;
              setSpeaking(false);
              changeRef.current?.(false);
            }
          }
          raf = requestAnimationFrame(tick);
        };
        tick();
      } catch {
        setError('Нет доступа к микрофону');
      }
    };
    void start();

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((track) => track.stop());
      void context?.close().catch(() => undefined);
      if (speakingRef.current) {
        speakingRef.current = false;
        changeRef.current?.(false);
      }
    };
  }, [enabled]);

  return { level, speaking, error };
}
