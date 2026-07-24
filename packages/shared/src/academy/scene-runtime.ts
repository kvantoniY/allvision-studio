import type {
  AcademyScene,
  AcademySceneAction,
  AcademySceneElement,
  AcademySceneScalar,
} from './scene-format';

export type AcademyScenePlayerRole = 'student' | 'teacher';

export interface AcademySceneRuntimeEvent {
  type: AcademyScene['rules'][number]['event']['type'];
  sourceElementId?: string;
  targetElementId?: string;
  key?: string;
  customName?: string;
  value?: AcademySceneScalar;
  correct?: boolean;
  role: AcademyScenePlayerRole;
}

export interface AcademySceneRuntimeState {
  sceneId: string;
  activeStateId: string;
  elementStates: Record<string, string>;
  visibility: Record<string, boolean>;
  variables: Record<string, AcademySceneScalar>;
  score: number;
  hints: string[];
  transitionAllowed: boolean;
  nextSceneId: string | null;
  animations: Record<string, string>;
  poses: Record<string, string>;
  playedSounds: string[];
  emittedEvents: string[];
  revision: number;
}

export type AcademySceneRuntimeEffect =
  | { type: 'play-sound'; elementId: string }
  | { type: 'show-hint'; text: string }
  | { type: 'play-animation'; elementId: string; animation: string }
  | { type: 'navigate'; sceneId: string | null }
  | { type: 'emit-event'; name: string };

export interface AcademySceneTransitionResult {
  state: AcademySceneRuntimeState;
  matchedRuleIds: string[];
  effects: AcademySceneRuntimeEffect[];
}

function allElements(scene: AcademyScene): AcademySceneElement[] {
  return scene.layers.flatMap((layer) => layer.elements);
}

function sceneState(scene: AcademyScene, stateId: string) {
  return scene.states.find((state) => state.id === stateId) ?? scene.states[0];
}

function elementStateVisibility(element: AcademySceneElement, stateId: string | undefined): boolean {
  return element.states.find((state) => state.id === stateId)?.overrides.visible ?? element.visible;
}

export function createAcademySceneRuntimeState(scene: AcademyScene): AcademySceneRuntimeState {
  const initial = sceneState(scene, scene.initialState);
  const elementStates = {
    ...Object.fromEntries(allElements(scene).flatMap((element) => (
      element.initialState ? [[element.id, element.initialState]] : []
    ))),
    ...initial.elementStates,
  };
  return {
    sceneId: scene.id,
    activeStateId: initial.id,
    elementStates,
    visibility: Object.fromEntries(allElements(scene).map((element) => [
      element.id,
      elementStateVisibility(element, elementStates[element.id]),
    ])),
    variables: { ...initial.variables },
    score: 0,
    hints: [],
    transitionAllowed: false,
    nextSceneId: null,
    animations: {},
    poses: {},
    playedSounds: [],
    emittedEvents: [],
    revision: 0,
  };
}

function eventMatches(ruleEvent: AcademyScene['rules'][number]['event'], event: AcademySceneRuntimeEvent): boolean {
  if (ruleEvent.type !== event.type) return false;
  if (ruleEvent.sourceElementId && ruleEvent.sourceElementId !== event.sourceElementId) return false;
  if (ruleEvent.key && ruleEvent.key.toLowerCase() !== event.key?.toLowerCase()) return false;
  if (ruleEvent.customName && ruleEvent.customName !== event.customName) return false;
  return true;
}

function compareNumbers(left: AcademySceneScalar, right: AcademySceneScalar, operation: 'gt' | 'lt'): boolean {
  return typeof left === 'number' && typeof right === 'number'
    ? operation === 'gt' ? left > right : left < right
    : false;
}

/** Нормализация ответа для сравнения: строки — trim + нижний регистр, числа/булевы как есть. */
function normalizeAnswer(value: AcademySceneScalar | undefined): AcademySceneScalar {
  if (typeof value === 'string') return value.trim().toLowerCase();
  return value ?? '';
}

/**
 * Правильно ли заполнено поле ввода: сравнивает текущее значение (variables[elementId])
 * с content.correctAnswer и списком content.acceptedValues.
 */
function isInputCorrect(scene: AcademyScene, state: AcademySceneRuntimeState, elementId: string | undefined): boolean {
  if (!elementId) return false;
  const element = allElements(scene).find((item) => item.id === elementId);
  if (!element) return false;
  const candidates = [element.content.correctAnswer, ...(element.content.acceptedValues ?? [])]
    .filter((value) => value !== undefined && value !== null)
    .map(normalizeAnswer);
  if (candidates.length === 0) return false;
  const current = normalizeAnswer(state.variables[elementId] as AcademySceneScalar);
  return candidates.some((candidate) => candidate === current);
}

function conditionMatches(
  scene: AcademyScene,
  condition: AcademyScene['rules'][number]['conditions'][number],
  state: AcademySceneRuntimeState,
  event: AcademySceneRuntimeEvent,
): boolean {
  switch (condition.type) {
    case 'always': return true;
    case 'state-is': return state.activeStateId === condition.stateId;
    case 'state-is-not': return state.activeStateId !== condition.stateId;
    case 'variable-equals': return state.variables[condition.variable!] === condition.value;
    case 'variable-not-equals': return state.variables[condition.variable!] !== condition.value;
    case 'variable-greater-than': return compareNumbers(state.variables[condition.variable!], condition.value!, 'gt');
    case 'variable-less-than': return compareNumbers(state.variables[condition.variable!], condition.value!, 'lt');
    case 'score-at-least': return state.score >= (condition.value as number);
    case 'score-below': return state.score < (condition.value as number);
    case 'element-visible': return state.visibility[condition.elementId!] === true;
    case 'element-hidden': return state.visibility[condition.elementId!] === false;
    case 'role-is': return event.role === condition.role;
    case 'answer-is-correct': return event.correct === true || event.type === 'answer-correct';
    case 'input-correct': return isInputCorrect(scene, state, condition.elementId);
    case 'input-incorrect': return !isInputCorrect(scene, state, condition.elementId);
    default: return false;
  }
}

/** Записывает набранное учеником значение поля ввода в переменные состояния (для проверки ответа). */
export function setSceneInputValue(
  state: AcademySceneRuntimeState,
  elementId: string,
  value: AcademySceneScalar,
): AcademySceneRuntimeState {
  return { ...state, variables: { ...state.variables, [elementId]: value }, revision: state.revision + 1 };
}

function applySceneState(scene: AcademyScene, state: AcademySceneRuntimeState, stateId: string): AcademySceneRuntimeState {
  const target = sceneState(scene, stateId);
  const elements = new Map(allElements(scene).map((element) => [element.id, element]));
  const visibility = { ...state.visibility };
  Object.entries(target.elementStates).forEach(([elementId, elementStateId]) => {
    const element = elements.get(elementId);
    const override = element?.states.find((item) => item.id === elementStateId)?.overrides.visible;
    if (override !== undefined) visibility[elementId] = override;
  });
  return {
    ...state,
    activeStateId: target.id,
    elementStates: { ...state.elementStates, ...target.elementStates },
    visibility,
    variables: { ...state.variables, ...target.variables },
  };
}

function applyAction(
  scene: AcademyScene,
  current: AcademySceneRuntimeState,
  action: AcademySceneAction,
): { state: AcademySceneRuntimeState; effects: AcademySceneRuntimeEffect[] } {
  let state = current;
  const effects: AcademySceneRuntimeEffect[] = [];
  const elementId = action.elementId;

  switch (action.type) {
    case 'show-element':
      state = { ...state, visibility: { ...state.visibility, [elementId!]: true } };
      break;
    case 'hide-element':
      state = { ...state, visibility: { ...state.visibility, [elementId!]: false } };
      break;
    case 'toggle-element':
      state = { ...state, visibility: { ...state.visibility, [elementId!]: !state.visibility[elementId!] } };
      break;
    case 'play-sound':
      state = { ...state, playedSounds: [...state.playedSounds, elementId!] };
      effects.push({ type: 'play-sound', elementId: elementId! });
      break;
    case 'set-pose':
      state = { ...state, poses: { ...state.poses, [elementId!]: action.value as string } };
      break;
    case 'play-animation':
      state = { ...state, animations: { ...state.animations, [elementId!]: action.value as string } };
      effects.push({ type: 'play-animation', elementId: elementId!, animation: action.value as string });
      break;
    case 'add-score':
      state = { ...state, score: state.score + (action.value as number) };
      break;
    case 'show-hint':
      state = { ...state, hints: [...state.hints, action.value as string] };
      effects.push({ type: 'show-hint', text: action.value as string });
      break;
    case 'set-state':
      state = applySceneState(scene, state, action.stateId!);
      break;
    case 'set-variable':
      state = { ...state, variables: { ...state.variables, [action.variable!]: action.value! } };
      break;
    case 'allow-transition':
      state = { ...state, transitionAllowed: action.value !== false };
      break;
    case 'next-scene': {
      const target = action.targetSceneId ?? scene.nextSceneId ?? null;
      if (state.transitionAllowed) {
        state = { ...state, nextSceneId: target };
        effects.push({ type: 'navigate', sceneId: target });
      }
      break;
    }
    case 'emit-event':
      state = { ...state, emittedEvents: [...state.emittedEvents, action.eventName!] };
      effects.push({ type: 'emit-event', name: action.eventName! });
      break;
  }

  return { state, effects };
}

/** Детерминированная машина «событие → условия → действия», независимая от PixiJS. */
export function transitionAcademyScene(
  scene: AcademyScene,
  current: AcademySceneRuntimeState,
  event: AcademySceneRuntimeEvent,
): AcademySceneTransitionResult {
  let state = current;
  const effects: AcademySceneRuntimeEffect[] = [];
  const matchedRuleIds: string[] = [];
  const rules = scene.rules
    .map((rule, index) => ({ rule, index }))
    .filter(({ rule }) => rule.enabled && eventMatches(rule.event, event))
    .sort((left, right) => right.rule.priority - left.rule.priority || left.index - right.index);

  for (const { rule } of rules) {
    if (!rule.conditions.every((condition) => conditionMatches(scene, condition, state, event))) continue;
    matchedRuleIds.push(rule.id);
    for (const action of rule.actions) {
      const applied = applyAction(scene, state, action);
      state = applied.state;
      effects.push(...applied.effects);
    }
    if (rule.stopPropagation) break;
  }

  return { state: { ...state, revision: state.revision + 1 }, matchedRuleIds, effects };
}

/** Накладывает выбранное состояние элемента поверх базовой конфигурации. */
export function resolveAcademySceneElement(
  element: AcademySceneElement,
  runtime: AcademySceneRuntimeState,
): AcademySceneElement {
  const selectedState = element.states.find((state) => state.id === runtime.elementStates[element.id]);
  const overrides = selectedState?.overrides;
  return {
    ...element,
    visible: runtime.visibility[element.id] ?? overrides?.visible ?? element.visible,
    transform: { ...element.transform, ...overrides?.transform },
    content: { ...element.content, ...overrides?.content },
    style: { ...element.style, ...overrides?.style },
  };
}
