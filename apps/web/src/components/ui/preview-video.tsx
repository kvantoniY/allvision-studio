'use client';

import { useEffect, useReducer, useRef, type CSSProperties, type MouseEvent } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Превью-видео витрины: по умолчанию играет с ОРИГИНАЛЬНЫМ звуком, со значком звука для отключения.
 *
 * - Глобальная настройка звука хранится в localStorage: один раз выключил — остаётся выключенным
 *   после перезагрузки, пока не включишь снова. Значок на КАЖДОМ превью управляет этой общей настройкой.
 * - Чтобы сетка превью (например, «Танцы») не завыла всеми роликами разом, звук в один момент
 *   времени звучит только у ОДНОГО превью — того, на которое навели курсор (или первого на странице).
 *   Остальные продолжают проигрываться без звука. Это не «полноценный плеер»: обложка/раскладка не меняются.
 * - Браузеры блокируют автозапуск со звуком без действия пользователя: тогда ролик стартует без звука
 *   и включает звук при первом клике/касании по странице (owner-превью).
 */

const STORAGE_KEY = 'allvision.previewSound';

let soundOn = true; // по умолчанию звук включён
let ownerId: string | null = null; // какое превью сейчас «владеет» звуком
let hydrated = false;
let nextId = 0;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

function hydrate() {
  if (hydrated || typeof window === 'undefined') return;
  hydrated = true;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === 'off' && soundOn) {
    soundOn = false;
    notify();
  }
}

function setSoundOn(next: boolean) {
  soundOn = next;
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, next ? 'on' : 'off');
  }
  notify();
}

function claimOwnership(id: string) {
  if (ownerId === id) return;
  ownerId = id;
  notify();
}

function releaseOwnership(id: string) {
  if (ownerId === id) {
    ownerId = null;
    notify();
  }
}

function usePreviewSoundStore() {
  const [, force] = useReducer((value: number) => value + 1, 0);
  useEffect(() => {
    hydrate();
    listeners.add(force);
    return () => {
      listeners.delete(force);
    };
  }, []);
}

type PreviewVideoProps = {
  src: string;
  className?: string;
  style?: CSSProperties;
  poster?: string;
  /** Положение кнопки звука. */
  soundButtonClassName?: string;
};

export function PreviewVideo({ src, className, style, poster, soundButtonClassName }: PreviewVideoProps) {
  usePreviewSoundStore();
  const idRef = useRef<string>('');
  if (!idRef.current) idRef.current = `preview-${nextId++}`;
  const id = idRef.current;
  const videoRef = useRef<HTMLVideoElement>(null);

  const audible = soundOn && ownerId === id;

  // На маунте первое превью забирает звук; на анмаунте — освобождает.
  useEffect(() => {
    if (ownerId === null) claimOwnership(id);
    return () => releaseOwnership(id);
  }, [id]);

  // Проигрывание/звук по текущему состоянию. Автозапуск со звуком может быть заблокирован —
  // тогда стартуем без звука и включаем его при первом действии пользователя по странице.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;
    video.muted = !audible;
    if (!audible) {
      void video.play().catch(() => undefined);
      return undefined;
    }
    let cleanup: (() => void) | undefined;
    void video.play().catch(() => {
      const current = videoRef.current;
      if (!current) return;
      current.muted = true;
      void current.play().catch(() => undefined);
      const onGesture = () => {
        const el = videoRef.current;
        if (el && soundOn && ownerId === id) {
          el.muted = false;
          void el.play().catch(() => undefined);
        }
      };
      window.addEventListener('pointerdown', onGesture, { once: true });
      cleanup = () => window.removeEventListener('pointerdown', onGesture);
    });
    return () => cleanup?.();
  }, [audible, id]);

  const toggleSound = (event: MouseEvent) => {
    // Превью часто внутри <Link> — не переходим по ссылке при клике на значок.
    event.preventDefault();
    event.stopPropagation();
    if (!soundOn) {
      claimOwnership(id);
      setSoundOn(true);
    } else {
      setSoundOn(false);
    }
  };

  return (
    <>
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        loop
        autoPlay
        playsInline
        // muted проставляется императивно в effect (React не рендерит muted как атрибут надёжно)
        className={className}
        style={style}
        onPointerEnter={() => claimOwnership(id)}
      />
      <button
        type="button"
        onClick={toggleSound}
        aria-label={soundOn ? 'Выключить звук превью' : 'Включить звук превью'}
        title={soundOn ? 'Выключить звук' : 'Включить звук'}
        className={cn(
          'absolute right-2 top-2 z-10 grid h-8 w-8 place-items-center rounded-full bg-black/55 text-white backdrop-blur-sm transition hover:bg-black/75',
          soundButtonClassName,
        )}
      >
        {audible ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
      </button>
    </>
  );
}
