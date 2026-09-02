'use client';

import { memo, useEffect, useRef } from 'react';
import { useWaveform } from './useWaveform';

/**
 * Звуковая волна внутри клипа дорожки.
 *
 * Рисуем canvas, а не сотню `<div>`: полоса перерисовывается на каждом кадре перетаскивания,
 * и элементы DOM на это не рассчитаны.
 *
 * Показываем ровно тот кусок файла, который звучит: волна начинается с секунды обрезки и
 * заканчивается там, где кончается фрагмент. Иначе картинка врала бы — под курсором была бы
 * одна форма, а в ролике звучала другая.
 */
export const Waveform = memo(function Waveform({
  src,
  fromSec,
  lengthSec,
  fileDurationSec,
  color,
}: {
  src: string | null;
  /** С какой секунды файла начинается фрагмент. */
  fromSec: number;
  /** Сколько секунд файла попадает в кадр полосы. */
  lengthSec: number;
  /** Полная длина файла: без неё непонятно, какую долю пиков брать. */
  fileDurationSec: number | null;
  color: string;
}) {
  const peaks = useWaveform(src);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const box = boxRef.current;
    if (!canvas || !box || !peaks || peaks.length === 0) return;

    const draw = () => {
      const width = box.clientWidth;
      const height = box.clientHeight;
      if (width <= 0 || height <= 0) return;
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.floor(width * ratio);
      canvas.height = Math.floor(height * ratio);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = color;

      const total = fileDurationSec && fileDurationSec > 0 ? fileDurationSec : lengthSec;
      const startRatio = total > 0 ? Math.min(1, Math.max(0, fromSec / total)) : 0;
      const spanRatio = total > 0 ? Math.min(1 - startRatio, Math.max(0.001, lengthSec / total)) : 1;

      const barWidth = 2;
      const gap = 1;
      const bars = Math.max(1, Math.floor(width / (barWidth + gap)));
      const middle = height / 2;

      for (let bar = 0; bar < bars; bar += 1) {
        const position = startRatio + (spanRatio * bar) / bars;
        const peak = peaks[Math.min(peaks.length - 1, Math.floor(position * peaks.length))] ?? 0;
        // Минимальная высота: на тишине полоса всё равно должна читаться как дорожка.
        const barHeight = Math.max(1.5, peak * (height - 4));
        ctx.fillRect(bar * (barWidth + gap), middle - barHeight / 2, barWidth, barHeight);
      }
    };

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(box);
    return () => observer.disconnect();
  }, [peaks, fromSec, lengthSec, fileDurationSec, color]);

  return (
    <div ref={boxRef} className="pointer-events-none absolute inset-0">
      <canvas ref={canvasRef} className="h-full w-full" />
    </div>
  );
});
