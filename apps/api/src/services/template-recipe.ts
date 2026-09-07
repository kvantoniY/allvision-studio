/** Настройки оживления кадра, зашитые в пайплайн шаблона поздравления. */
export type TemplateRecipe = { model: string; prompt?: string; durationSec: number };

/**
 * Достаёт из пайплайна шаблона то, чем оживляется один кадр.
 *
 * Шаблон описан как обычная услуга: шаг scene-batch повторял одну операцию для каждой
 * загруженной фотографии. Теперь тот же шаг служит рецептом для редактора — повторять его
 * будет человек, кадр за кадром, и видеть результат сразу.
 *
 * Живёт отдельным модулем, потому что рецепт нужен в двух местах: при открытии шаблона в
 * редакторе и при показе цены на витрине. Цена обязана считаться по тем же модели и
 * длительности, по которым потом спишутся токены.
 */
export function templateRecipe(pipelineConfig: unknown): TemplateRecipe | null {
  const steps = Array.isArray(pipelineConfig) ? pipelineConfig : [];
  const batch = steps.find(
    (step): step is { params?: Record<string, unknown> } =>
      Boolean(step) && typeof step === 'object' && (step as { blockSlug?: string }).blockSlug === 'scene-batch',
  );
  if (!batch) return null;
  const params = batch.params ?? {};
  const model = typeof params.model === 'string' && params.model.length > 0 ? params.model : 'kling-3-std';
  const prompt = typeof params.prompt === 'string' && params.prompt.trim().length > 0 ? params.prompt.trim() : undefined;
  const duration = Number(params.duration);
  return {
    model,
    ...(prompt ? { prompt } : {}),
    durationSec: Number.isFinite(duration) && duration > 0 ? Math.min(20, Math.max(1, duration)) : 4,
  };
}

/** Рецепт с безопасными умолчаниями: шаблон без шага scene-batch всё равно должен открыться. */
export function templateRecipeOrDefault(pipelineConfig: unknown): TemplateRecipe {
  return templateRecipe(pipelineConfig) ?? { model: 'kling-3-std', durationSec: 4 };
}
