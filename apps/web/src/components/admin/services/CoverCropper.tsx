'use client';

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useRef, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { COVER_ASPECT, coverCropStyle, isValidCrop, type CoverCrop } from '@/lib/cover-crop';

type Nat = { nw: number; nh: number };

function heightFromWidth(w: number, nat: Nat) {
  // Пиксельное соотношение рамки должно равняться 16:10: (w·nw)/(h·nh) = COVER_ASPECT.
  return (w * nat.nw) / (nat.nh * COVER_ASPECT);
}

function widthBounds(nat: Nat) {
  const wMax = Math.min(1, (COVER_ASPECT * nat.nh) / nat.nw);
  const wMin = Math.min(wMax, 0.15);
  return { wMin, wMax };
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

function defaultCrop(nat: Nat): CoverCrop {
  const { wMax } = widthBounds(nat);
  const w = wMax;
  const h = heightFromWidth(w, nat);
  return { x: (1 - w) / 2, y: (1 - h) / 2, w, h };
}

function normalizeCrop(input: CoverCrop, nat: Nat): CoverCrop {
  const { wMin, wMax } = widthBounds(nat);
  const w = clamp(input.w, wMin, wMax);
  const h = heightFromWidth(w, nat);
  const x = clamp(input.x, 0, 1 - w);
  const y = clamp(input.y, 0, 1 - h);
  return { x, y, w, h };
}

export function CoverCropper({
  imageUrl,
  value,
  onChange,
}: {
  imageUrl: string;
  value: CoverCrop | null;
  onChange: (crop: CoverCrop | null) => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [nat, setNat] = useState<Nat | null>(null);
  const [crop, setCrop] = useState<CoverCrop | null>(isValidCrop(value) ? value : null);
  const valueRef = useRef(value);
  valueRef.current = value;

  // Новая картинка — ждём onLoad, чтобы получить натуральные размеры и переинициализировать рамку.
  useEffect(() => {
    setNat(null);
  }, [imageUrl]);

  const commit = useCallback(
    (next: CoverCrop, n: Nat) => {
      const normalized = normalizeCrop(next, n);
      setCrop(normalized);
      onChange(normalized);
    },
    [onChange],
  );

  const onImgLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    if (!img.naturalWidth || !img.naturalHeight) return;
    const n: Nat = { nw: img.naturalWidth, nh: img.naturalHeight };
    setNat(n);
    const init = isValidCrop(valueRef.current) ? normalizeCrop(valueRef.current, n) : defaultCrop(n);
    setCrop(init);
    // Не зовём onChange здесь: это не действие пользователя, а инициализация.
  };

  // Перетаскивание рамки (пан).
  const dragRef = useRef<{ startX: number; startY: number; cropX: number; cropY: number } | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    if (!crop || !nat) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, cropX: crop.x, cropY: crop.y };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    const boxEl = boxRef.current;
    if (!drag || !crop || !nat || !boxEl) return;
    const rect = boxEl.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const dx = (e.clientX - drag.startX) / rect.width;
    const dy = (e.clientY - drag.startY) / rect.height;
    commit({ ...crop, x: drag.cropX + dx, y: drag.cropY + dy }, nat);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    dragRef.current = null;
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
  };

  const onZoom = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!crop || !nat) return;
    const { wMin, wMax } = widthBounds(nat);
    const z = Number(e.target.value) / 100; // 0 = отдалить, 1 = приблизить
    const w = wMax - z * (wMax - wMin);
    const h = heightFromWidth(w, nat);
    // Держим центр рамки на месте.
    const cx = crop.x + crop.w / 2;
    const cy = crop.y + crop.h / 2;
    commit({ x: cx - w / 2, y: cy - h / 2, w, h }, nat);
  };

  const reset = () => {
    if (nat) {
      const d = defaultCrop(nat);
      setCrop(d);
    }
    onChange(null); // null => витрина показывает центр по умолчанию
  };

  const bounds = nat ? widthBounds(nat) : null;
  const zoomValue = crop && bounds && bounds.wMax > bounds.wMin
    ? Math.round(((bounds.wMax - crop.w) / (bounds.wMax - bounds.wMin)) * 100)
    : 0;
  const cropPx = crop && nat ? { w: Math.round(crop.w * nat.nw), h: Math.round(crop.h * nat.nh) } : null;

  return (
    <div className="space-y-3 rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium text-slate-200">Кадрирование обложки</div>
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center gap-1 rounded-md border border-zinc-700 px-2 py-1 text-xs text-slate-300 transition hover:bg-zinc-800"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Сбросить (центр)
        </button>
      </div>
      <p className="text-xs text-slate-500">
        Перетащите рамку по фото и меняйте масштаб — видимая часть станет обложкой на витрине (16:10). Сетка — правило третей.
      </p>

      <div className="grid gap-4 lg:grid-cols-[1fr,240px]">
        {/* Редактор: полное фото + рамка */}
        <div
          ref={boxRef}
          className="relative w-full select-none overflow-hidden rounded-lg border border-zinc-800 bg-black"
          style={{ touchAction: 'none' }}
        >
          <img src={imageUrl} alt="Кадрирование обложки" onLoad={onImgLoad} className="block w-full" draggable={false} />
          {crop && nat ? (
            <div
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              className="absolute cursor-grab touch-none active:cursor-grabbing"
              style={{
                left: `${crop.x * 100}%`,
                top: `${crop.y * 100}%`,
                width: `${crop.w * 100}%`,
                height: `${crop.h * 100}%`,
                boxShadow: '0 0 0 9999px rgba(2,6,23,0.66)',
                outline: '2px solid rgba(251,191,36,0.95)',
              }}
            >
              {/* сетка правила третей */}
              <div className="pointer-events-none absolute inset-0">
                <div className="absolute inset-y-0 left-1/3 w-px bg-white/40" />
                <div className="absolute inset-y-0 left-2/3 w-px bg-white/40" />
                <div className="absolute inset-x-0 top-1/3 h-px bg-white/40" />
                <div className="absolute inset-x-0 top-2/3 h-px bg-white/40" />
              </div>
            </div>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-500">Загрузка фото…</div>
          )}
        </div>

        {/* Живой предпросмотр карточки витрины */}
        <div className="space-y-2">
          <div className="text-xs text-slate-400">Как на витрине</div>
          <div className="relative w-full overflow-hidden rounded-lg border border-slate-700 bg-slate-950" style={{ aspectRatio: '16 / 10' }}>
            {crop ? (
              <img src={imageUrl} alt="Предпросмотр обложки" className="object-cover" style={coverCropStyle(crop)} draggable={false} />
            ) : (
              <img src={imageUrl} alt="Предпросмотр обложки" className="absolute inset-0 h-full w-full object-cover" draggable={false} />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
          </div>
          {cropPx ? <div className="text-[11px] text-slate-500">Область: {cropPx.w}×{cropPx.h}px</div> : null}
        </div>
      </div>

      {/* Масштаб */}
      <div className="flex items-center gap-3">
        <span className="text-xs text-slate-400">Масштаб</span>
        <input
          type="range"
          min={0}
          max={100}
          value={zoomValue}
          onChange={onZoom}
          disabled={!crop || !bounds || bounds.wMax <= bounds.wMin}
          className="h-1.5 flex-1 cursor-pointer accent-amber-400"
        />
      </div>
    </div>
  );
}
