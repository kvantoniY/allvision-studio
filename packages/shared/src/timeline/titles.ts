import type { TimelineTextOverlay, TimelineTextStyle } from './types';

/**
 * Титры рисуются как SVG.
 *
 * Один и тот же результат этой функции идёт двумя дорогами: инлайном в предпросмотр
 * браузера и через sharp -> PNG -> ffmpeg overlay в экспорт. Поэтому здесь не должно быть
 * ничего, что зависит от среды: перенос строк считаем сами, а не полагаемся на движок
 * рендеринга. Тогда разбивка на строки совпадает пиксель в пиксель, даже если системный
 * шрифт на сервере и в браузере отличается начертанием.
 *
 * Заодно это снимает известные болячки ffmpeg drawtext: кириллица, переносы, тени.
 */

export const TITLE_FONT_STACK = "Inter, 'Noto Sans', 'DejaVu Sans', Arial, sans-serif";

export type TitleStyleDef = {
  code: TimelineTextStyle;
  title: string;
  description: string;
};

export const TITLE_STYLE_DEFS: readonly TitleStyleDef[] = [
  { code: 'clean', title: 'Обычный', description: 'Белый текст с мягкой тенью, без плашки.' },
  { code: 'bold', title: 'Крупный', description: 'Большой жирный заголовок во всю ширину кадра.' },
  { code: 'card', title: 'На плашке', description: 'Тёмная полупрозрачная плашка — читается на любом фоне.' },
  { code: 'ribbon', title: 'Лента', description: 'Золотая лента с тёмным текстом, празднично.' },
  { code: 'quote', title: 'Цитата', description: 'Текст по центру между двумя линиями.' },
  { code: 'caption', title: 'Подпись', description: 'Мелкая подпись внизу кадра.' },
];

type StyleSpec = {
  /** Кегль как доля ширины кадра — титры одинаково смотрятся в любом формате. */
  fontScale: number;
  subFontScale: number;
  weight: number;
  color: string;
  subColor: string;
  /** Плашка под текстом. */
  plate?: { fill: string; radius: number; padX: number; padY: number };
  /** Горизонтальные поля как доля ширины. */
  sideMargin: number;
  shadow: boolean;
  italic?: boolean;
  rules?: boolean;
  letterSpacing?: number;
  uppercase?: boolean;
};

const STYLES: Record<TimelineTextStyle, StyleSpec> = {
  clean: {
    fontScale: 0.062,
    subFontScale: 0.04,
    weight: 700,
    color: '#ffffff',
    subColor: '#e2e8f0',
    sideMargin: 0.08,
    shadow: true,
  },
  bold: {
    fontScale: 0.095,
    subFontScale: 0.045,
    weight: 900,
    color: '#ffffff',
    subColor: '#fcd34d',
    sideMargin: 0.06,
    shadow: true,
    letterSpacing: -0.01,
    uppercase: true,
  },
  card: {
    fontScale: 0.058,
    subFontScale: 0.038,
    weight: 700,
    color: '#ffffff',
    subColor: '#cbd5f5',
    plate: { fill: 'rgba(8,11,20,0.72)', radius: 24, padX: 40, padY: 28 },
    sideMargin: 0.07,
    shadow: false,
  },
  ribbon: {
    fontScale: 0.055,
    subFontScale: 0.036,
    weight: 800,
    color: '#1a1206',
    subColor: '#4a3512',
    plate: { fill: '#f6c445', radius: 12, padX: 44, padY: 24 },
    sideMargin: 0.07,
    shadow: false,
    uppercase: true,
  },
  quote: {
    fontScale: 0.052,
    subFontScale: 0.034,
    weight: 500,
    color: '#ffffff',
    subColor: '#e2e8f0',
    sideMargin: 0.12,
    shadow: true,
    italic: true,
    rules: true,
  },
  caption: {
    fontScale: 0.036,
    subFontScale: 0.028,
    weight: 600,
    color: '#ffffff',
    subColor: '#cbd5f5',
    plate: { fill: 'rgba(8,11,20,0.55)', radius: 999, padX: 28, padY: 14 },
    sideMargin: 0.08,
    shadow: false,
  },
};

/**
 * Приблизительная ширина символов в долях кегля.
 *
 * Точные метрики шрифта здесь не нужны и даже вредны: важно, чтобы браузер и сервер
 * разбили текст на строки ОДИНАКОВО, а для этого достаточно любой общей модели.
 */
const NARROW = new Set([...'ijltfr!.,;:\'"|()[]{}-Ііїґ']);
const WIDE = new Set([...'mwMWШЩшщЖжФфЫы@%']);

function charWidth(char: string): number {
  if (char === ' ') return 0.28;
  if (NARROW.has(char)) return 0.33;
  if (WIDE.has(char)) return 0.86;
  if (char >= '0' && char <= '9') return 0.56;
  if (char === char.toUpperCase() && char !== char.toLowerCase()) return 0.66;
  return 0.55;
}

/**
 * Поправка на насыщенность начертания. Значения сняты замером реальной отрисовки:
 * на weight 500 модель совпадает с фактом, на 700 занижает на 7%, на 900 — на 21%.
 * Без неё жирные титры вылезали за плашку и за края кадра.
 */
const WEIGHT_FACTORS: Array<[number, number]> = [
  [400, 1],
  [500, 1],
  [600, 1.03],
  [700, 1.07],
  [800, 1.14],
  [900, 1.21],
];

export function weightFactor(weight: number): number {
  if (weight <= WEIGHT_FACTORS[0][0]) return WEIGHT_FACTORS[0][1];
  for (let i = 1; i < WEIGHT_FACTORS.length; i += 1) {
    const [upperWeight, upperFactor] = WEIGHT_FACTORS[i];
    if (weight > upperWeight) continue;
    const [lowerWeight, lowerFactor] = WEIGHT_FACTORS[i - 1];
    const t = (weight - lowerWeight) / (upperWeight - lowerWeight);
    return lowerFactor + (upperFactor - lowerFactor) * t;
  }
  return WEIGHT_FACTORS[WEIGHT_FACTORS.length - 1][1];
}

export function estimateTextWidth(text: string, fontSize: number, weight = 400): number {
  let width = 0;
  for (const char of text) width += charWidth(char);
  return width * fontSize * weightFactor(weight);
}

/** Перенос по словам; слишком длинное слово рвётся посимвольно, чтобы не уехать за кадр. */
export function wrapText(text: string, fontSize: number, maxWidth: number, weight = 400): string[] {
  const lines: string[] = [];
  let current = '';

  const pushCurrent = () => {
    if (current.length > 0) {
      lines.push(current);
      current = '';
    }
  };

  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = current ? `${current} ${word}` : word;
    if (estimateTextWidth(candidate, fontSize, weight) <= maxWidth) {
      current = candidate;
      continue;
    }
    pushCurrent();
    if (estimateTextWidth(word, fontSize, weight) <= maxWidth) {
      current = word;
      continue;
    }
    let chunk = '';
    for (const char of word) {
      if (estimateTextWidth(chunk + char, fontSize, weight) > maxWidth && chunk) {
        lines.push(chunk);
        chunk = char;
      } else {
        chunk += char;
      }
    }
    current = chunk;
  }
  pushCurrent();
  return lines.length > 0 ? lines : [text];
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export type OverlayRenderOptions = {
  width: number;
  height: number;
};

export type OverlayLayout = {
  lines: string[];
  subLines: string[];
  fontSize: number;
  subFontSize: number;
  lineHeight: number;
  subLineHeight: number;
  blockWidth: number;
  blockHeight: number;
  /** Верх текстового блока в пикселях кадра. */
  top: number;
  centerX: number;
};

export function layoutOverlay(overlay: TimelineTextOverlay, options: OverlayRenderOptions): OverlayLayout {
  const spec = STYLES[overlay.style] ?? STYLES.clean;
  const fontSize = Math.round(options.width * spec.fontScale);
  const subFontSize = Math.round(options.width * spec.subFontScale);
  const maxWidth = options.width * (1 - spec.sideMargin * 2);

  const text = spec.uppercase ? overlay.text.toUpperCase() : overlay.text;
  const subWeight = Math.max(400, spec.weight - 200);
  const lines = wrapText(text, fontSize, maxWidth, spec.weight);
  const subLines = overlay.subtext ? wrapText(overlay.subtext, subFontSize, maxWidth, subWeight) : [];

  const lineHeight = Math.round(fontSize * 1.22);
  const subLineHeight = Math.round(subFontSize * 1.3);
  const gap = subLines.length > 0 ? Math.round(fontSize * 0.35) : 0;

  const blockHeight = lines.length * lineHeight + gap + subLines.length * subLineHeight;
  const blockWidth = Math.max(
    ...lines.map((line) => estimateTextWidth(line, fontSize, spec.weight)),
    ...subLines.map((line) => estimateTextWidth(line, subFontSize, subWeight)),
    0,
  );

  const safeTop = options.height * 0.08;
  const safeBottom = options.height * 0.92;
  const top = overlay.position === 'top'
    ? safeTop
    : overlay.position === 'center'
      ? (options.height - blockHeight) / 2
      : safeBottom - blockHeight;

  return {
    lines,
    subLines,
    fontSize,
    subFontSize,
    lineHeight,
    subLineHeight,
    blockWidth,
    blockHeight,
    top,
    centerX: options.width / 2,
  };
}

/**
 * SVG титра поверх прозрачного кадра. Возвращается цельный документ, который годится
 * и как `innerHTML` предпросмотра, и как вход sharp.
 */
export function renderOverlaySvg(overlay: TimelineTextOverlay, options: OverlayRenderOptions): string {
  const spec = STYLES[overlay.style] ?? STYLES.clean;
  const layout = layoutOverlay(overlay, options);
  const parts: string[] = [];

  if (spec.plate) {
    const plateWidth = Math.min(options.width * 0.96, layout.blockWidth + spec.plate.padX * 2);
    const plateHeight = layout.blockHeight + spec.plate.padY * 2;
    const plateX = layout.centerX - plateWidth / 2;
    const plateY = layout.top - spec.plate.padY;
    const radius = Math.min(spec.plate.radius, plateHeight / 2);
    parts.push(
      `<rect x="${plateX.toFixed(1)}" y="${plateY.toFixed(1)}" width="${plateWidth.toFixed(1)}" height="${plateHeight.toFixed(1)}" rx="${radius.toFixed(1)}" fill="${spec.plate.fill}"/>`,
    );
  }

  if (spec.rules) {
    const ruleWidth = Math.min(options.width * 0.5, layout.blockWidth + layout.fontSize);
    const ruleX = layout.centerX - ruleWidth / 2;
    const above = layout.top - layout.fontSize * 0.7;
    const below = layout.top + layout.blockHeight + layout.fontSize * 0.5;
    for (const y of [above, below]) {
      parts.push(
        `<rect x="${ruleX.toFixed(1)}" y="${y.toFixed(1)}" width="${ruleWidth.toFixed(1)}" height="2" fill="rgba(255,255,255,0.55)"/>`,
      );
    }
  }

  const fontStyle = spec.italic ? ' font-style="italic"' : '';
  const letterSpacing = spec.letterSpacing ? ` letter-spacing="${(spec.letterSpacing * layout.fontSize).toFixed(2)}"` : '';
  const shadow = spec.shadow ? ' filter="url(#allvision-title-shadow)"' : '';

  let cursor = layout.top;
  const textLines: string[] = [];
  for (const line of layout.lines) {
    // dominant-baseline в librsvg поддерживается неровно, поэтому базовую линию
    // считаем сами: примерно 0.78 кегля от верха строки.
    const baseline = cursor + layout.fontSize * 0.78;
    textLines.push(
      `<text x="${layout.centerX.toFixed(1)}" y="${baseline.toFixed(1)}" text-anchor="middle" font-family="${TITLE_FONT_STACK}" font-size="${layout.fontSize}" font-weight="${spec.weight}"${fontStyle}${letterSpacing} fill="${spec.color}">${escapeXml(line)}</text>`,
    );
    cursor += layout.lineHeight;
  }
  if (layout.subLines.length > 0) {
    cursor += Math.round(layout.fontSize * 0.35);
    for (const line of layout.subLines) {
      const baseline = cursor + layout.subFontSize * 0.78;
      textLines.push(
        `<text x="${layout.centerX.toFixed(1)}" y="${baseline.toFixed(1)}" text-anchor="middle" font-family="${TITLE_FONT_STACK}" font-size="${layout.subFontSize}" font-weight="${Math.max(400, spec.weight - 200)}"${fontStyle} fill="${spec.subColor}">${escapeXml(line)}</text>`,
      );
      cursor += layout.subLineHeight;
    }
  }

  const defs = spec.shadow
    ? '<defs><filter id="allvision-title-shadow" x="-20%" y="-20%" width="140%" height="140%">'
      + '<feDropShadow dx="0" dy="2" stdDeviation="6" flood-color="#000000" flood-opacity="0.75"/>'
      + '</filter></defs>'
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${options.width}" height="${options.height}" viewBox="0 0 ${options.width} ${options.height}">`
    + defs
    + parts.join('')
    + `<g${shadow}>${textLines.join('')}</g>`
    + '</svg>';
}
