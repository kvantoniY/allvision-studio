import type { AcademyScene } from './scene-format';

// === Экземпляр урока (A6.3): персонализация опубликованной версии сцены ===

export interface InstanceOverrides {
  /** Скрыть необязательные элементы (id) для конкретного ребёнка. */
  hiddenElementIds?: string[];
}

export interface CharacterInjection {
  /** id референса персонажа (CharacterReference). */
  assetId: string;
  /** Авторизованный URL файла (участник урока). */
  fileUrl: string;
  mimeType: string;
}

/** Порядок предпочтения референсов персонажа для подстановки в сцену. */
export const CHARACTER_INJECTION_KIND_PRIORITY = [
  'full_body',
  'neutral_pose',
  'three_quarter',
  'portrait',
] as const;

/** Выбирает лучший доступный вид референса под подстановку в элемент-персонаж. */
export function pickCharacterReferenceKind(availableKinds: string[]): string | null {
  for (const kind of CHARACTER_INJECTION_KIND_PRIORITY) {
    if (availableKinds.includes(kind)) return kind;
  }
  return availableKinds[0] ?? null;
}

/**
 * Собирает финальную сцену экземпляра: подставляет персонажа конкретного ребёнка
 * во все элементы типа `character` и применяет оверрайды преподавателя.
 * Чистая функция (глубокая копия), без БД — тестируется отдельно.
 */
/**
 * Читает «документ урока» из Json шаблона: поддерживает и будущий многосценовый
 * формат `{ scenes: [...] }`, и текущий одиночный `AcademyScene`.
 */
export function readSceneDocument(json: unknown): AcademyScene[] {
  if (json && typeof json === 'object') {
    const maybe = json as { scenes?: unknown; layers?: unknown };
    if (Array.isArray(maybe.scenes)) return maybe.scenes as AcademyScene[];
    if (Array.isArray(maybe.layers)) return [json as AcademyScene];
  }
  return [];
}

export function resolveInstanceScene(
  scene: AcademyScene,
  opts: { character?: CharacterInjection | null; overrides?: InstanceOverrides | null } = {},
): AcademyScene {
  const clone: AcademyScene = JSON.parse(JSON.stringify(scene));
  const hidden = new Set(opts.overrides?.hiddenElementIds ?? []);

  clone.layers.forEach((layer) => {
    layer.elements.forEach((element) => {
      if (hidden.has(element.id)) element.visible = false;
      if (element.type === 'character' && opts.character) {
        element.asset = {
          type: 'academy-asset',
          assetId: opts.character.assetId,
          scope: 'child',
          kind: 'character',
          fileUrl: opts.character.fileUrl,
          mimeType: opts.character.mimeType,
        };
      }
    });
  });
  return clone;
}
