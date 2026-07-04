'use client';

import { useEffect, useRef } from 'react';
import { useDispatch } from 'react-redux';
import type { AppDispatch } from '@/store';
import { projectsApi, invalidateProjectSideEffects } from '@/store/api/projects-api';
import { userChatApi } from '@/store/api/user-chat-api';

const API_URL = process.env.NEXT_PUBLIC_API_URL
  ?? (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:4000');

type ProjectEvent = {
  projectId: string;
  status: string;
  progress?: number;
  kind: 'status' | 'progress';
};

/**
 * Realtime-мост генераций: держит один EventSource на `GET /api/user/events` (SSE поверх
 * Redis pub/sub от worker'а) и на каждое событие инвалидирует кэши RTK Query.
 *
 * Зачем: страничный поллинг фрагментирован (разные аргументы списка проектов = разные
 * кэш-записи, условия поллинга зависят от возможно устаревшего кэша самой страницы), из-за
 * чего завершение генерации не доезжало до UI без F5 — особенно при нескольких параллельных
 * запусках и переходах между страницами. Push-событие обновляет ЛЮБОЙ открытый экран сразу;
 * существующий поллинг остаётся фолбэком на случай недоступности SSE.
 */
export function ProjectEventsBridge({ enabled }: { enabled: boolean }) {
  const dispatch = useDispatch<AppDispatch>();
  const lastProgressInvalidateRef = useRef(0);

  useEffect(() => {
    if (!enabled) return undefined;
    if (typeof window === 'undefined' || typeof EventSource === 'undefined') return undefined;

    let source: EventSource | null = null;
    let reconnectTimer: number | undefined;
    let attempts = 0;
    let disposed = false;
    let hadConnection = false;

    const invalidateAll = (projectId?: string, statusChange = false) => {
      dispatch(projectsApi.util.invalidateTags(
        projectId
          ? ['Project', { type: 'ProjectStatus' as const, id: projectId }]
          : ['Project', 'ProjectStatus'],
      ));
      if (statusChange) {
        // Чат встраивает состояние проекта в сообщения; баланс меняется при refund'е.
        dispatch(userChatApi.util.invalidateTags(['Chats', 'Chat']));
        invalidateProjectSideEffects(dispatch);
      }
    };

    const connect = () => {
      if (disposed) return;
      source = new EventSource(`${API_URL}/api/user/events`, { withCredentials: true });

      source.onopen = () => {
        attempts = 0;
        // После (пере)подключения добираем всё, что могло произойти, пока соединения не было.
        if (hadConnection) invalidateAll(undefined, true);
        hadConnection = true;
      };

      source.addEventListener('project', (message) => {
        let event: ProjectEvent | undefined;
        try {
          event = JSON.parse((message as MessageEvent).data) as ProjectEvent;
        } catch {
          return;
        }
        if (!event?.projectId) return;
        if (event.kind === 'status') {
          invalidateAll(event.projectId, true);
          return;
        }
        // Прогресс-тики летят часто — троттлим рефетч списка/статуса до раза в 2 секунды.
        const now = Date.now();
        if (now - lastProgressInvalidateRef.current < 2000) return;
        lastProgressInvalidateRef.current = now;
        invalidateAll(event.projectId);
      });

      source.onerror = () => {
        // Сетевые обрывы EventSource ретраит сам; CLOSED (например 401 после истечения
        // access-токена) — переоткрываем вручную после silent refresh.
        if (!source || source.readyState !== EventSource.CLOSED || disposed) return;
        source.close();
        source = null;
        attempts += 1;
        const delay = Math.min(30_000, 1000 * 2 ** Math.min(attempts, 5));
        reconnectTimer = window.setTimeout(() => {
          void fetch(`${API_URL}/api/auth/refresh`, { method: 'POST', credentials: 'include' })
            .catch(() => undefined)
            .then(() => connect());
        }, delay);
      };
    };

    connect();

    return () => {
      disposed = true;
      if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer);
      source?.close();
      source = null;
    };
  }, [dispatch, enabled]);

  return null;
}
