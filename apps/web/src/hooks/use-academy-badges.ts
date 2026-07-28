'use client';

import { useCallback, useEffect, useState } from 'react';
import { useListLessonReportsQuery, useListThreadsQuery } from '@/store/api/academy-operations-api';

/**
 * Счётчики «есть что посмотреть» для навигации: новые отчёты после занятий и новые
 * сообщения от преподавателя. Раньше их было видно только зайдя на страницу — родитель
 * узнавал об отчёте случайно.
 *
 * Отчёты считает сервер (`parentReadAt`). Для сообщений серверного признака прочтения
 * нет, поэтому «просмотрено» держим локально: время последнего открытого сообщения
 * диалога в localStorage. Это честно для одного устройства и не требует миграции БД.
 */

const SEEN_KEY = 'allvision.threadSeen';

type SeenMap = Record<string, string>;

function readSeen(): SeenMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(SEEN_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? (parsed as SeenMap) : {};
  } catch {
    return {};
  }
}

function writeSeen(map: SeenMap) {
  try {
    window.localStorage.setItem(SEEN_KEY, JSON.stringify(map));
    window.dispatchEvent(new Event('allvision:thread-seen'));
  } catch {
    /* приватный режим браузера — бейдж просто останется */
  }
}

/** Отмечает диалог прочитанным до указанного момента (вызывает страница сообщений). */
export function markThreadSeen(threadId: string, lastMessageAt: string | undefined) {
  if (!threadId || !lastMessageAt) return;
  const map = readSeen();
  if (map[threadId] === lastMessageAt) return;
  map[threadId] = lastMessageAt;
  writeSeen(map);
}

export function useAcademyBadges(options: { role?: string | null; skip?: boolean } = {}) {
  const skip = options.skip ?? false;
  const isParent = options.role === 'PARENT' || options.role === 'USER';
  const myRole = options.role === 'TEACHER' ? 'TEACHER' : options.role === 'ADMIN' ? 'ADMIN' : 'PARENT';

  const threads = useListThreadsQuery(undefined, { skip, pollingInterval: 60_000 });
  const reports = useListLessonReportsQuery(undefined, { skip: skip || !isParent, pollingInterval: 120_000 });

  const [seen, setSeen] = useState<SeenMap>({});
  useEffect(() => {
    const sync = () => setSeen(readSeen());
    sync();
    window.addEventListener('allvision:thread-seen', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('allvision:thread-seen', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const unreadMessages = (threads.data?.threads ?? []).filter((thread) => {
    const last = thread.lastMessage;
    if (!last || last.role === myRole) return false;
    const seenAt = seen[thread.id];
    return !seenAt || new Date(last.createdAt).getTime() > new Date(seenAt).getTime();
  }).length;

  const newReports = (reports.data?.reports ?? []).filter((report) => !report.parentReadAt).length;

  return { messages: unreadMessages, reports: newReports };
}

/** Хелпер для страницы сообщений: пометить активный диалог прочитанным. */
export function useMarkThreadSeen() {
  return useCallback(markThreadSeen, []);
}
