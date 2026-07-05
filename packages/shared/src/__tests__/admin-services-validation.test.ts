import {
  formatAdminServiceValidationError,
  validatePipelineConfig,
  validateUserInputForm,
} from '../schemas/admin-services';

const form = [{ id: 'tier', type: 'tier' as const, label: 'Качество', required: true }];

describe('admin service validation messages', () => {
  it('accepts duration fields with per-duration prices', () => {
    expect(() =>
      validateUserInputForm([
        {
          id: 'duration',
          type: 'duration',
          label: 'Duration',
          required: false,
          durationOptions: [5, 10, 15],
          defaultDuration: 5,
          durationPrices: [
            { duration: 5, priceCoins: 30 },
            { duration: 10, priceCoins: 60 },
            { duration: 15, priceCoins: 90 },
          ],
        },
      ]),
    ).not.toThrow();
  });

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

  it('skips enum validation for params of other models (seedream + legacy gpt quality)', () => {
    const step = (model: unknown) => [
      {
        id: 'step_1',
        blockSlug: 'image-edit',
        input: '{{user.photo}}',
        // quality: 'standard' — легаси-значение PiAPI-эпохи, невалидное для gpt-enum.
        params: { model, prompt: 'edit', quality: 'standard' },
      },
    ];
    const fields = [
      { id: 'tier', type: 'tier' as const, label: 'tier', required: true },
      { id: 'photo', type: 'photo' as const, label: 'photo', required: true },
    ];
    // Seedream не объявляет quality — чужой параметр не должен валить пайплайн.
    expect(() => validatePipelineConfig(step('seedream-5-lite'), fields)).not.toThrow();
    expect(() => validatePipelineConfig(step({ standard: 'seedream-5-lite', pro: 'seedream-5-lite' }), fields)).not.toThrow();
    // Для gpt-image-2 quality — свой параметр, невалидное значение по-прежнему ловится.
    expect(() => validatePipelineConfig(step('gpt-image-2'), fields)).toThrow('INVALID_PARAMS:params.step_1.quality');
  });

  it('accepts legacy motion-transfer driving_video params during validation', () => {
    expect(() =>
      validatePipelineConfig(
        [
          {
            id: 'step_1',
            blockSlug: 'motion-transfer',
            input: '{{user.photo}}',
            params: {
              model: { standard: 'kling-motion-2.6-std', pro: 'kling-motion-2.6-pro' },
              driving_video: '{{user.trendVideo}}',
              duration: 5,
              aspect_ratio: 'auto',
            },
          },
        ],
        [
          { id: 'tier', type: 'tier', label: 'tier', required: true },
          { id: 'photo', type: 'photo', label: 'photo', required: true },
          { id: 'trendVideo', type: 'media-select', label: 'trend', required: true, mediaKind: 'trend-video' },
        ],
      ),
    ).not.toThrow();
  });
});
