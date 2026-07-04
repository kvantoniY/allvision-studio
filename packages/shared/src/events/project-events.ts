/**
 * Контракт realtime-событий по проектам (генерациям) между worker/API (Redis pub/sub)
 * и фронтом (SSE `GET /api/user/events`).
 *
 * Зачем: поллинг на фронте фрагментирован по страницам (разные аргументы списка = разные
 * кэш-записи RTK Query, условия поллинга зависят от возможно устаревшего кэша), из-за чего
 * завершение генерации могло не доехать до UI без перезагрузки. Push-событие снимает весь
 * класс проблем: любой экран узнаёт об изменении статуса мгновенно, поллинг остаётся фолбэком.
 */
export const PROJECT_EVENTS_CHANNEL = 'allvision:project-events';

export type ProjectEventKind = 'status' | 'progress';

export interface ProjectEventPayload {
  projectId: string;
  /** Владелец проекта — API фильтрует по нему SSE-подписчиков. */
  userId: string;
  /** PENDING | PROCESSING | COMPLETED | FAILED */
  status: string;
  progress?: number;
  /** status — смена статуса (важно, инвалидируем сразу); progress — тик прогресса (можно троттлить). */
  kind: ProjectEventKind;
}

export function parseProjectEvent(raw: string): ProjectEventPayload | undefined {
  try {
    const value = JSON.parse(raw) as Partial<ProjectEventPayload>;
    if (!value || typeof value !== 'object') return undefined;
    if (typeof value.projectId !== 'string' || typeof value.userId !== 'string') return undefined;
    if (typeof value.status !== 'string') return undefined;
    return {
      projectId: value.projectId,
      userId: value.userId,
      status: value.status,
      progress: typeof value.progress === 'number' ? value.progress : undefined,
      kind: value.kind === 'progress' ? 'progress' : 'status',
    };
  } catch {
    return undefined;
  }
}
