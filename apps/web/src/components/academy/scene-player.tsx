'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import type {
  AcademyScenePlayerRole,
  AcademySceneRuntimeEffect,
  AcademySceneRuntimeEvent,
  AcademySceneRuntimeState,
} from '@allvision/shared';
import type { PixiScenePlayer } from '@/lib/scene-engine';
import { cn } from '@/lib/utils';

export interface AcademyScenePlayerHandle {
  reset: () => void;
  focus: () => void;
  send: (event: Omit<AcademySceneRuntimeEvent, 'role'> & { role?: AcademyScenePlayerRole }) => void;
}

interface AcademyScenePlayerProps {
  scene: unknown;
  role?: AcademyScenePlayerRole;
  debugBoundaries?: boolean;
  className?: string;
  onReady?: () => void;
  onStateChange?: (state: AcademySceneRuntimeState) => void;
  onEffect?: (effect: AcademySceneRuntimeEffect) => void;
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
    onError,
  }, forwardedRef) {
    const hostRef = useRef<HTMLDivElement>(null);
    const playerRef = useRef<PixiScenePlayer | null>(null);
    const callbacksRef = useRef({ onReady, onStateChange, onEffect, onError });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    callbacksRef.current = { onReady, onStateChange, onEffect, onError };

    useImperativeHandle(forwardedRef, () => ({
      reset: () => playerRef.current?.reset(),
      focus: () => hostRef.current?.querySelector('canvas')?.focus(),
      send: (event) => playerRef.current?.send(event),
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

    return (
      <div className={cn('relative overflow-hidden rounded-2xl border border-orange-200 bg-orange-50 shadow-inner', className)}>
        <div ref={hostRef} className="aspect-video w-full" />
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
