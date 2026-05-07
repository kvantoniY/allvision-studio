import { z } from 'zod';
import { BLOCK_CATALOG, getBlockCatalogItem, type JsonSchemaObject } from '../blocks';

const booleanFromForm = z.preprocess((value) => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}, z.boolean());

const serviceCategoryValues = [
  'NOSTALGIA',
  'TRENDS_MEMES',
  'KIDS_HEROES',
  'SPECIAL_OCCASIONS',
] as const;

export const adminServiceCategorySchema = z.enum(serviceCategoryValues);

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
  type: z.enum(['text', 'textarea', 'photo', 'select', 'avatar', 'tier']),
  label: z.string().trim().min(1).max(120),
  required: z.boolean(),
  hint: z.string().trim().max(240).optional(),
  placeholder: z.string().trim().max(160).optional(),
  maxLength: z.number().int().min(1).max(5000).optional(),
  maxSizeMb: z.number().int().min(1).max(100).optional(),
  allowedFormats: z.array(z.string().trim().min(1)).optional(),
  avatarTypes: z.array(z.enum(['HUMAN', 'PET', 'OBJECT', 'all'])).optional(),
  options: z.array(z.object({
    label: z.string().trim().min(1).max(120),
    value: z.string().trim().min(1).max(500),
  })).optional(),
});

export const userInputFormSchema = z.array(userInputFieldSchema).min(1);

export const createAdminServiceSchema = z.object({
  slug: z.string().trim().min(1).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().trim().min(1).max(140),
  shortDesc: z.string().trim().min(1).max(280),
  description: z.string().trim().min(1).max(6000),
  category: adminServiceCategorySchema,
  pipelineConfig: pipelineConfigSchema,
  userInputForm: userInputFormSchema,
  priceCoinsStandard: z.coerce.number().int().min(1),
  priceCoinsPro: z.coerce.number().int().min(1),
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
  const steps = pipelineConfigSchema.parse(config);
  const fields = userInputFormSchema.parse(userInputForm);
  const fieldIds = new Set(fields.map((field) => field.id));
  const seen = new Set<string>();

  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index];
    if (seen.has(step.id)) {
      throw new Error(`DUPLICATE_STEP_ID:${step.id}`);
    }
    seen.add(step.id);

    const block = getBlockCatalogItem(step.blockSlug);
    if (!block) {
      throw new Error(`UNKNOWN_BLOCK:${step.blockSlug}`);
    }
    validateValueAgainstJsonSchema(step.params ?? {}, block.paramsSchema, `params.${step.id}`);

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
          throw new Error(`INVALID_STEP_REFERENCE:${stepId}`);
        }
      }
    }
  }

  return steps;
}

export function validateUserInputForm(form: unknown): UserInputFieldInput[] {
  const fields = userInputFormSchema.parse(form);
  const seen = new Set<string>();
  let tierCount = 0;

  for (const field of fields) {
    if (seen.has(field.id)) throw new Error(`DUPLICATE_FIELD_ID:${field.id}`);
    seen.add(field.id);
    if (field.type === 'tier') tierCount += 1;
    if (field.type === 'select' && (!field.options || field.options.length === 0)) {
      throw new Error(`SELECT_OPTIONS_REQUIRED:${field.id}`);
    }
  }

  if (tierCount !== 1) throw new Error('TIER_FIELD_REQUIRED');
  return fields;
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
}

export const serviceCategoryValuesForUi = serviceCategoryValues;
