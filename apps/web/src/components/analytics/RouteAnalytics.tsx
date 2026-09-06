'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

declare global {
  interface Window {
    ym?: (id: number, action: string, url?: string, params?: Record<string, unknown>) => void;
  }
}

/*
 * Метрика считает просмотр только в момент init. Дальше кабинет и витрина ходят
 * клиентской навигацией — адрес меняется, а хита нет: в отчётах у всех сессий один
 * просмотр, глубина и внутренние страницы пустые. Поэтому на смену маршрута шлём hit
 * руками.
 *
 * Google Analytics 4 тут не трогаем намеренно: у веб-потока по умолчанию включено
 * расширенное измерение с отслеживанием history-переходов, и второй ручной page_view
 * дал бы двойной счёт.
 */
export function RouteAnalytics({ metricaId }: { metricaId: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Первый хит уже отправил init — иначе первая страница считалась бы дважды.
  const skippedFirst = useRef(false);

  useEffect(() => {
    if (!skippedFirst.current) {
      skippedFirst.current = true;
      return;
    }
    const id = Number(metricaId);
    if (!Number.isFinite(id) || typeof window.ym !== 'function') return;

    const query = searchParams?.toString();
    const url = `${window.location.origin}${pathname}${query ? `?${query}` : ''}`;
    window.ym(id, 'hit', url, { title: document.title });
  }, [pathname, searchParams, metricaId]);

  return null;
}
