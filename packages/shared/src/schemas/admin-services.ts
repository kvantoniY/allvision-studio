import { z } from 'zod';
import { BLOCK_CATALOG, getBlockCatalogItem, type JsonSchemaObject } from '../blocks';

const booleanFromForm = z.preprocess((value) => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}, z.boolean());

const previewModeSchema = z.enum(['auto', 'image', 'video']).default('auto');
const previewUrlSchema = z.string().trim().min(1).max(2000).nullable().optional();

// Category codes are validated against the ServiceCategoryDef table at runtime in the API layer,
// not here. Schema just enforces shape: short ASCII identifier.
export const adminServiceCategorySchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[A-Z0-9_-]+$/, 'Category code must be UPPERCASE letters, digits, underscores or hyphens');

export const adminServiceListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  category: adminServiceCategorySchema.optional(),
  isActive: booleanFromForm.optional(),
  isFeatured: booleanFromForm.optional(),
  search: z.string().trim().min(1).optional(),
});

export const pipelineStepSchema = z.object({
  id: z.string().trim().min(1).max(80).regex(/^[a-zA-Z0-9_-]+$/),
  blockSlug: z.string().trim().min(1).max(120),
  params: z.unknown().optional(),
  input: z.unknown().optional(),
});

export const pipelineConfigSchema = z.array(pipelineStepSchema).min(1);

export const userInputFieldSchema = z.object({
  id: z.string().trim().min(1).max(80).regex(/^[a-zA-Z0-9_-]+$/),
  type: z.enum([
    'text',
    'textarea',
    'photo',
    'video',
    'select',
    'media-select',
    'avatar',
    'tier',
    'audio',
    'duration',
    'aspect_ratio',
    'music-select',
  ]),
  label: z.string().trim().min(1).max(120),
  required: z.boolean(),
  // Conditional requirement: the field becomes required only when another field has a given value.
  // Used e.g. for scene_photo (required when scene_mode === 'photo') / scene_video (scene_mode === 'video').
  requiredWhen: z
    .object({
      field: z.string().trim().min(1).max(80),
      value: z.string().trim().min(1).max(500),
    })
    .optional(),
  // Conditional visibility: the field is shown only when another field has a given value.
  // Used for scene_photo / scene_video / duration that depend on scene_mode.
  visibleWhen: z
    .object({
      field: z.string().trim().min(1).max(80),
      value: z.string().trim().min(1).max(500),
    })
    .optional(),
  // Initial value used to prefill the field on the public form (e.g. scene_mode defaults to "photo").
  defaultValue: z.string().trim().min(1).max(500).optional(),
  hint: z.string().trim().max(240).optional(),
  placeholder: z.string().trim().max(160).optional(),
  mediaKind: z.string().trim().min(1).max(80).optional(),
  mediaGroup: z.string().trim().min(1).max(80).optional(),
  maxLength: z.number().int().min(1).max(5000).optional(),
  maxSizeMb: z.number().int().min(1).max(200).optional(),
  maxDurationSec: z.number().int().min(1).max(60).optional(),
  allowedFormats: z.array(z.string().trim().min(1)).optional(),
  allowStudioAvatars: z.boolean().optional(),
  allowSystemLibrary: z.boolean().optional(),
  avatarTypes: z.array(z.enum(['HUMAN', 'PET', 'OBJECT', 'all'])).optional(),
  options: z.array(z.object({
    label: z.string().trim().min(1).max(120),
    value: z.string().trim().min(1).max(500),
    // Renders the option as visible-but-non-selectable (e.g. temporarily disabled Pro tier).
    disabled: z.boolean().optional(),
  })).optional(),
  durationOptions: z.array(z.number().int().min(1).max(60)).optional(),
  defaultDuration: z.number().int().min(1).max(60).optional(),
  aspectOptions: z.array(z.enum(['auto', '9:16', '16:9', '1:1', '4:3', '3:4'])).optional(),
  defaultAspect: z.enum(['auto', '9:16', '16:9', '1:1', '4:3', '3:4']).optional(),
  allowUserUpload: z.boolean().optional(),
  allowLibrary: z.boolean().optional(),
});

export const userInputFormSchema = z.array(userInputFieldSchema).min(1);

export const createAdminServiceSchema = z.object({
  slug: z.string().trim().min(1).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().trim().min(1).max(140),
  shortDesc: z.string().trim().min(1).max(280),
  description: z.string().trim().min(1).max(6000),
  category: adminServiceCategorySchema,
  pipelineConfig: z.unknown(),
  userInputForm: z.unknown(),
  priceCoinsStandard: z.coerce.number().int().min(1),
  priceCoinsPro: z.coerce.number().int().min(1),
  previewImage: previewUrlSchema,
  previewVideo: previewUrlSchema,
  previewMode: previewModeSchema,
  isActive: booleanFromForm.optional().default(true),
  isFeatured: booleanFromForm.optional().default(false),
  sortOrder: z.coerce.number().int().min(0).optional(),
});

export const updateAdminServiceSchema = createAdminServiceSchema
  .omit({ slug: true, sortOrder: true })
  .partial();

export const reorderAdminServiceSchema = z.object({
  direction: z.enum(['up', 'down']),
});

export type AdminServiceListQuery = z.infer<typeof adminServiceListQuerySchema>;
export type PipelineStepInput = z.infer<typeof pipelineStepSchema>;
export type UserInputFieldInput = z.infer<typeof userInputFieldSchema>;
export type CreateAdminServiceInput = z.infer<typeof createAdminServiceSchema>;
export type UpdateAdminServiceInput = z.infer<typeof updateAdminServiceSchema>;

export function parseAdminServiceData(value: unknown, mode: 'create' | 'update') {
  const source = parseJsonField(value);
  return mode === 'create'
    ? createAdminServiceSchema.parse(source)
    : updateAdminServiceSchema.parse(source);
}

export function parseJsonField(value: unknown) {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    throw new Error('INVALID_JSON_DATA');
  }
}

export function validatePipelineConfig(
  config: unknown,
  userInputForm: unknown,
): PipelineStepInput[] {
  const steps = parsePipelineSteps(config);
  const fields = validateUserInputForm(userInputForm);
  const fieldIds = new Set(fields.map((field) => field.id));
  const seen = new Set<string>();

  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index];
    const stepNumber = index + 1;
    if (seen.has(step.id)) {
      throw new Error(`DUPLICATE_STEP_ID:${step.id}`);
    }
    seen.add(step.id);

    const block = getBlockCatalogItem(step.blockSlug);
    if (!block) {
      throw new Error(`UNKNOWN_BLOCK:${stepNumber}:${step.blockSlug}`);
    }
    validateValueAgainstJsonSchema(normaliseParamsForValidation(step.blockSlug, step.params), block.paramsSchema, `params.${step.id}`);

    const allowedStepIds = new Set(steps.slice(0, index).map((item) => item.id));
    const refs = collectPlaceholderRefs([step.params, step.input]);
    for (const ref of refs) {
      if (ref.startsWith('user.')) {
        const fieldId = ref.slice('user.'.length).split('.')[0];
        if (!fieldIds.has(fieldId)) throw new Error(`UNKNOWN_USER_FIELD:${fieldId}`);
      }
      if (ref.startsWith('step_')) {
        const stepId = ref.split('.')[0];
        if (!allowedStepIds.has(stepId)) {
          throw new Error(`INVALID_STEP_REFERENCE:${stepNumber}:${stepId}:${Array.from(allowedStepIds).join(',')}`);
        }
      }
    }
  }

  return steps;
}

function normaliseParamsForValidation(blockSlug: string, params: unknown): unknown {
  if (blockSlug !== 'motion-transfer' || !params || typeof params !== 'object' || Array.isArray(params)) {
    return params;
  }
  const record = params as Record<string, unknown>;
  if (record.driving_video !== undefined) {
    const next = { ...record };
    if (next.video_url === undefined) next.video_url = record.driving_video;
    delete next.driving_video;
    return next;
  }
  return params;
}

export function validateUserInputForm(form: unknown): UserInputFieldInput[] {
  const fields = parseUserInputFields(form);
  const seen = new Set<string>();
  let tierCount = 0;

  for (const field of fields) {
    if (seen.has(field.id)) throw new Error(`DUPLICATE_FIELD_ID:${field.id}`);
    seen.add(field.id);
    if (field.type === 'tier') tierCount += 1;
    if (field.type === 'select' && (!field.options || field.options.length === 0)) {
      throw new Error(`SELECT_OPTIONS_REQUIRED:${field.id}`);
    }
    if (field.type === 'media-select' && !field.mediaKind) {
      throw new Error(`MEDIA_KIND_REQUIRED:${field.id}`);
    }
  }

  if (tierCount > 1) throw new Error('TIER_FIELD_DUPLICATE');
  return fields;
}

function parsePipelineSteps(config: unknown): PipelineStepInput[] {
  if (!Array.isArray(config) || config.length === 0) {
    throw new Error('PIPELINE_EMPTY');
  }
  return config.map((rawStep, index) => {
    const stepNumber = index + 1;
    const parsed = pipelineStepSchema.safeParse(rawStep);
    if (parsed.success) return parsed.data;
    const hasBlockSlugIssue = parsed.error.issues.some((issue) => issue.path[0] === 'blockSlug');
    if (hasBlockSlugIssue) throw new Error(`STEP_BLOCK_MISSING:${stepNumber}`);
    throw new Error(`STEP_INVALID:${stepNumber}`);
  });
}

function parseUserInputFields(form: unknown): UserInputFieldInput[] {
  if (!Array.isArray(form) || form.length === 0) {
    throw new Error('USER_INPUT_FORM_EMPTY');
  }
  return form.map((rawField, index) => {
    const parsed = userInputFieldSchema.safeParse(rawField);
    if (parsed.success) return parsed.data;
    throw new Error(`USER_INPUT_FIELD_INVALID:${index + 1}`);
  });
}

function collectPlaceholderRefs(values: unknown[]): string[] {
  const refs: string[] = [];
  const walk = (value: unknown) => {
    if (typeof value === 'string') {
      for (const match of value.matchAll(/{{\s*([^}]+)\s*}}/g)) {
        refs.push(match[1].trim());
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    if (value && typeof value === 'object') {
      Object.values(value as Record<string, unknown>).forEach(walk);
    }
  };
  values.forEach(walk);
  return refs;
}

function validateValueAgainstJsonSchema(value: unknown, schema: JsonSchemaObject, path: string) {
  if (schema.type === 'object') {
    if (path.endsWith('.model') && typeof value === 'string' && value.trim().length > 0) return;
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`INVALID_PARAMS:${path}`);
    }
    const record = value as Record<string, unknown>;
    for (const required of schema.required ?? []) {
      if (record[required] === undefined || record[required] === null || record[required] === '') {
        throw new Error(`MISSING_PARAM:${path}.${required}`);
      }
    }
    for (const [key, child] of Object.entries(schema.properties ?? {})) {
      if (record[key] === undefined) continue;
      validateValueAgainstJsonSchema(record[key], child as JsonSchemaObject, `${path}.${key}`);
    }
    return;
  }

  if (value === undefined || value === null || value === '') return;
  if (typeof value === 'string' && value.includes('{{')) return;
  if (schema.type === 'string' && typeof value !== 'string') throw new Error(`INVALID_PARAMS:${path}`);
  if (schema.type === 'number' && typeof value !== 'number') throw new Error(`INVALID_PARAMS:${path}`);
  if (schema.type === 'boolean' && typeof value !== 'boolean') throw new Error(`INVALID_PARAMS:${path}`);
  if (schema.enum && !schema.enum.includes(value)) throw new Error(`INVALID_PARAMS:${path}`);
  if (schema.type === 'number' && typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) throw new Error(`PARAM_TOO_SMALL:${path}:${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) throw new Error(`PARAM_TOO_LARGE:${path}:${schema.maximum}`);
  }
}

export function formatAdminServiceValidationError(error: string): string {
  const [code, path, limit] = error.split(':');
  const stepMatch = path?.match(/params\.(step_\d+)\.(.+)/);
  const stepLabel = stepMatch ? `Шаг ${stepMatch[1].replace('step_', '')}` : 'Пайплайн';
  const param = stepMatch?.[2] ?? path ?? '';

  if (code === 'PIPELINE_EMPTY') return 'Пайплайн пустой. Добавьте хотя бы один шаг.';
  if (code === 'STEP_BLOCK_MISSING') return `Шаг ${path}: не выбран блок.`;
  if (code === 'STEP_INVALID') return `Шаг ${path}: ошибка в настройках шага. Откройте шаг для подробностей.`;
  if (code === 'INVALID_PARAMS') return `${stepLabel}, параметр "${param}": значение не подходит для этого поля.`;
  if (code === 'MISSING_PARAM') return `${stepLabel}, параметр "${param}": заполните обязательное поле.`;
  if (code === 'PARAM_TOO_LARGE') return `${stepLabel}, параметр "${param}": значение должно быть не больше ${limit}.`;
  if (code === 'PARAM_TOO_SMALL') return `${stepLabel}, параметр "${param}": значение должно быть не меньше ${limit}.`;
  if (code === 'UNKNOWN_BLOCK') return `Шаг ${path}: блок "${limit}" не найден в каталоге.`;
  if (code === 'DUPLICATE_STEP_ID') return `Дублируется id шага: ${path}.`;
  if (code === 'INVALID_STEP_REFERENCE') {
    const [, stepNumber, source, availableRaw] = error.split(':');
    const available = availableRaw ? availableRaw.split(',').filter(Boolean).map((item) => `${item}.output`).join(', ') : 'пока нет предыдущих шагов';
    return `Шаг ${stepNumber}: источник "${source}.output" не существует. Доступные источники: ${available}.`;
  }
  if (code === 'UNKNOWN_USER_FIELD') return `Пайплайн ссылается на поле пользователя "${path}", но такого поля нет в форме.`;
  if (code === 'USER_INPUT_FORM_EMPTY') return 'Форма пользователя пустая. Добавьте хотя бы поле качества tier.';
  if (code === 'USER_INPUT_FIELD_INVALID') return `Поле формы ${path}: ошибка в настройках.`;
  if (code === 'DUPLICATE_FIELD_ID') return `Дублируется id поля формы: ${path}.`;
  if (code === 'SELECT_OPTIONS_REQUIRED') return `Поле выбора "${path}" должно содержать варианты.`;
  if (code === 'MEDIA_KIND_REQUIRED') return `Media-select поле "${path}" должно содержать mediaKind.`;
  if (error === 'TIER_FIELD_REQUIRED') return 'В форме должно быть ровно одно поле выбора тарифа.';
  if (error === 'TIER_FIELD_DUPLICATE') return 'В форме не должно быть больше одного поля выбора тарифа.';
  if (error.trim().startsWith('[') || error.includes('"code"')) return 'Пайплайн содержит ошибку в данных. Откройте шаг для подробностей.';
  return error || 'Пайплайн содержит ошибку в данных. Откройте шаг для подробностей.';
}
