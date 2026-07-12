'use client';

import { useEffect, useRef } from 'react';
import { useDispatch } from 'react-redux';
import type { AppDispatch } from '@/store';
import { projectsApi, invalidateProjectSideEffects } from '@/store/api/projects-api';
import { userChatApi } from '@/store/api/user-chat-api';
import { userMediaAssetsApi } from '@/store/api/user-media-assets-api';

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
    let watchdogTimer: number | undefined;
    let lastActivityAt = 0;
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
        // Завершение library-generation создаёт новый ассет Студии — без инвалидации
        // новый образ не появлялся в списке аватаров/локаций до перезахода.
        dispatch(userMediaAssetsApi.util.invalidateTags(['UserMediaAsset']));
        invalidateProjectSideEffects(dispatch);
      }
    };

    const closeSource = () => {
      if (reconnectTimer !== undefined) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = undefined;
      }
      if (watchdogTimer !== undefined) {
        window.clearInterval(watchdogTimer);
        watchdogTimer = undefined;
      }
      if (source) {
        source.close();
        source = null;
      }
    };

    // Watchdog «мёртвого» стрима: сервер шлёт ping каждые 25с; если 70с не было ни события,
    // ни ping'а — соединение открыто, но данные не доходят (например, прокси буферизует SSE).
    // Переподключаемся и добираем пропущенное catch-up инвалидацией в onopen.
    const startWatchdog = () => {
      lastActivityAt = Date.now();
      if (watchdogTimer !== undefined) window.clearInterval(watchdogTimer);
      watchdogTimer = window.setInterval(() => {
        if (disposed || !source) return;
        if (Date.now() - lastActivityAt < 70_000) return;
        closeSource();
        invalidateAll(undefined, true);
        connect();
      }, 15_000);
    };

    const connect = () => {
      // Не держим постоянное SSE-соединение в фоновой/скрытой вкладке: браузер (особенно по
      // HTTP/1.1, куда часто откатывают корпоративные прокси/антивирусы) ограничивает число
      // соединений на домен, и «висящий» стрим второй вкладки исчерпывает пул — из-за этого
      // запросы активной вкладки (список генераций) не грузятся, пока вторую вкладку не закроют.
      if (disposed || source || (typeof document !== 'undefined' && document.hidden)) return;
      source = new EventSource(`${API_URL}/api/user/events`, { withCredentials: true });

      source.onopen = () => {
        attempts = 0;
        startWatchdog();
        // После (пере)подключения добираем всё, что могло произойти, пока соединения не было.
        if (hadConnection) invalidateAll(undefined, true);
        hadConnection = true;
      };

      source.addEventListener('ping', () => {
        lastActivityAt = Date.now();
      });

      source.addEventListener('project', (message) => {
        lastActivityAt = Date.now();
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
          if (disposed || (typeof document !== 'undefined' && document.hidden)) return;
          void fetch(`${API_URL}/api/auth/refresh`, { method: 'POST', credentials: 'include' })
            .catch(() => undefined)
            .then(() => connect());
        }, delay);
      };
    };

    const onVisibility = () => {
      if (document.hidden) {
        // Вкладка ушла в фон — освобождаем постоянное соединение.
        closeSource();
      } else {
        // Вернулись на вкладку — переоткрываем; onopen сделает catch-up инвалидацию.
        attempts = 0;
        connect();
      }
    };

    document.addEventListener('visibilitychange', onVisibility);
    connect();

    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', onVisibility);
      closeSource();
    };
  }, [dispatch, enabled]);

  return null;
}
