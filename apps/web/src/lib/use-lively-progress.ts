'use client';

import { useEffect, useRef, useState } from 'react';

// Бэкенд отдаёт прогресс рывками (часто 5% → долго → 95% → 100%). Этот хук делает шкалу «живой»:
// плавно подкрадывается вверх между реальными апдейтами, мгновенно прыгает вперёд, когда реальный
// прогресс обогнал показанный, и никогда не застывает полностью (всегда есть минимальный шаг),
// но и не доходит до 100% сам — финальные 100% ставит только реальное завершение.
//
// active = генерация ещё идёт (PENDING/PROCESSING). Когда active=false, показываем реальное значение
// (т.е. 100 на завершении, или фактический прогресс на ошибке) — без додумывания.
export function useLivelyProgress(real: number, active: boolean): number {
  const safeReal = Number.isFinite(real) ? Math.max(0, Math.min(100, real)) : 0;
  const [display, setDisplay] = useState(safeReal);
  const realRef = useRef(safeReal);
  realRef.current = safeReal;

  // Реальный прогресс обогнал показанный — мгновенно подтягиваем шкалу вперёд (не назад).
  useEffect(() => {
    setDisplay((d) => (safeReal > d ? safeReal : d));
  }, [safeReal]);

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      setDisplay((d) => {
        const r = realRef.current;
        const base = Math.max(d, r);
        // Сам по себе доползаем максимум до 95%; если бэкенд уже близко к концу (>=90),
        // разрешаем доползти до 99%. Финальные 100% — только по реальному завершению.
        const cap = r >= 90 ? 99 : 95;
        if (base >= cap) return base;
        // Замедляемся у потолка, но держим минимальную скорость — шкала не «зависает».
        const step = Math.max(0.3, (cap - base) * 0.05);
        return Math.min(cap, base + step);
      });
    }, 500);
    return () => clearInterval(id);
  }, [active]);

  if (!active) return Math.round(safeReal);
  return Math.round(Math.max(display, safeReal));
}
