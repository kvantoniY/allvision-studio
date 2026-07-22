import { z } from 'zod';

// === Формат интерактивной сцены Academy (A6.1) ===

export const ACADEMY_SCENE_FORMAT_VERSION = 1 as const;

export const ACADEMY_SCENE_LAYER_KINDS = [
  'background',
  'world',
  'foreground',
  'ui',
  'overlay',
  'audio',
] as const;

export const ACADEMY_SCENE_ELEMENT_TYPES = [
  'background',
  'animated-background',
  'video',
  'foreground',
  'image',
  'character',
  'npc',
  'prop',
  'text',
  'dialogue',
  'button',
  'card',
  'input',
  'indicator',
  'timer',
  'progress',
  'particles',
  'audio',
  'hotspot',
  'collision',
  'platform',
] as const;

export const ACADEMY_SCENE_EVENT_TYPES = [
  'scene-start',
  'element-click',
  'key-press',
  'drag-start',
  'drag-end',
  'drop',
  'answer-correct',
  'answer-incorrect',
  'timer-finished',
  'teacher-action',
  'video-ended',
  'ai-result',
  'code-result',
  'custom',
] as const;

export const ACADEMY_SCENE_CONDITION_TYPES = [
  'always',
  'state-is',
  'state-is-not',
  'variable-equals',
  'variable-not-equals',
  'variable-greater-than',
  'variable-less-than',
  'score-at-least',
  'score-below',
  'element-visible',
  'element-hidden',
  'role-is',
  'answer-is-correct',
] as const;

export const ACADEMY_SCENE_ACTION_TYPES = [
  'show-element',
  'hide-element',
  'toggle-element',
  'play-sound',
  'set-pose',
  'play-animation',
  'add-score',
  'show-hint',
  'set-state',
  'set-variable',
  'allow-transition',
  'next-scene',
  'emit-event',
] as const;

export const ACADEMY_SCENE_CHECK_MODES = [
  'automatic',
  'teacher',
  'mixed',
  'voice-with-confirmation',
  'creative',
] as const;

export const ACADEMY_SCENE_ELEMENT_TYPE_LABELS: Record<(typeof ACADEMY_SCENE_ELEMENT_TYPES)[number], string> = {
  background: 'Фон',
  'animated-background': 'Анимированный фон',
  video: 'Видео',
  foreground: 'Передний план',
  image: 'Изображение',
  character: 'Персонаж ученика',
  npc: 'NPC-персонаж',
  prop: 'Предмет',
  text: 'Текст',
  dialogue: 'Диалог',
  button: 'Кнопка',
  card: 'Карточка',
  input: 'Поле ввода',
  indicator: 'Индикатор',
  timer: 'Таймер',
  progress: 'Прогресс',
  particles: 'Частицы',
  audio: 'Звук',
  hotspot: 'Зона нажатия',
  collision: 'Зона столкновения',
  platform: 'Платформа',
};

const sceneIdSchema = z.string()
  .trim()
  .min(1, 'Идентификатор обязателен')
  .max(120)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/, 'Используйте латиницу, цифры, точку, дефис или подчёркивание');

export const sceneScalarSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export const sceneTransformSchema = z.object({
  x: z.number().finite().default(0),
  y: z.number().finite().default(0),
  width: z.number().positive().max(10000).default(100),
  height: z.number().positive().max(10000).default(100),
  rotation: z.number().finite().min(-3600).max(3600).default(0),
  opacity: z.number().min(0).max(1).default(1),
  scaleX: z.number().finite().min(-100).max(100).default(1),
  scaleY: z.number().finite().min(-100).max(100).default(1),
  anchorX: z.number().min(0).max(1).default(0),
  anchorY: z.number().min(0).max(1).default(0),
  responsive: z.object({
    horizontal: z.enum(['left', 'center', 'right', 'stretch']).default('left'),
    vertical: z.enum(['top', 'center', 'bottom', 'stretch']).default('top'),
    marginX: z.number().finite().default(0),
    marginY: z.number().finite().default(0),
    scaleMode: z.enum(['none', 'contain', 'cover', 'stretch']).default('none'),
  }).strict().optional(),
}).strict();

export const sceneElementStyleSchema = z.object({
  fill: z.string().trim().min(1).max(80).optional(),
  stroke: z.string().trim().min(1).max(80).optional(),
  strokeWidth: z.number().min(0).max(40).optional(),
  borderRadius: z.number().min(0).max(500).optional(),
  fontFamily: z.string().trim().min(1).max(160).optional(),
  fontSize: z.number().positive().max(300).optional(),
  fontWeight: z.enum(['400', '500', '600', '700', '800', '900']).optional(),
  textAlign: z.enum(['left', 'center', 'right']).optional(),
  padding: z.number().min(0).max(200).optional(),
  tint: z.string().trim().min(1).max(80).optional(),
}).strict();

export const sceneAssetReferenceSchema = z.object({
  type: z.literal('academy-asset').default('academy-asset'),
  assetId: z.string().min(1),
  scope: z.enum(['shared', 'teacher', 'child']),
  kind: z.string().min(1),
  fileUrl: z.string().min(1),
  mimeType: z.string().min(1),
}).strict();

export const sceneElementContentSchema = z.object({
  text: z.string().max(10000).optional(),
  sourceUrl: z.string().min(1).optional(),
  altText: z.string().max(500).optional(),
  placeholder: z.string().max(500).optional(),
  value: sceneScalarSchema.optional(),
  min: z.number().finite().optional(),
  max: z.number().finite().optional(),
  durationMs: z.number().int().positive().max(86_400_000).optional(),
  loop: z.boolean().optional(),
  autoplay: z.boolean().optional(),
  volume: z.number().min(0).max(1).optional(),
  particlePreset: z.string().max(120).optional(),
  pose: z.string().max(120).optional(),
  correctAnswer: sceneScalarSchema.optional(),
  acceptedValues: z.array(sceneScalarSchema).max(100).optional(),
}).strict();

export const sceneAnimationSchema = z.object({
  type: z.enum(['none', 'fade', 'slide-left', 'slide-right', 'slide-up', 'slide-down', 'scale', 'pulse', 'shake']),
  durationMs: z.number().int().min(0).max(60_000).default(300),
  easing: z.enum(['linear', 'ease-in', 'ease-out', 'ease-in-out']).default('ease-out'),
  loop: z.boolean().default(false),
}).strict();

export const sceneElementOverrideSchema = z.object({
  visible: z.boolean().optional(),
  content: sceneElementContentSchema.partial().optional(),
  transform: sceneTransformSchema.partial().optional(),
  style: sceneElementStyleSchema.partial().optional(),
}).strict();

export const sceneElementStateSchema = z.object({
  id: sceneIdSchema,
  name: z.string().trim().min(1).max(160),
  overrides: sceneElementOverrideSchema.default({}),
}).strict();

export const academySceneElementSchema = z.object({
  id: sceneIdSchema,
  name: z.string().trim().min(1).max(160),
  type: z.enum(ACADEMY_SCENE_ELEMENT_TYPES),
  zIndex: z.number().int().min(-10000).max(10000).default(0),
  transform: sceneTransformSchema.default({}),
  visible: z.boolean().default(true),
  locked: z.boolean().default(false),
  interactive: z.boolean().default(false),
  studentInteractive: z.boolean().default(true),
  teacherVisible: z.boolean().default(true),
  asset: sceneAssetReferenceSchema.optional(),
  content: sceneElementContentSchema.default({}),
  style: sceneElementStyleSchema.default({}),
  initialState: sceneIdSchema.optional(),
  states: z.array(sceneElementStateSchema).max(100).default([]),
  animations: z.object({
    enter: sceneAnimationSchema.optional(),
    exit: sceneAnimationSchema.optional(),
    idle: sceneAnimationSchema.optional(),
  }).strict().default({}),
  accessibility: z.object({
    label: z.string().trim().min(1).max(300),
    description: z.string().trim().max(1000).optional(),
    keyboardShortcut: z.string().trim().max(40).optional(),
  }).strict().optional(),
}).strict().superRefine((element, ctx) => {
  // ВАЖНО: `character` (персонаж ученика) сюда НЕ входит — в шаблоне он намеренно
  // абстрактный, конкретный ребёнок подставляется при подготовке урока
  // (resolveInstanceScene). Требовать у него ассет на публикации нельзя.
  const sourceTypes = ['animated-background', 'video', 'foreground', 'image', 'npc', 'prop', 'audio'];
  if (sourceTypes.includes(element.type) && !element.asset && !element.content.sourceUrl) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['asset'],
      message: 'Для этого элемента нужен материал из библиотеки или sourceUrl',
    });
  }
  if (['text', 'dialogue', 'button', 'card'].includes(element.type) && !element.content.text?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['content', 'text'], message: 'Добавьте текст элемента' });
  }
  if (element.type === 'timer' && !element.content.durationMs) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['content', 'durationMs'], message: 'Укажите длительность таймера' });
  }
  if (['progress', 'indicator'].includes(element.type)
    && element.content.min !== undefined
    && element.content.max !== undefined
    && element.content.min >= element.content.max) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['content', 'max'], message: 'Максимум должен быть больше минимума' });
  }
  const stateIds = element.states.map((state) => state.id);
  if (new Set(stateIds).size !== stateIds.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['states'], message: 'Состояния элемента должны иметь уникальные id' });
  }
  if (element.initialState && !stateIds.includes(element.initialState)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['initialState'], message: 'Начальное состояние элемента не найдено' });
  }
});

export const academySceneLayerSchema = z.object({
  id: sceneIdSchema,
  name: z.string().trim().min(1).max(160),
  kind: z.enum(ACADEMY_SCENE_LAYER_KINDS),
  zIndex: z.number().int().min(-10000).max(10000).default(0),
  visible: z.boolean().default(true),
  locked: z.boolean().default(false),
  elements: z.array(academySceneElementSchema).max(500).default([]),
}).strict();

export const academySceneStateSchema = z.object({
  id: sceneIdSchema,
  name: z.string().trim().min(1).max(160),
  variables: z.record(sceneScalarSchema).default({}),
  elementStates: z.record(sceneIdSchema).default({}),
}).strict();

export const academySceneEventSchema = z.object({
  type: z.enum(ACADEMY_SCENE_EVENT_TYPES),
  sourceElementId: sceneIdSchema.optional(),
  key: z.string().max(80).optional(),
  customName: sceneIdSchema.optional(),
}).strict().superRefine((event, ctx) => {
  if (event.type === 'key-press' && !event.key) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['key'], message: 'Укажите клавишу' });
  }
  if (event.type === 'custom' && !event.customName) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['customName'], message: 'Укажите имя события' });
  }
});

export const academySceneConditionSchema = z.object({
  type: z.enum(ACADEMY_SCENE_CONDITION_TYPES),
  stateId: sceneIdSchema.optional(),
  variable: sceneIdSchema.optional(),
  value: sceneScalarSchema.optional(),
  elementId: sceneIdSchema.optional(),
  role: z.enum(['student', 'teacher']).optional(),
}).strict().superRefine((condition, ctx) => {
  if (['state-is', 'state-is-not'].includes(condition.type) && !condition.stateId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['stateId'], message: 'Укажите состояние' });
  }
  if (condition.type.startsWith('variable-') && (!condition.variable || condition.value === undefined)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['variable'], message: 'Укажите переменную и значение' });
  }
  if (['score-at-least', 'score-below'].includes(condition.type) && typeof condition.value !== 'number') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['value'], message: 'Укажите числовой порог' });
  }
  if (['element-visible', 'element-hidden'].includes(condition.type) && !condition.elementId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['elementId'], message: 'Укажите элемент' });
  }
  if (condition.type === 'role-is' && !condition.role) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['role'], message: 'Укажите роль в плеере' });
  }
});

export const academySceneActionSchema = z.object({
  type: z.enum(ACADEMY_SCENE_ACTION_TYPES),
  elementId: sceneIdSchema.optional(),
  stateId: sceneIdSchema.optional(),
  variable: sceneIdSchema.optional(),
  value: sceneScalarSchema.optional(),
  targetSceneId: sceneIdSchema.optional(),
  eventName: sceneIdSchema.optional(),
}).strict().superRefine((action, ctx) => {
  if (['show-element', 'hide-element', 'toggle-element', 'play-sound', 'set-pose', 'play-animation'].includes(action.type)
    && !action.elementId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['elementId'], message: 'Укажите целевой элемент' });
  }
  if (['set-pose', 'play-animation', 'show-hint'].includes(action.type) && typeof action.value !== 'string') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['value'], message: 'Укажите строковое значение действия' });
  }
  if (action.type === 'add-score' && typeof action.value !== 'number') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['value'], message: 'Укажите количество очков' });
  }
  if (action.type === 'set-state' && !action.stateId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['stateId'], message: 'Укажите состояние сцены' });
  }
  if (action.type === 'set-variable' && (!action.variable || action.value === undefined)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['variable'], message: 'Укажите переменную и значение' });
  }
  if (action.type === 'emit-event' && !action.eventName) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['eventName'], message: 'Укажите имя события' });
  }
});

export const academySceneRuleSchema = z.object({
  id: sceneIdSchema,
  name: z.string().trim().min(1).max(200),
  enabled: z.boolean().default(true),
  priority: z.number().int().min(-1000).max(1000).default(0),
  event: academySceneEventSchema,
  conditions: z.array(academySceneConditionSchema).max(50).default([]),
  actions: z.array(academySceneActionSchema).min(1).max(50),
  stopPropagation: z.boolean().default(false),
}).strict();

export const academySceneSchema = z.object({
  formatVersion: z.literal(ACADEMY_SCENE_FORMAT_VERSION),
  id: sceneIdSchema,
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  checkMode: z.enum(ACADEMY_SCENE_CHECK_MODES).default('automatic'),
  viewport: z.object({
    width: z.number().int().min(320).max(7680),
    height: z.number().int().min(240).max(4320),
    backgroundColor: z.string().trim().min(1).max(80).default('#fff7ed'),
  }).strict(),
  initialState: sceneIdSchema,
  states: z.array(academySceneStateSchema).min(1).max(200),
  layers: z.array(academySceneLayerSchema).min(1).max(100),
  rules: z.array(academySceneRuleSchema).max(500).default([]),
  nextSceneId: sceneIdSchema.optional(),
  // Режим генерации иллюстрации сцены (A6.6):
  // layered — послойная сцена (фон + персонаж-элемент, персонаж подставляется на экземпляре);
  // full-ai — вся иллюстрация генерируется целиком по референсу ученика на этапе подготовки урока.
  generation: z.object({
    mode: z.enum(['layered', 'full-ai']).default('layered'),
    prompt: z.string().trim().max(2000).optional(),
  }).strict().default({ mode: 'layered' }),
  metadata: z.object({
    educationalGoal: z.string().trim().max(1000).optional(),
    estimatedDurationSec: z.number().int().positive().max(86_400).optional(),
    tags: z.array(z.string().trim().min(1).max(80)).max(50).default([]),
  }).strict().default({}),
}).strict().superRefine((scene, ctx) => {
  const layerIds = scene.layers.map((layer) => layer.id);
  const elements = scene.layers.flatMap((layer) => layer.elements);
  const elementIds = elements.map((element) => element.id);
  const stateIds = scene.states.map((state) => state.id);
  const ruleIds = scene.rules.map((rule) => rule.id);
  const elementById = new Map(elements.map((element) => [element.id, element]));

  const ensureUnique = (ids: string[], path: (string | number)[], label: string) => {
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path, message: `${label} должны иметь уникальные id` });
    }
  };
  ensureUnique(layerIds, ['layers'], 'Слои');
  ensureUnique(elementIds, ['layers'], 'Элементы');
  ensureUnique(stateIds, ['states'], 'Состояния сцены');
  ensureUnique(ruleIds, ['rules'], 'Правила');

  if (!stateIds.includes(scene.initialState)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['initialState'], message: 'Начальное состояние сцены не найдено' });
  }

  scene.states.forEach((state, stateIndex) => {
    Object.entries(state.elementStates).forEach(([elementId, elementStateId]) => {
      const element = elementById.get(elementId);
      if (!element) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['states', stateIndex, 'elementStates', elementId],
          message: 'Элемент состояния не найден',
        });
      } else if (!element.states.some((item) => item.id === elementStateId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['states', stateIndex, 'elementStates', elementId],
          message: 'Состояние элемента не найдено',
        });
      }
    });
  });

  scene.rules.forEach((rule, ruleIndex) => {
    const checkElement = (elementId: string | undefined, path: (string | number)[]) => {
      if (elementId && !elementById.has(elementId)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path, message: 'Связанный элемент не найден' });
      }
    };
    checkElement(rule.event.sourceElementId, ['rules', ruleIndex, 'event', 'sourceElementId']);
    rule.conditions.forEach((condition, conditionIndex) => {
      checkElement(condition.elementId, ['rules', ruleIndex, 'conditions', conditionIndex, 'elementId']);
      if (condition.stateId && !stateIds.includes(condition.stateId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['rules', ruleIndex, 'conditions', conditionIndex, 'stateId'],
          message: 'Состояние сцены не найдено',
        });
      }
    });
    rule.actions.forEach((action, actionIndex) => {
      checkElement(action.elementId, ['rules', ruleIndex, 'actions', actionIndex, 'elementId']);
      if (action.stateId && !stateIds.includes(action.stateId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['rules', ruleIndex, 'actions', actionIndex, 'stateId'],
          message: 'Состояние сцены не найдено',
        });
      }
    });
  });
});

export type AcademyScene = z.infer<typeof academySceneSchema>;
export type AcademySceneLayer = z.infer<typeof academySceneLayerSchema>;
export type AcademySceneElement = z.infer<typeof academySceneElementSchema>;
export type AcademySceneRule = z.infer<typeof academySceneRuleSchema>;
export type AcademySceneAction = z.infer<typeof academySceneActionSchema>;
export type AcademySceneEventDefinition = z.infer<typeof academySceneEventSchema>;
export type AcademySceneScalar = z.infer<typeof sceneScalarSchema>;

/** Парсинг — единственная точка входа для JSON из БД/редактора. */
export function parseAcademyScene(input: unknown): AcademyScene {
  return academySceneSchema.parse(input);
}
