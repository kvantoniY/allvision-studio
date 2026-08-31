import type { UserInputFieldInput } from '../schemas/admin-services';

/**
 * Можно ли запустить услугу прямо из редактора роликов.
 *
 * Панель редактора узкая, полноценную форму услуги в неё не поместить. Поэтому услуга
 * запускается оттуда, только если её обязательные поля закрываются кадром из сцены и
 * простыми переключателями. Правило живёт в shared, потому что проверяют его двое: панель
 * (чтобы не показывать кнопку запуска впустую) и сервер (чтобы не списать токены за
 * заведомо неверный запуск). Разъехавшиеся копии этой проверки означали бы списание денег.
 */

/** Поля, которые панель редактора умеет заполнить сама или простым выбором. */
export const EDITOR_LAUNCH_FIELD_TYPES = new Set([
  'photo', 'avatar', 'text', 'textarea', 'select', 'duration', 'aspect_ratio', 'checkbox', 'tier',
]);

export type EditorLaunchValues = Record<string, string | boolean | undefined>;

function fieldRequired(field: UserInputFieldInput, values: EditorLaunchValues): boolean {
  if (field.requiredWhen) {
    const current = values[field.requiredWhen.field];
    if (current === field.requiredWhen.value) return true;
  }
  return field.required === true;
}

function fieldVisible(field: UserInputFieldInput, values: EditorLaunchValues): boolean {
  if (!field.visibleWhen) return true;
  return values[field.visibleWhen.field] === field.visibleWhen.value;
}

/** Человеческий текст о том, чего не хватает, или null — если можно запускать. */
export function editorLaunchBlocker(
  form: unknown,
  values: EditorLaunchValues,
  hasFrame: boolean,
): string | null {
  const fields: UserInputFieldInput[] = Array.isArray(form) ? (form as UserInputFieldInput[]) : [];

  for (const field of fields) {
    if (!fieldVisible(field, values)) continue;
    const required = fieldRequired(field, values);

    if (!EDITOR_LAUNCH_FIELD_TYPES.has(field.type)) {
      if (!required) continue;
      return `Эта услуга запускается со своей страницы: ей нужно поле «${field.label ?? field.id}».`;
    }
    if (!required) continue;

    if (field.type === 'photo' || field.type === 'avatar') {
      if (!hasFrame && !values[field.id]) return 'Выберите в сцене кадр — услуге нужно исходное фото.';
      continue;
    }
    const value = values[field.id];
    if (value === undefined || value === '' || value === null) {
      return `Заполните «${field.label ?? field.id}» на странице услуги.`;
    }
  }
  return null;
}
