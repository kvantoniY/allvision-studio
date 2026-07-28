import { z } from 'zod';

/**
 * Интерактивные мини-игры внутри сцены урока (A13).
 *
 * Вся логика — чистая и детерминированная: раскладка карточек считается из seed,
 * поэтому учитель и ученик видят ОДНО И ТО ЖЕ поле, а состояние игры — это компактный
 * снимок (`picked`/`solved`), который синхронизируется по WebSocket и переживает
 * перезагрузку страницы (комната хранит его в Redis).
 */

export const MINI_GAME_KINDS = ['memory', 'match', 'quiz'] as const;
export type MiniGameKind = (typeof MINI_GAME_KINDS)[number];

export const MINI_GAME_KIND_LABELS: Record<MiniGameKind, string> = {
  memory: 'Найди пару',
  match: 'Соедини пары',
  quiz: 'Выбери правильное',
};

export const MINI_GAME_KIND_DESCRIPTIONS: Record<MiniGameKind, string> = {
  memory: 'Карточки лежат рубашкой вверх. Ребёнок открывает по две и ищет одинаковые.',
  match: 'Слева — картинки, справа — подписи. Ребёнок соединяет пары кликом.',
  quiz: 'Вопрос и несколько вариантов: ребёнок выбирает правильный.',
};

export const miniGameItemSchema = z.object({
  id: z.string().trim().min(1).max(60),
  /** Подпись карточки. Для quiz — текст варианта ответа. */
  label: z.string().trim().max(120).optional(),
  /** Картинка карточки: публичный URL материала из библиотеки или загруженного файла. */
  imageUrl: z.string().trim().min(1).max(2000).optional(),
  /** Эмодзи-заглушка, если ни картинки, ни подписи нет (дефолтные наборы). */
  emoji: z.string().trim().max(8).optional(),
  /** Для quiz: этот вариант правильный. */
  correct: z.boolean().optional(),
  /** Для match: подпись правой колонки (пара к картинке слева). */
  pairLabel: z.string().trim().max(120).optional(),
}).strict();

export const miniGameConfigSchema = z.object({
  kind: z.enum(MINI_GAME_KINDS).default('memory'),
  /** Задание, которое ребёнок видит над полем. */
  instruction: z.string().trim().max(300).optional(),
  items: z.array(miniGameItemSchema).max(12).default([]),
  /** Сколько пар/вариантов взять из items (остальные не показываются). */
  count: z.number().int().min(2).max(8).default(4),
  /**
   * Seed раскладки. Фиксируется в шаблоне, поэтому у учителя и ученика (и после
   * перезагрузки) карточки лежат одинаково.
   */
  seed: z.number().int().min(0).max(2 ** 31).default(1),
  /** Показывать счётчик ошибок ребёнку. */
  showMistakes: z.boolean().default(true),
}).strict();

export type MiniGameItem = z.infer<typeof miniGameItemSchema>;
export type MiniGameConfig = z.infer<typeof miniGameConfigSchema>;

// === Дефолтные наборы: сцена работает сразу, даже если админ ничего не загрузил ===

export const MINI_GAME_DEFAULT_SETS: Record<string, { title: string; items: MiniGameItem[] }> = {
  fruits: {
    title: 'Фрукты',
    items: [
      { id: 'apple', emoji: '🍎', label: 'Яблоко', pairLabel: 'Apple' },
      { id: 'banana', emoji: '🍌', label: 'Банан', pairLabel: 'Banana' },
      { id: 'grapes', emoji: '🍇', label: 'Виноград', pairLabel: 'Grapes' },
      { id: 'lemon', emoji: '🍋', label: 'Лимон', pairLabel: 'Lemon' },
      { id: 'cherry', emoji: '🍒', label: 'Вишня', pairLabel: 'Cherry' },
      { id: 'melon', emoji: '🍉', label: 'Арбуз', pairLabel: 'Watermelon' },
      { id: 'peach', emoji: '🍑', label: 'Персик', pairLabel: 'Peach' },
      { id: 'pear', emoji: '🍐', label: 'Груша', pairLabel: 'Pear' },
    ],
  },
  animals: {
    title: 'Животные',
    items: [
      { id: 'cat', emoji: '🐱', label: 'Кот', pairLabel: 'Cat' },
      { id: 'dog', emoji: '🐶', label: 'Собака', pairLabel: 'Dog' },
      { id: 'fox', emoji: '🦊', label: 'Лиса', pairLabel: 'Fox' },
      { id: 'bear', emoji: '🐻', label: 'Медведь', pairLabel: 'Bear' },
      { id: 'frog', emoji: '🐸', label: 'Лягушка', pairLabel: 'Frog' },
      { id: 'owl', emoji: '🦉', label: 'Сова', pairLabel: 'Owl' },
      { id: 'lion', emoji: '🦁', label: 'Лев', pairLabel: 'Lion' },
      { id: 'panda', emoji: '🐼', label: 'Панда', pairLabel: 'Panda' },
    ],
  },
  numbers: {
    title: 'Числа',
    items: [
      { id: 'n1', emoji: '1️⃣', label: 'Один', pairLabel: 'One' },
      { id: 'n2', emoji: '2️⃣', label: 'Два', pairLabel: 'Two' },
      { id: 'n3', emoji: '3️⃣', label: 'Три', pairLabel: 'Three' },
      { id: 'n4', emoji: '4️⃣', label: 'Четыре', pairLabel: 'Four' },
      { id: 'n5', emoji: '5️⃣', label: 'Пять', pairLabel: 'Five' },
      { id: 'n6', emoji: '6️⃣', label: 'Шесть', pairLabel: 'Six' },
      { id: 'n7', emoji: '7️⃣', label: 'Семь', pairLabel: 'Seven' },
      { id: 'n8', emoji: '8️⃣', label: 'Восемь', pairLabel: 'Eight' },
    ],
  },
};

/** Набор по умолчанию, если у игры нет ни одной карточки. */
export function miniGameItems(config: MiniGameConfig): MiniGameItem[] {
  const filled = config.items.filter((item) => item.imageUrl || item.label || item.emoji);
  const source = filled.length >= 2 ? filled : MINI_GAME_DEFAULT_SETS.fruits.items;
  return source.slice(0, Math.min(config.count, source.length));
}

// === Детерминированная раскладка ===

/** mulberry32 — короткий стабильный PRNG: одинаковый seed даёт одинаковый порядок. */
function prng(seed: number): () => number {
  let state = (seed || 1) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(input: T[], seed: number): T[] {
  const random = prng(seed);
  const list = [...input];
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

/** Одна ячейка поля: чем она является для игрока. */
export interface MiniGameCell {
  /** Позиция в раскладке (по ней идёт синхронизация ходов). */
  index: number;
  /** id исходной карточки — пара ищется по нему. */
  itemId: string;
  label?: string;
  imageUrl?: string;
  emoji?: string;
  /** Для match: ячейка правой колонки (подпись), а не картинка. */
  side?: 'left' | 'right';
  correct?: boolean;
}

export interface MiniGameBoard {
  kind: MiniGameKind;
  instruction: string;
  cells: MiniGameCell[];
  /** Сколько пар/правильных ответов нужно набрать для победы. */
  target: number;
  /** Колонок в сетке — плеер использует для раскладки. */
  columns: number;
}

/** Строит поле игры. Чистая функция от конфига: у обеих ролей результат одинаковый. */
export function buildMiniGameBoard(config: MiniGameConfig): MiniGameBoard {
  const items = miniGameItems(config);
  const instruction = config.instruction?.trim() || defaultInstruction(config.kind);

  if (config.kind === 'memory') {
    const doubled = items.flatMap((item) => [item, item]);
    const cells = shuffle(doubled, config.seed).map((item, index) => ({
      index,
      itemId: item.id,
      label: item.label,
      imageUrl: item.imageUrl,
      emoji: item.emoji,
    }));
    return { kind: 'memory', instruction, cells, target: items.length, columns: cells.length > 8 ? 4 : cells.length > 4 ? 4 : 2 };
  }

  if (config.kind === 'match') {
    const left = items.map((item, index) => ({
      index,
      itemId: item.id,
      label: item.label,
      imageUrl: item.imageUrl,
      emoji: item.emoji,
      side: 'left' as const,
    }));
    // Правая колонка перемешана — иначе пары стоят строка в строку и игры нет.
    const right = shuffle(items, config.seed + 7).map((item, position) => ({
      index: items.length + position,
      itemId: item.id,
      label: item.pairLabel ?? item.label ?? item.id,
      side: 'right' as const,
    }));
    // Порядок в массиве — это порядок отрисовки в сетке из двух колонок, поэтому
    // чередуем: строка = картинка слева и (перемешанная) подпись справа.
    const interleaved: MiniGameCell[] = [];
    for (let row = 0; row < items.length; row += 1) {
      if (left[row]) interleaved.push(left[row]);
      if (right[row]) interleaved.push(right[row]);
    }
    return { kind: 'match', instruction, cells: interleaved, target: items.length, columns: 2 };
  }

  // quiz: один вопрос — несколько вариантов, правильный помечен в конфиге.
  const cells = shuffle(items, config.seed).map((item, index) => ({
    index,
    itemId: item.id,
    label: item.label ?? item.pairLabel ?? item.id,
    imageUrl: item.imageUrl,
    emoji: item.emoji,
    correct: item.correct === true,
  }));
  const correctCount = cells.filter((cell) => cell.correct).length;
  return { kind: 'quiz', instruction, cells, target: Math.max(1, correctCount), columns: 2 };
}

function defaultInstruction(kind: MiniGameKind): string {
  if (kind === 'memory') return 'Найди все пары';
  if (kind === 'match') return 'Соедини картинку с подписью';
  return 'Выбери правильный вариант';
}

// === Состояние игры (синхронизируется и переживает перезагрузку) ===

export interface MiniGameState {
  /** Открытые сейчас ячейки (ждут проверки). */
  picked: number[];
  /** Уже отгаданные ячейки — остаются открытыми. */
  solved: number[];
  /** Счётчик неверных попыток. */
  mistakes: number;
  /** Игра завершена. */
  done: boolean;
}

export const EMPTY_MINI_GAME_STATE: MiniGameState = { picked: [], solved: [], mistakes: 0, done: false };

export function createMiniGameState(): MiniGameState {
  return { ...EMPTY_MINI_GAME_STATE, picked: [], solved: [] };
}

export interface MiniGameMoveResult {
  state: MiniGameState;
  /** Что произошло — плеер по этому рисует реакцию и шлёт события сцены. */
  outcome: 'ignored' | 'picked' | 'correct' | 'incorrect' | 'complete';
  /** Ячейки, которые нужно закрыть обратно после паузы (неверная пара). */
  resetCells: number[];
}

/**
 * Применяет клик по ячейке. Чистая функция: одинаково выполняется у обеих ролей,
 * поэтому синхронизировать достаточно итоговое состояние.
 */
export function applyMiniGameMove(board: MiniGameBoard, state: MiniGameState, index: number): MiniGameMoveResult {
  const cell = board.cells.find((item) => item.index === index);
  if (!cell || state.done || state.solved.includes(index) || state.picked.includes(index)) {
    return { state, outcome: 'ignored', resetCells: [] };
  }

  if (board.kind === 'quiz') {
    if (cell.correct) {
      const solved = [...state.solved, index];
      const done = solved.length >= board.target;
      return {
        state: { ...state, picked: [], solved, done },
        outcome: done ? 'complete' : 'correct',
        resetCells: [],
      };
    }
    return {
      state: { ...state, picked: [], mistakes: state.mistakes + 1 },
      outcome: 'incorrect',
      resetCells: [index],
    };
  }

  const picked = [...state.picked, index];
  if (picked.length < 2) {
    return { state: { ...state, picked }, outcome: 'picked', resetCells: [] };
  }

  const [firstIndex, secondIndex] = picked;
  const first = board.cells.find((item) => item.index === firstIndex);
  const second = board.cells.find((item) => item.index === secondIndex);
  const samePair = Boolean(first && second && first.itemId === second.itemId && first.index !== second.index);
  // В «Соедини пары» пара обязана состоять из левой и правой колонки, иначе
  // ребёнок «соединит» две картинки между собой.
  const validSides = board.kind !== 'match' || (first?.side !== second?.side);

  if (samePair && validSides) {
    const solved = [...state.solved, firstIndex, secondIndex];
    const done = solved.length >= board.target * 2;
    return {
      state: { picked: [], solved, mistakes: state.mistakes, done },
      outcome: done ? 'complete' : 'correct',
      resetCells: [],
    };
  }

  return {
    state: { ...state, picked: [], mistakes: state.mistakes + 1 },
    outcome: 'incorrect',
    resetCells: picked,
  };
}

/** Нормализация снимка из сети/Redis: чужие поля и мусор не должны ломать плеер. */
export function normalizeMiniGameState(raw: unknown): MiniGameState {
  const value = (raw ?? {}) as Partial<MiniGameState>;
  const ints = (list: unknown): number[] => Array.isArray(list)
    ? list.filter((item): item is number => Number.isInteger(item) && item >= 0 && item < 100).slice(0, 40)
    : [];
  return {
    picked: ints(value.picked),
    solved: ints(value.solved),
    mistakes: Number.isFinite(value.mistakes) ? Math.max(0, Math.min(999, Number(value.mistakes))) : 0,
    done: value.done === true,
  };
}
