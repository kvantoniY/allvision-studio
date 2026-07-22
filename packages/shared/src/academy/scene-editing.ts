import {
  ACADEMY_SCENE_FORMAT_VERSION,
  academySceneLayerSchema,
  academySceneSchema,
  type AcademyScene,
  type AcademySceneElement,
  type AcademySceneLayer,
  type AcademySceneRule,
} from './scene-format';
import type { AcademyAssetDragData } from './materials';

// === Чистые хелперы редактора сцен (A6.2) ===
// Возвращают НОВЫЙ объект сцены (иммутабельно) — под undo-стек редактора.

const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** Генерирует уникальный id с префиксом, не пересекающийся с занятыми. */
export function uniqueSceneId(prefix: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const base = prefix.replace(/[^a-zA-Z0-9._:-]/g, '').slice(0, 40) || 'id';
  for (let i = 1; i < 100000; i += 1) {
    const candidate = `${base}-${i}`;
    if (!used.has(candidate)) return candidate;
  }
  let rand = base;
  for (let i = 0; i < 6; i += 1) rand += ID_ALPHABET[Math.floor(Math.random() * ID_ALPHABET.length)];
  return rand;
}

export function collectSceneIds(scene: AcademyScene): Set<string> {
  const ids = new Set<string>();
  scene.layers.forEach((layer) => {
    ids.add(layer.id);
    layer.elements.forEach((el) => ids.add(el.id));
  });
  scene.states.forEach((s) => ids.add(s.id));
  scene.rules.forEach((r) => ids.add(r.id));
  return ids;
}

export function allSceneElements(scene: AcademyScene): AcademySceneElement[] {
  return scene.layers.flatMap((layer) => layer.elements);
}

/** Минимальная валидная пустая сцена. */
export function createEmptyScene(opts: { id?: string; title?: string } = {}): AcademyScene {
  const raw = {
    formatVersion: ACADEMY_SCENE_FORMAT_VERSION,
    id: opts.id ?? 'scene-1',
    title: opts.title ?? 'Новая сцена',
    checkMode: 'automatic',
    viewport: { width: 1280, height: 720, backgroundColor: '#fff7ed' },
    initialState: 'default',
    states: [{ id: 'default', name: 'Начало', variables: {}, elementStates: {} }],
    layers: [
      { id: 'background', name: 'Фон', kind: 'background', zIndex: 0, visible: true, locked: false, elements: [] },
      { id: 'world', name: 'Мир', kind: 'world', zIndex: 10, visible: true, locked: false, elements: [] },
      { id: 'ui', name: 'Интерфейс', kind: 'ui', zIndex: 20, visible: true, locked: false, elements: [] },
    ],
    rules: [],
    metadata: {},
  };
  return academySceneSchema.parse(raw);
}

/** Дефолтный элемент выбранного типа (по возможности сразу валидный). */
export function makeElement(scene: AcademyScene, type: AcademySceneElement['type'], id: string): AcademySceneElement {
  const name = `Элемент ${scene.layers.reduce((n, l) => n + l.elements.length, 0) + 1}`;
  const base = {
    id,
    name,
    type,
    zIndex: 0,
    transform: { x: 100, y: 100, width: 240, height: 160, rotation: 0, opacity: 1, scaleX: 1, scaleY: 1, anchorX: 0, anchorY: 0 },
    visible: true,
    locked: false,
    interactive: ['button', 'card', 'hotspot', 'input'].includes(type),
    studentInteractive: true,
    teacherVisible: true,
    content: {} as Record<string, unknown>,
    style: {} as Record<string, unknown>,
    states: [],
    animations: {},
  };
  if (['text', 'dialogue', 'button', 'card'].includes(type)) {
    base.content = { text: name };
    base.style = { fontSize: 28, fontWeight: '600', fill: '#1f2937', textAlign: 'center' };
  }
  if (type === 'timer') base.content = { durationMs: 5000 };
  if (['progress', 'indicator'].includes(type)) base.content = { min: 0, max: 100, value: 0 };
  // Намеренно НЕ гоняем строгую схему: source-типы (image/character/npc/…) валидны
  // только после прикрепления ассета. Редактор допускает промежуточное состояние,
  // строгая валидация — через validateScene (кнопка «Проверить»/сохранение).
  return base as unknown as AcademySceneElement;
}

function replaceLayer(scene: AcademyScene, layerId: string, fn: (layer: AcademySceneLayer) => AcademySceneLayer): AcademyScene {
  return { ...scene, layers: scene.layers.map((l) => (l.id === layerId ? fn(l) : l)) };
}

export function addElement(scene: AcademyScene, layerId: string, type: AcademySceneElement['type']): { scene: AcademyScene; elementId: string } {
  const id = uniqueSceneId(type, collectSceneIds(scene));
  const element = makeElement(scene, type, id);
  const next = replaceLayer(scene, layerId, (layer) => ({ ...layer, elements: [...layer.elements, element] }));
  return { scene: next, elementId: id };
}

export function updateElement(scene: AcademyScene, elementId: string, patch: Partial<AcademySceneElement>): AcademyScene {
  return {
    ...scene,
    layers: scene.layers.map((layer) => ({
      ...layer,
      elements: layer.elements.map((el) => (el.id === elementId ? { ...el, ...patch } : el)),
    })),
  };
}

/** Патч трансформа выбранного элемента (для drag/resize на канвасе). */
export function patchElementTransform(scene: AcademyScene, elementId: string, patch: Partial<AcademySceneElement['transform']>): AcademyScene {
  return {
    ...scene,
    layers: scene.layers.map((layer) => ({
      ...layer,
      elements: layer.elements.map((el) => (el.id === elementId ? { ...el, transform: { ...el.transform, ...patch } } : el)),
    })),
  };
}

export function attachAsset(scene: AcademyScene, elementId: string, drag: AcademyAssetDragData): AcademyScene {
  return updateElement(scene, elementId, {
    asset: { type: 'academy-asset', assetId: drag.assetId, scope: drag.scope, kind: drag.kind, fileUrl: drag.fileUrl, mimeType: drag.mimeType },
  });
}

/** Ставит изображение как фон сцены: находит/создаёт элемент типа `background` на весь вьюпорт. */
export function setSceneBackground(scene: AcademyScene, drag: AcademyAssetDragData): AcademyScene {
  const asset = {
    type: 'academy-asset' as const,
    assetId: drag.assetId,
    scope: drag.scope,
    kind: drag.kind,
    fileUrl: drag.fileUrl,
    mimeType: drag.mimeType,
  };
  const bgLayer = scene.layers.find((l) => l.kind === 'background') ?? scene.layers[0];
  if (!bgLayer) return scene;
  const existing = bgLayer.elements.find((e) => e.type === 'background');
  if (existing) return updateElement(scene, existing.id, { asset });

  const id = uniqueSceneId('background', collectSceneIds(scene));
  const element = makeElement(scene, 'background', id);
  element.name = 'Фон сцены';
  element.transform = { ...element.transform, x: 0, y: 0, width: scene.viewport.width, height: scene.viewport.height };
  element.zIndex = -100;
  element.asset = asset;
  return { ...scene, layers: scene.layers.map((l) => (l.id === bgLayer.id ? { ...l, elements: [element, ...l.elements] } : l)) };
}

/**
 * Убирает из правил ссылки на исчезнувшие элементы. Без этого удаление элемента/слоя
 * оставляет битое правило, которое нельзя ни увидеть, ни починить в редакторе, —
 * публикация падает на «Связанный элемент не найден».
 */
export function pruneDanglingRefs(scene: AcademyScene): AcademyScene {
  const alive = new Set(scene.layers.flatMap((layer) => layer.elements.map((el) => el.id)));
  const missing = (id: string | undefined) => Boolean(id) && !alive.has(id as string);

  const rules = scene.rules
    // Правило без своего источника события бессмысленно — удаляем целиком.
    .filter((rule) => !missing(rule.event.sourceElementId))
    .map((rule) => ({
      ...rule,
      conditions: rule.conditions.filter((condition) => !missing(condition.elementId)),
      actions: rule.actions.filter((action) => !missing(action.elementId)),
    }))
    // Если все действия ссылались на удалённые элементы, правило пустое — оно и
    // не пройдёт валидацию (минимум одно действие), поэтому убираем его.
    .filter((rule) => rule.actions.length > 0);

  return { ...scene, rules };
}

export function removeElement(scene: AcademyScene, elementId: string): AcademyScene {
  return pruneDanglingRefs({
    ...scene,
    layers: scene.layers.map((layer) => ({ ...layer, elements: layer.elements.filter((el) => el.id !== elementId) })),
  });
}

export function addLayer(scene: AcademyScene, kind: AcademySceneLayer['kind']): { scene: AcademyScene; layerId: string } {
  const id = uniqueSceneId(kind, collectSceneIds(scene));
  const layer: AcademySceneLayer = academySceneLayerSchema.parse({
    id,
    name: `Слой ${scene.layers.length + 1}`,
    kind,
    zIndex: scene.layers.length * 10,
    visible: true,
    locked: false,
    elements: [],
  });
  return { scene: { ...scene, layers: [...scene.layers, layer] }, layerId: id };
}

export function removeLayer(scene: AcademyScene, layerId: string): AcademyScene {
  if (scene.layers.length <= 1) return scene;
  return pruneDanglingRefs({ ...scene, layers: scene.layers.filter((l) => l.id !== layerId) });
}

/** Двигает элемент по z (порядку в слое). */
export function reorderElement(scene: AcademyScene, layerId: string, elementId: string, dir: -1 | 1): AcademyScene {
  return replaceLayer(scene, layerId, (layer) => {
    const idx = layer.elements.findIndex((el) => el.id === elementId);
    const target = idx + dir;
    if (idx < 0 || target < 0 || target >= layer.elements.length) return layer;
    const elements = [...layer.elements];
    [elements[idx], elements[target]] = [elements[target], elements[idx]];
    return { ...layer, elements };
  });
}

// === Правила событие → условие → действие ===

export function addRule(scene: AcademyScene): { scene: AcademyScene; ruleId: string } {
  const id = uniqueSceneId('rule', collectSceneIds(scene));
  const rule: AcademySceneRule = {
    id,
    name: `Правило ${scene.rules.length + 1}`,
    enabled: true,
    priority: 0,
    event: { type: 'element-click' },
    conditions: [],
    actions: [{ type: 'add-score', value: 10 }],
    stopPropagation: false,
  };
  return { scene: { ...scene, rules: [...scene.rules, rule] }, ruleId: id };
}

export function updateRule(scene: AcademyScene, ruleId: string, patch: Partial<AcademySceneRule>): AcademyScene {
  return { ...scene, rules: scene.rules.map((r) => (r.id === ruleId ? { ...r, ...patch } : r)) };
}

export function removeRule(scene: AcademyScene, ruleId: string): AcademyScene {
  return { ...scene, rules: scene.rules.filter((r) => r.id !== ruleId) };
}

/** Проверяет сцену строгой схемой; возвращает список человекочитаемых ошибок. */
export function validateScene(scene: unknown): { ok: true } | { ok: false; issues: string[] } {
  const parsed = academySceneSchema.safeParse(scene);
  if (parsed.success) return { ok: true };
  const issues = parsed.error.issues.map((issue) => {
    const path = issue.path.join('.');
    return path ? `${path}: ${issue.message}` : issue.message;
  });
  return { ok: false, issues };
}
