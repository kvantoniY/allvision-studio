'use client';

import { cn } from '@/lib/utils';

/**
 * Индикатор генерации: неоновое кольцо с волнами и процентом.
 *
 * Заменяет обычную полосу прогресса там, где ждать приходится минутами. Полоса на
 * долгом ожидании читается плохо: она подолгу стоит на месте между редкими
 * обновлениями с сервера, и человек решает, что всё зависло. Здесь на тот же вопрос
 * отвечают два независимых слоя:
 *
 * - **число и уровень заливки** — фактический прогресс с сервера, они могут стоять;
 * - **волны и ореол** — идут всегда и ровно, поэтому «работа идёт» видно даже тогда,
 *   когда процент не меняется. Это и было главной претензией к прежней полосе.
 *
 * Вся анимация — CSS на transform/opacity, без таймеров и перерисовок React: индикатор
 * живёт на экране минутами, и любой поканальный пересчёт стоил бы дорого.
 */

/** Радиус кольца в координатах svg (viewBox 100×100). */
const RING_RADIUS = 44;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/** Радиус круга с жидкостью — чуть меньше кольца, чтобы заливка его не задевала. */
const LIQUID_RADIUS = 37;
const LIQUID_TOP = 50 - LIQUID_RADIUS;
const LIQUID_HEIGHT = LIQUID_RADIUS * 2;

/**
 * Волна на два периода. Уезжает ровно на один период (100 единиц), поэтому анимация
 * зацикливается без шва. Низ уводим далеко вниз — под поверхностью сплошная заливка.
 */
const WAVE_PATH = 'M0,0 Q25,-7 50,0 T100,0 T150,0 T200,0 L200,120 L0,120 Z';

/** Насколько гребень уходит от линии поверхности — та же семёрка, что в пути выше. */
const WAVE_AMPLITUDE = 7;

export function GenerationLoader({
  progress,
  label,
  hint,
  size = 132,
  className,
}: {
  /** Прогресс 0–100. Отрицательные и большие значения приводятся к границам. */
  progress: number;
  /** Что происходит сейчас: «Сцена 4 из 10», «Собираем ролик». */
  label?: string | null;
  /** Подсказка под индикатором: например, что страницу можно закрыть. */
  hint?: string | null;
  size?: number;
  className?: string;
}) {
  const safe = Math.max(0, Math.min(100, Math.round(Number.isFinite(progress) ? progress : 0)));
  /*
   * Уровень жидкости: 0% — пусто, 100% — залито целиком.
   *
   * На сотне поверхность уходит ВЫШЕ края круга на амплитуду волны. Иначе впадины
   * гребня остаются ниже верхней кромки, и на «100%» сверху висит тёмная полоса —
   * выглядит как недолитый до конца стакан.
   */
  const surfaceY = (LIQUID_TOP - WAVE_AMPLITUDE) + (LIQUID_HEIGHT + WAVE_AMPLITUDE) * (1 - safe / 100);
  const dashOffset = RING_CIRCUMFERENCE * (1 - safe / 100);

  return (
    <div className={cn('flex items-center gap-4', className)}>
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        {/*
         * Ореол под кольцом. Отдельным слоем и с размытием — само кольцо остаётся
         * чётким, а свет вокруг мягкий. Размывается маленький элемент, а не блок во
         * весь экран, поэтому это дёшево.
         */}
        <div
          aria-hidden
          className="av-loader-halo pointer-events-none absolute inset-[-14%] rounded-full opacity-70 blur-xl"
        />

        <svg viewBox="0 0 100 100" className="relative h-full w-full" role="img" aria-label={`Готово на ${safe}%`}>
          <defs>
            <linearGradient id="av-loader-ring" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#fbbf24" />
              <stop offset="45%" stopColor="#fb7185" />
              <stop offset="100%" stopColor="#a78bfa" />
            </linearGradient>
            <linearGradient id="av-loader-liquid" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.85" />
              <stop offset="55%" stopColor="#d946ef" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#6366f1" stopOpacity="0.5" />
            </linearGradient>
            <clipPath id="av-loader-clip">
              <circle cx="50" cy="50" r={LIQUID_RADIUS} />
            </clipPath>
          </defs>

          {/* Тёмная чаша под жидкостью, чтобы пустой круг не просвечивал фоном страницы. */}
          <circle cx="50" cy="50" r={LIQUID_RADIUS} fill="rgba(2,6,23,0.75)" />

          <g clipPath="url(#av-loader-clip)">
            {/*
             * Три трансформации — три вложенные группы, и это принципиально: CSS-анимация
             * задаёт СВОЙСТВО transform целиком, поэтому на одном элементе она затирает
             * инлайновый transform. Смешав уровень с качанием, я получил ровно это —
             * уровень пропадал, и круг был залит целиком при любом проценте.
             *
             * Снаружи внутрь: уровень заливки → качание → горизонтальный ход волны.
             */}
            <g style={{ transform: `translateY(${surfaceY}px)`, transition: 'transform 900ms cubic-bezier(0.22, 1, 0.36, 1)' }}>
              <g className="av-wave-bob">
                <g className="av-wave-a">
                  <path d={WAVE_PATH} fill="url(#av-loader-liquid)" opacity={0.42} />
                </g>
                {/* Второй гребень сдвинут по фазе, чтобы волны не шли одной линией. */}
                <g style={{ transform: 'translateX(-38px)' }}>
                  <g className="av-wave-b">
                    <path d={WAVE_PATH} fill="url(#av-loader-liquid)" opacity={0.6} />
                  </g>
                </g>
              </g>
            </g>
          </g>

          {/* Дорожка кольца. */}
          <circle cx="50" cy="50" r={RING_RADIUS} fill="none" stroke="rgba(148,163,184,0.18)" strokeWidth={5} />

          {/* Пройденная часть. Поворот на -90°, чтобы отсчёт шёл от верхней точки. */}
          <circle
            cx="50"
            cy="50"
            r={RING_RADIUS}
            fill="none"
            stroke="url(#av-loader-ring)"
            strokeWidth={5}
            strokeLinecap="round"
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset={dashOffset}
            transform="rotate(-90 50 50)"
            style={{
              transition: 'stroke-dashoffset 900ms cubic-bezier(0.22, 1, 0.36, 1)',
              filter: 'drop-shadow(0 0 4px rgba(251,146,60,0.9))',
            }}
          />
        </svg>

        {/* Процент поверх круга: обычным текстом, а не в svg — так шрифт совпадает со страницей. */}
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <span className="text-2xl font-black tabular-nums text-white drop-shadow-[0_2px_8px_rgba(2,6,23,0.9)]">
            {safe}
            <span className="text-sm font-bold text-slate-300">%</span>
          </span>
        </div>
      </div>

      {(label || hint) && (
        <div className="min-w-0 space-y-1.5">
          {label && <p className="text-sm font-semibold leading-5 text-slate-100">{label}</p>}
          {hint && <p className="text-xs leading-5 text-slate-400">{hint}</p>}
        </div>
      )}
    </div>
  );
}
