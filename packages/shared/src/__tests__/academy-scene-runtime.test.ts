import {
  academySceneSchema,
  createAcademySceneRuntimeState,
  parseAcademyScene,
  resolveAcademySceneElement,
  setSceneInputValue,
  transitionAcademyScene,
  type AcademyScene,
} from '../academy';

function numberCastleFixture(): AcademyScene {
  return parseAcademyScene({
    formatVersion: 1,
    id: 'number-castle-scroll',
    title: 'Замок чисел: волшебный свиток',
    checkMode: 'automatic',
    viewport: { width: 1280, height: 720, backgroundColor: '#fff7ed' },
    initialState: 'intro',
    nextSceneId: 'number-castle-lock',
    states: [
      { id: 'intro', name: 'Вступление', variables: { attempts: 0 }, elementStates: { scroll: 'closed' } },
      { id: 'theory', name: 'Теория', elementStates: { scroll: 'opened' } },
      { id: 'solved', name: 'Решено', elementStates: { reward: 'shown' } },
    ],
    layers: [
      {
        id: 'background-layer',
        name: 'Фон',
        kind: 'background',
        zIndex: 0,
        elements: [{
          id: 'castle-bg',
          name: 'Стены замка',
          type: 'background',
          transform: { x: 0, y: 0, width: 1280, height: 720 },
          style: { fill: '#ffedd5' },
        }],
      },
      {
        id: 'world-layer',
        name: 'Задание',
        kind: 'world',
        zIndex: 10,
        elements: [
          {
            id: 'scroll',
            name: 'Волшебный свиток',
            type: 'card',
            transform: { x: 390, y: 120, width: 500, height: 230 },
            interactive: true,
            content: { text: 'Нажми на свиток, чтобы узнать тайну чисел' },
            style: { fill: '#fef3c7', stroke: '#f59e0b', strokeWidth: 4, borderRadius: 28, fontSize: 30 },
            initialState: 'closed',
            states: [
              { id: 'closed', name: 'Закрыт', overrides: { style: { fill: '#fef3c7' } } },
              { id: 'opened', name: 'Открыт', overrides: { content: { text: 'Три — это 3. Выбери верный ответ!' }, style: { fill: '#ffffff' } } },
            ],
            accessibility: { label: 'Открыть волшебный свиток', keyboardShortcut: 'Enter' },
          },
          {
            id: 'answer-three',
            name: 'Ответ 3',
            type: 'button',
            transform: { x: 500, y: 400, width: 280, height: 90 },
            visible: false,
            interactive: true,
            content: { text: 'Ответ: 3', correctAnswer: true },
            style: { fill: '#f97316', borderRadius: 24, fontSize: 32 },
          },
          {
            id: 'reward',
            name: 'Награда',
            type: 'dialogue',
            transform: { x: 380, y: 520, width: 520, height: 90 },
            visible: false,
            content: { text: 'Верно! Замок открылся.' },
            style: { fill: '#dcfce7', borderRadius: 20, fontSize: 28 },
            initialState: 'hidden',
            states: [
              { id: 'hidden', name: 'Скрыта', overrides: { visible: false } },
              { id: 'shown', name: 'Показана', overrides: { visible: true } },
            ],
          },
          {
            id: 'success-sound',
            name: 'Звук успеха',
            type: 'audio',
            visible: false,
            content: { sourceUrl: '/sounds/success.mp3', volume: 0.6 },
          },
        ],
      },
      {
        id: 'ui-layer',
        name: 'Интерфейс',
        kind: 'ui',
        zIndex: 100,
        elements: [{
          id: 'next-button',
          name: 'Дальше',
          type: 'button',
          transform: { x: 1030, y: 620, width: 190, height: 64 },
          visible: false,
          interactive: true,
          content: { text: 'Дальше →' },
          style: { fill: '#7c3aed', borderRadius: 18, fontSize: 24 },
        }],
      },
    ],
    rules: [
      {
        id: 'open-scroll',
        name: 'Открыть теорию',
        event: { type: 'element-click', sourceElementId: 'scroll' },
        conditions: [{ type: 'state-is', stateId: 'intro' }],
        actions: [
          { type: 'set-state', stateId: 'theory' },
          { type: 'show-element', elementId: 'answer-three' },
          { type: 'play-animation', elementId: 'scroll', value: 'pulse' },
        ],
      },
      {
        id: 'wrong-answer',
        name: 'Подсказка',
        event: { type: 'answer-incorrect', sourceElementId: 'answer-three' },
        conditions: [{ type: 'state-is', stateId: 'theory' }],
        actions: [
          { type: 'show-hint', value: 'Посчитай: один, два, три.' },
          { type: 'set-variable', variable: 'attempts', value: 1 },
        ],
      },
      {
        id: 'correct-answer',
        name: 'Выдать награду',
        event: { type: 'answer-correct', sourceElementId: 'answer-three' },
        conditions: [{ type: 'answer-is-correct' }],
        actions: [
          { type: 'add-score', value: 10 },
          { type: 'set-state', stateId: 'solved' },
          { type: 'show-element', elementId: 'reward' },
          { type: 'show-element', elementId: 'next-button' },
          { type: 'play-sound', elementId: 'success-sound' },
          { type: 'allow-transition', value: true },
          { type: 'emit-event', eventName: 'number-solved' },
        ],
      },
      {
        id: 'go-next',
        name: 'Перейти к замку',
        event: { type: 'element-click', sourceElementId: 'next-button' },
        conditions: [{ type: 'state-is', stateId: 'solved' }, { type: 'score-at-least', value: 10 }],
        actions: [{ type: 'next-scene' }],
      },
      {
        id: 'teacher-hint',
        name: 'Подсказка преподавателя',
        event: { type: 'teacher-action', customName: 'show-hint' },
        conditions: [{ type: 'role-is', role: 'teacher' }],
        actions: [{ type: 'show-hint', value: 'Преподаватель открыл подсказку.' }],
      },
    ],
    metadata: { educationalGoal: 'Связать слово «три» с цифрой 3', estimatedDurationSec: 90, tags: ['математика'] },
  });
}

describe('Academy A6.1 scene format', () => {
  it('parses a versioned scene and fills stable defaults', () => {
    const scene = numberCastleFixture();
    expect(scene.formatVersion).toBe(1);
    expect(scene.layers[0].visible).toBe(true);
    expect(scene.layers[0].elements[0].transform.opacity).toBe(1);
    expect(scene.rules[0].enabled).toBe(true);
  });

  it('rejects duplicate ids and dangling rule references', () => {
    const duplicate = structuredClone(numberCastleFixture());
    duplicate.layers[1].id = duplicate.layers[0].id;
    expect(academySceneSchema.safeParse(duplicate).success).toBe(false);

    const dangling = structuredClone(numberCastleFixture());
    dangling.rules[0].event.sourceElementId = 'missing-element';
    const result = academySceneSchema.safeParse(dangling);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.some((issue) => issue.message === 'Связанный элемент не найден')).toBe(true);
  });
});

describe('Academy A6.1 deterministic scene runtime', () => {
  it('applies click rules, scene state and element overrides', () => {
    const scene = numberCastleFixture();
    const initial = createAcademySceneRuntimeState(scene);
    const result = transitionAcademyScene(scene, initial, {
      type: 'element-click', sourceElementId: 'scroll', role: 'student',
    });

    expect(result.matchedRuleIds).toEqual(['open-scroll']);
    expect(result.state.activeStateId).toBe('theory');
    expect(result.state.visibility['answer-three']).toBe(true);
    expect(result.effects).toContainEqual({ type: 'play-animation', elementId: 'scroll', animation: 'pulse' });

    const scroll = scene.layers[1].elements.find((element) => element.id === 'scroll')!;
    expect(resolveAcademySceneElement(scroll, result.state).content.text).toContain('Выбери верный ответ');
  });

  it('runs answer actions in order and unlocks navigation', () => {
    const scene = numberCastleFixture();
    const theory = transitionAcademyScene(scene, createAcademySceneRuntimeState(scene), {
      type: 'element-click', sourceElementId: 'scroll', role: 'student',
    }).state;
    const solved = transitionAcademyScene(scene, theory, {
      type: 'answer-correct', sourceElementId: 'answer-three', correct: true, role: 'student',
    });

    expect(solved.state.score).toBe(10);
    expect(solved.state.activeStateId).toBe('solved');
    expect(solved.state.visibility.reward).toBe(true);
    expect(solved.state.visibility['next-button']).toBe(true);
    expect(solved.state.transitionAllowed).toBe(true);
    expect(solved.effects).toContainEqual({ type: 'play-sound', elementId: 'success-sound' });
    expect(solved.effects).toContainEqual({ type: 'emit-event', name: 'number-solved' });

    const next = transitionAcademyScene(scene, solved.state, {
      type: 'element-click', sourceElementId: 'next-button', role: 'student',
    });
    expect(next.state.nextSceneId).toBe('number-castle-lock');
    expect(next.effects).toContainEqual({ type: 'navigate', sceneId: 'number-castle-lock' });
  });

  it('keeps teacher-only actions role-safe and records an incorrect attempt', () => {
    const scene = numberCastleFixture();
    const initial = createAcademySceneRuntimeState(scene);
    const student = transitionAcademyScene(scene, initial, {
      type: 'teacher-action', customName: 'show-hint', role: 'student',
    });
    expect(student.matchedRuleIds).toEqual([]);

    const teacher = transitionAcademyScene(scene, initial, {
      type: 'teacher-action', customName: 'show-hint', role: 'teacher',
    });
    expect(teacher.state.hints).toEqual(['Преподаватель открыл подсказку.']);

    const theory = transitionAcademyScene(scene, initial, {
      type: 'element-click', sourceElementId: 'scroll', role: 'student',
    }).state;
    const wrong = transitionAcademyScene(scene, theory, {
      type: 'answer-incorrect', sourceElementId: 'answer-three', correct: false, role: 'student',
    });
    expect(wrong.state.variables.attempts).toBe(1);
    expect(wrong.state.hints.at(-1)).toBe('Посчитай: один, два, три.');
  });

  it('honours priority and stopPropagation for deterministic authoring', () => {
    const base = numberCastleFixture();
    const scene = parseAcademyScene({
      ...base,
      rules: [
        {
          id: 'low-priority',
          name: 'Низкий приоритет',
          priority: 0,
          event: { type: 'custom', customName: 'priority-check' },
          actions: [{ type: 'set-variable', variable: 'winner', value: 'low' }],
        },
        {
          id: 'high-priority',
          name: 'Высокий приоритет',
          priority: 100,
          event: { type: 'custom', customName: 'priority-check' },
          actions: [{ type: 'set-variable', variable: 'winner', value: 'high' }],
          stopPropagation: true,
        },
      ],
    });
    const result = transitionAcademyScene(scene, createAcademySceneRuntimeState(scene), {
      type: 'custom', customName: 'priority-check', role: 'student',
    });
    expect(result.matchedRuleIds).toEqual(['high-priority']);
    expect(result.state.variables.winner).toBe('high');
  });

  it('does not navigate until an explicit action unlocks the transition', () => {
    const base = numberCastleFixture();
    const scene = parseAcademyScene({
      ...base,
      rules: [{
        id: 'locked-next',
        name: 'Закрытый переход',
        event: { type: 'custom', customName: 'try-next' },
        actions: [{ type: 'next-scene' }],
      }],
    });
    const result = transitionAcademyScene(scene, createAcademySceneRuntimeState(scene), {
      type: 'custom', customName: 'try-next', role: 'student',
    });
    expect(result.state.nextSceneId).toBeNull();
    expect(result.effects).not.toContainEqual({ type: 'navigate', sceneId: 'number-castle-lock' });
  });

  it('checks a typed input answer via input-correct/input-incorrect conditions', () => {
    const scene = parseAcademyScene({
      formatVersion: 1,
      id: 'answer-check',
      title: 'Проверка ответа',
      checkMode: 'automatic',
      viewport: { width: 1280, height: 720, backgroundColor: '#ffffff' },
      initialState: 'main',
      states: [{ id: 'main', name: 'Основное' }],
      layers: [{
        id: 'ui', name: 'UI', kind: 'ui', zIndex: 0,
        elements: [
          { id: 'answer', name: 'Ответ', type: 'input', content: { correctAnswer: 'apple', acceptedValues: ['яблоко'] } },
          { id: 'check', name: 'Проверить', type: 'button', interactive: true, content: { text: 'Проверить' } },
        ],
      }],
      rules: [
        { id: 'ok', name: 'Верно', event: { type: 'element-click', sourceElementId: 'check' }, conditions: [{ type: 'input-correct', elementId: 'answer' }], actions: [{ type: 'add-score', value: 10 }] },
        { id: 'no', name: 'Неверно', event: { type: 'element-click', sourceElementId: 'check' }, conditions: [{ type: 'input-incorrect', elementId: 'answer' }], actions: [{ type: 'show-hint', value: 'Ещё раз' }] },
      ],
    });

    // Пустое поле — ответ неверный.
    let state = createAcademySceneRuntimeState(scene);
    let result = transitionAcademyScene(scene, state, { type: 'element-click', sourceElementId: 'check', role: 'student' });
    expect(result.matchedRuleIds).toEqual(['no']);
    expect(result.state.score).toBe(0);

    // Правильный ответ (регистр/пробелы игнорируются).
    state = setSceneInputValue(createAcademySceneRuntimeState(scene), 'answer', '  Apple ');
    result = transitionAcademyScene(scene, state, { type: 'element-click', sourceElementId: 'check', role: 'student' });
    expect(result.matchedRuleIds).toEqual(['ok']);
    expect(result.state.score).toBe(10);

    // Синоним из acceptedValues тоже засчитывается.
    state = setSceneInputValue(createAcademySceneRuntimeState(scene), 'answer', 'Яблоко');
    result = transitionAcademyScene(scene, state, { type: 'element-click', sourceElementId: 'check', role: 'student' });
    expect(result.matchedRuleIds).toEqual(['ok']);
  });
});
