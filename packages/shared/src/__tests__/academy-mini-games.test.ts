import {
  applyMiniGameMove,
  buildMiniGameBoard,
  createMiniGameState,
  miniGameConfigSchema,
  normalizeMiniGameState,
} from '../academy/mini-games';

const memory = miniGameConfigSchema.parse({ kind: 'memory', count: 3, seed: 42 });
const match = miniGameConfigSchema.parse({ kind: 'match', count: 3, seed: 7 });

describe('mini-game board', () => {
  it('раскладывает поле детерминированно: у учителя и ученика одинаковые карточки', () => {
    const first = buildMiniGameBoard(memory);
    const second = buildMiniGameBoard(memory);
    expect(first.cells.map((cell) => cell.itemId)).toEqual(second.cells.map((cell) => cell.itemId));
    // Другой seed — другая раскладка, иначе игра всегда одна и та же.
    const other = buildMiniGameBoard({ ...memory, seed: 43 });
    expect(other.cells.map((cell) => cell.itemId)).not.toEqual(first.cells.map((cell) => cell.itemId));
  });

  it('в «Найди пару» каждая карточка встречается дважды, цель — число пар', () => {
    const board = buildMiniGameBoard(memory);
    expect(board.cells).toHaveLength(6);
    expect(board.target).toBe(3);
    const counts = new Map<string, number>();
    board.cells.forEach((cell) => counts.set(cell.itemId, (counts.get(cell.itemId) ?? 0) + 1));
    expect([...counts.values()].every((count) => count === 2)).toBe(true);
  });

  it('без загруженных карточек берёт дефолтный набор — сцена играбельна сразу', () => {
    const board = buildMiniGameBoard(miniGameConfigSchema.parse({ kind: 'memory', count: 4 }));
    expect(board.cells).toHaveLength(8);
    expect(board.cells.every((cell) => cell.emoji || cell.label || cell.imageUrl)).toBe(true);
  });
});

describe('mini-game moves', () => {
  it('открывает пару, засчитывает совпадение и завершает игру', () => {
    const board = buildMiniGameBoard(memory);
    let state = createMiniGameState();
    let completed = false;

    for (const target of new Set(board.cells.map((cell) => cell.itemId))) {
      const [first, second] = board.cells.filter((cell) => cell.itemId === target);
      const picked = applyMiniGameMove(board, state, first.index);
      expect(picked.outcome).toBe('picked');
      state = picked.state;
      const matched = applyMiniGameMove(board, state, second.index);
      expect(['correct', 'complete']).toContain(matched.outcome);
      state = matched.state;
      if (matched.outcome === 'complete') completed = true;
    }

    expect(completed).toBe(true);
    expect(state.done).toBe(true);
    expect(state.mistakes).toBe(0);
    expect(state.solved).toHaveLength(6);
  });

  it('неверная пара считает ошибку и просит закрыть обе карточки', () => {
    const board = buildMiniGameBoard(memory);
    const first = board.cells[0];
    const different = board.cells.find((cell) => cell.itemId !== first.itemId)!;
    const afterFirst = applyMiniGameMove(board, createMiniGameState(), first.index);
    const result = applyMiniGameMove(board, afterFirst.state, different.index);
    expect(result.outcome).toBe('incorrect');
    expect(result.state.mistakes).toBe(1);
    expect(result.resetCells).toEqual([first.index, different.index]);
    expect(result.state.picked).toEqual([]);
  });

  it('повторный клик по уже открытой карточке игнорируется', () => {
    const board = buildMiniGameBoard(memory);
    const picked = applyMiniGameMove(board, createMiniGameState(), board.cells[0].index);
    const again = applyMiniGameMove(board, picked.state, board.cells[0].index);
    expect(again.outcome).toBe('ignored');
    expect(again.state).toBe(picked.state);
  });

  it('в «Соедини пары» две картинки одной колонки не считаются парой', () => {
    const board = buildMiniGameBoard(match);
    const left = board.cells.filter((cell) => cell.side === 'left');
    const right = board.cells.filter((cell) => cell.side === 'right');
    // Два клика по левой колонке — не пара, даже если это одна и та же тема.
    const sameSide = applyMiniGameMove(
      board,
      applyMiniGameMove(board, createMiniGameState(), left[0].index).state,
      left[1].index,
    );
    expect(sameSide.outcome).toBe('incorrect');

    // Левая + правая с тем же itemId — засчитывается.
    const pair = right.find((cell) => cell.itemId === left[0].itemId)!;
    const correct = applyMiniGameMove(
      board,
      applyMiniGameMove(board, createMiniGameState(), left[0].index).state,
      pair.index,
    );
    expect(correct.outcome).toBe('correct');
  });

  it('в «Выбери правильное» неверный вариант не блокирует игру, верный завершает', () => {
    const quiz = miniGameConfigSchema.parse({
      kind: 'quiz',
      seed: 3,
      count: 3,
      items: [
        { id: 'a', label: 'Два', correct: true },
        { id: 'b', label: 'Три' },
        { id: 'c', label: 'Пять' },
      ],
    });
    const board = buildMiniGameBoard(quiz);
    const wrong = board.cells.find((cell) => !cell.correct)!;
    const right = board.cells.find((cell) => cell.correct)!;
    const missed = applyMiniGameMove(board, createMiniGameState(), wrong.index);
    expect(missed.outcome).toBe('incorrect');
    expect(missed.state.done).toBe(false);
    const hit = applyMiniGameMove(board, missed.state, right.index);
    expect(hit.outcome).toBe('complete');
    expect(hit.state.done).toBe(true);
  });
});

describe('mini-game state sync', () => {
  it('чистит мусор из снимка, пришедшего по сети или из Redis', () => {
    const normalized = normalizeMiniGameState({
      picked: [1, 'x', -4, 2],
      solved: [0, null],
      mistakes: -5,
      done: 'yes',
      extra: 'ignored',
    });
    expect(normalized).toEqual({ picked: [1, 2], solved: [0], mistakes: 0, done: false });
  });

  it('пустой снимок даёт валидное начальное состояние', () => {
    expect(normalizeMiniGameState(undefined)).toEqual({ picked: [], solved: [], mistakes: 0, done: false });
  });
});
