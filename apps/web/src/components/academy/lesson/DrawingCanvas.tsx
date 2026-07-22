'use client';

import { useEffect, useRef } from 'react';
import type { LessonPoint, LessonStroke } from '@allvision/shared';

export function DrawingCanvas({
  strokes,
  active,
  color,
  size,
  onStart,
  onAppend,
  onEnd,
}: {
  strokes: LessonStroke[];
  active: boolean; // учитель с включённым пером
  color: string;
  size: number;
  onStart: (stroke: LessonStroke) => void;
  onAppend: (id: string, points: LessonPoint[]) => void;
  onEnd: (id: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const draw = useRef<{ id: string; batch: LessonPoint[]; flush: ReturnType<typeof setInterval> | null } | null>(null);

  // Перерисовка всех штрихов.
  const render = () => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const stroke of strokes) {
      if (stroke.points.length === 0) continue;
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.size;
      ctx.beginPath();
      stroke.points.forEach((p, i) => {
        const x = p.x * w;
        const y = p.y * h;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }
  };

  useEffect(() => { render(); });
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return undefined;
    const ro = new ResizeObserver(render);
    ro.observe(wrap);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pointOf = (e: React.PointerEvent): LessonPoint => {
    const rect = wrapRef.current!.getBoundingClientRect();
    return { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!active) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const id = crypto.randomUUID();
    const point = pointOf(e);
    onStart({ id, color, size, points: [point] });
    draw.current = {
      id,
      batch: [],
      flush: setInterval(() => {
        if (draw.current && draw.current.batch.length > 0) {
          onAppend(draw.current.id, draw.current.batch);
          draw.current.batch = [];
        }
      }, 40),
    };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!active || !draw.current) return;
    draw.current.batch.push(pointOf(e));
  };
  const finish = () => {
    if (!draw.current) return;
    const { id, batch, flush } = draw.current;
    if (flush) clearInterval(flush);
    if (batch.length > 0) onAppend(id, batch);
    onEnd(id);
    draw.current = null;
  };

  return (
    <div
      ref={wrapRef}
      className="absolute inset-0"
      style={{ pointerEvents: active ? 'auto' : 'none', cursor: active ? 'crosshair' : 'default', touchAction: active ? 'none' : 'auto' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finish}
      onPointerCancel={finish}
    >
      <canvas ref={canvasRef} className="h-full w-full" />
    </div>
  );
}
