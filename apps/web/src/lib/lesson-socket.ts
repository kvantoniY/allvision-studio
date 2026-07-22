import { LESSON_WS_PATH, type LessonClientMessage, type LessonServerMessage } from '@allvision/shared';

export interface LessonSocket {
  send: (message: LessonClientMessage) => void;
  close: () => void;
}

function wsUrl(lessonId: string): string {
  const base = process.env.NEXT_PUBLIC_API_URL || (typeof window !== 'undefined' ? window.location.origin : '');
  const wsBase = base.replace(/^http/, 'ws');
  return `${wsBase}${LESSON_WS_PATH}?lessonId=${encodeURIComponent(lessonId)}`;
}

/**
 * WebSocket-клиент живой комнаты урока с авто-реконнектом и heartbeat.
 * Cookie accessToken уходит в handshake автоматически (same-origin).
 */
export function connectLessonSocket(
  lessonId: string,
  handlers: {
    onMessage: (message: LessonServerMessage) => void;
    onOpen?: () => void;
    onStatus?: (status: 'connecting' | 'open' | 'closed') => void;
  },
): LessonSocket {
  let ws: WebSocket | null = null;
  let closed = false;
  let retries = 0;
  let pingTimer: ReturnType<typeof setInterval> | null = null;

  const open = () => {
    if (closed) return;
    handlers.onStatus?.('connecting');
    ws = new WebSocket(wsUrl(lessonId));

    ws.onopen = () => {
      retries = 0;
      handlers.onStatus?.('open');
      handlers.onOpen?.();
      pingTimer = setInterval(() => {
        if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: 'ping' }));
      }, 25000);
    };
    ws.onmessage = (event) => {
      try {
        handlers.onMessage(JSON.parse(event.data as string) as LessonServerMessage);
      } catch {
        /* ignore malformed */
      }
    };
    ws.onclose = () => {
      if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
      handlers.onStatus?.('closed');
      if (closed) return;
      retries += 1;
      const delay = Math.min(1000 * 2 ** retries, 15000);
      setTimeout(open, delay);
    };
    ws.onerror = () => { ws?.close(); };
  };

  open();

  return {
    send: (message) => {
      if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
    },
    close: () => {
      closed = true;
      if (pingTimer) clearInterval(pingTimer);
      ws?.close();
    },
  };
}
