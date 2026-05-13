import {
  formatAdminServiceValidationError,
  validatePipelineConfig,
  validateUserInputForm,
} from '../schemas/admin-services';

const form = [{ id: 'tier', type: 'tier' as const, label: 'Качество', required: true }];

describe('admin service validation messages', () => {
  it('returns a human-readable empty pipeline error', () => {
    expect(() => validatePipelineConfig([], form)).toThrow('PIPELINE_EMPTY');
    expect(formatAdminServiceValidationError('PIPELINE_EMPTY')).toBe('Пайплайн пустой. Добавьте хотя бы один шаг.');
  });

  it('returns a human-readable missing block error', () => {
    expect(() => validatePipelineConfig([{ id: 'step_1', blockSlug: '', params: {} }], form)).toThrow('STEP_BLOCK_MISSING:1');
    expect(formatAdminServiceValidationError('STEP_BLOCK_MISSING:1')).toBe('Шаг 1: не выбран блок.');
  });

  it('describes invalid step references with available sources', () => {
    const pipeline = [
      { id: 'step_1', blockSlug: 'image-edit', params: { model: 'nano-banana', prompt: 'restore' } },
      { id: 'step_2', blockSlug: 'image-to-video', input: '{{step_3.output}}', params: { model: { standard: 'kling-std', pro: 'kling-pro' }, prompt: 'move', duration: 5, aspect_ratio: 'auto' } },
    ];
    expect(() => validatePipelineConfig(pipeline, form)).toThrow('INVALID_STEP_REFERENCE:2:step_3:step_1');
    expect(formatAdminServiceValidationError('INVALID_STEP_REFERENCE:2:step_3:step_1')).toBe(
      'Шаг 2: источник "step_3.output" не существует. Доступные источники: step_1.output.',
    );
  });

  it('formats user form validation without raw zod JSON', () => {
    expect(() => validateUserInputForm([])).toThrow('USER_INPUT_FORM_EMPTY');
    expect(formatAdminServiceValidationError('USER_INPUT_FORM_EMPTY')).toBe('Форма пользователя пустая. Добавьте хотя бы поле качества tier.');
    expect(formatAdminServiceValidationError('[{"code":"too_small"}]')).not.toContain('"code"');
  });
});
