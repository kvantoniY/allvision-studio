'use client';

import { useEffect, useRef, useState } from 'react';

// Бэкенд отдаёт прогресс рывками (часто 5% → долго → 95% → 100%). Этот хук делает шкалу «живой»:
// плавно подкрадывается вверх между реальными апдейтами, мгновенно прыгает вперёд, когда реальный
// прогресс обогнал показанный, и никогда не застывает полностью (всегда есть минимальный шаг),
// но и не доходит до 100% сам — финальные 100% ставит только реальное завершение.
//
// id (необязательно) — стабильный ключ генерации: тогда показанный прогресс сохраняется в
// localStorage и НЕ падает после перезагрузки страницы (берётся максимум из сохранённого и реального).
//
// active = генерация ещё идёт (PENDING/PROCESSING). Когда active=false, показываем реальное значение
// (т.е. 100 на завершении, или фактический прогресс на ошибке) — без додумывания.
const STORAGE_PREFIX = 'genprog:';

function readStored(id?: string): number | null {
  if (!id || typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + id);
    if (raw == null) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : null;
  } catch {
    return null;
  }
}

function writeStored(id: string | undefined, value: number) {
  if (!id || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_PREFIX + id, String(Math.round(value)));
  } catch {
    // ignore quota / privacy-mode errors
  }
}

function clearStored(id?: string) {
  if (!id || typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_PREFIX + id);
  } catch {
    // ignore
  }
}

export function useLivelyProgress(real: number, active: boolean, id?: string): number {
  const safeReal = Number.isFinite(real) ? Math.max(0, Math.min(100, real)) : 0;
  // Инициализируемся из сохранённого значения, чтобы после перезагрузки шкала не откатывалась назад.
  const [display, setDisplay] = useState(() => Math.max(safeReal, readStored(id) ?? safeReal));
  const realRef = useRef(safeReal);
  realRef.current = safeReal;

  // Реальный прогресс обогнал показанный — мгновенно подтягиваем шкалу вперёд (не назад).
  useEffect(() => {
    setDisplay((d) => (safeReal > d ? safeReal : d));
  }, [safeReal]);

  useEffect(() => {
    if (!active) return;
    const intervalId = setInterval(() => {
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
    return () => clearInterval(intervalId);
  }, [active]);

  // Пока идёт генерация — сохраняем показанный прогресс (переживёт перезагрузку).
  // Когда генерация завершилась/упала — чистим запись, чтобы localStorage не копил мусор.
  useEffect(() => {
    if (active) writeStored(id, display);
  }, [active, id, display]);

  useEffect(() => {
    if (!active) clearStored(id);
  }, [active, id]);

  if (!active) return Math.round(safeReal);
  return Math.round(Math.max(display, safeReal));
}
