'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import type {
  AcademyScenePlayerRole,
  AcademySceneRuntimeEffect,
  AcademySceneRuntimeEvent,
  AcademySceneRuntimeState,
  MiniGameState,
} from '@allvision/shared';
import type { PixiScenePlayer } from '@/lib/scene-engine';
import { cn } from '@/lib/utils';

export interface AcademyScenePlayerHandle {
  reset: () => void;
  focus: () => void;
  send: (event: Omit<AcademySceneRuntimeEvent, 'role'> & { role?: AcademyScenePlayerRole }) => void;
  /** Применить снимок мини-игры от второго участника урока или из состояния комнаты. */
  setGameState: (elementId: string, state: MiniGameState) => void;
}

interface AcademyScenePlayerProps {
  scene: unknown;
  role?: AcademyScenePlayerRole;
  debugBoundaries?: boolean;
  className?: string;
  onReady?: () => void;
  onStateChange?: (state: AcademySceneRuntimeState) => void;
  onEffect?: (effect: AcademySceneRuntimeEffect) => void;
  onEvent?: (event: AcademySceneRuntimeEvent) => void;
  /** Локальный ход ученика/учителя в мини-игре — комната рассылает его второму участнику. */
  onGameState?: (elementId: string, state: MiniGameState) => void;
  onError?: (error: Error) => void;
}

export const AcademyScenePlayer = forwardRef<AcademyScenePlayerHandle, AcademyScenePlayerProps>(
  function AcademyScenePlayer({
    scene,
    role = 'student',
    debugBoundaries = false,
    className,
    onReady,
    onStateChange,
    onEffect,
    onEvent,
    onGameState,
    onError,
  }, forwardedRef) {
    const hostRef = useRef<HTMLDivElement>(null);
    const playerRef = useRef<PixiScenePlayer | null>(null);
    const callbacksRef = useRef({ onReady, onStateChange, onEffect, onEvent, onGameState, onError });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    callbacksRef.current = { onReady, onStateChange, onEffect, onEvent, onGameState, onError };

    useImperativeHandle(forwardedRef, () => ({
      reset: () => playerRef.current?.reset(),
      focus: () => hostRef.current?.querySelector('canvas')?.focus(),
      send: (event) => playerRef.current?.send(event),
      setGameState: (elementId, state) => playerRef.current?.setGameState(elementId, state),
    }), []);

    useEffect(() => {
      playerRef.current?.setRole(role);
    }, [role]);

    useEffect(() => {
      const host = hostRef.current;
      if (!host) return undefined;
      let disposed = false;
      let player: PixiScenePlayer | null = null;
      setLoading(true);
      setError(null);

      void import('@/lib/scene-engine/pixi-scene-player')
        .then(async ({ PixiScenePlayer }) => {
          player = new PixiScenePlayer({
            host,
            scene,
            role,
            debugBoundaries,
            onStateChange: (state) => callbacksRef.current.onStateChange?.(state),
            onEffect: (effect) => callbacksRef.current.onEffect?.(effect),
            onEvent: (event) => callbacksRef.current.onEvent?.(event),
            onGameState: (elementId, state) => callbacksRef.current.onGameState?.(elementId, state),
            onError: (caught) => {
              setError(caught.message);
              callbacksRef.current.onError?.(caught);
            },
          });
          playerRef.current = player;
          await player.init();
          if (disposed) return;
          setLoading(false);
          callbacksRef.current.onReady?.();
        })
        .catch((caught: unknown) => {
          if (disposed) return;
          const normalized = caught instanceof Error ? caught : new Error(String(caught));
          setLoading(false);
          setError(normalized.message);
          callbacksRef.current.onError?.(normalized);
        });

      return () => {
        disposed = true;
        player?.destroy();
        if (playerRef.current === player) playerRef.current = null;
        host.replaceChildren();
      };
      // role меняется через setRole без пересоздания WebGL-контекста.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [scene, debugBoundaries]);

    // Пропорции берём из самой сцены, а не из захардкоженного 16:9: сцена может быть
    // и 4:3. Плюс max-height не даёт содержимому вылезти за контейнер урока — раньше
    // низ сцены обрезался, и урок отличался от конструктора.
    const viewport = (scene as { viewport?: { width?: number; height?: number } } | null)?.viewport;
    const ratioW = Number(viewport?.width) > 0 ? Number(viewport?.width) : 1280;
    const ratioH = Number(viewport?.height) > 0 ? Number(viewport?.height) : 720;

    return (
      <div
        className={cn('relative mx-auto overflow-hidden rounded-2xl border border-orange-200 bg-orange-50 shadow-inner', className)}
        style={{ aspectRatio: `${ratioW} / ${ratioH}`, maxWidth: '100%', maxHeight: '100%' }}
      >
        <div ref={hostRef} className="h-full w-full" />
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-orange-50/90 text-sm font-medium text-orange-900">
            <Loader2 className="mr-2 h-5 w-5 animate-spin text-orange-500" />
            Загружаем сцену…
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-red-50/95 p-6 text-center text-sm text-red-800">
            <AlertTriangle className="h-7 w-7" />
            <span className="font-semibold">Не удалось открыть сцену</span>
            <span className="max-w-lg text-xs">{error}</span>
          </div>
        )}
      </div>
    );
  },
);
