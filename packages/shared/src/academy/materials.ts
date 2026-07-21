import { z } from 'zod';
import { estimateModelCostUsd, getBlockCatalogItem } from '../blocks';

// === Библиотеки учебных материалов (Academy A5) ===

export const ACADEMY_MEDIA_ASSET_KINDS = [
  'academy-background',
  'academy-prop',
  'academy-npc',
  'academy-effect',
  'academy-audio',
] as const;

export type AcademyMediaAssetKind = (typeof ACADEMY_MEDIA_ASSET_KINDS)[number];

export const CHILD_ASSET_KINDS = ['pose', 'scene', 'cutscene', 'project'] as const;
export type ChildAssetKind = (typeof CHILD_ASSET_KINDS)[number];

export const ACADEMY_ASSET_KIND_LABELS: Record<AcademyMediaAssetKind | ChildAssetKind, string> = {
  'academy-background': 'Фон',
  'academy-prop': 'Предмет',
  'academy-npc': 'NPC-персонаж',
  'academy-effect': 'Эффект',
  'academy-audio': 'Аудио',
  pose: 'Поза ребёнка',
  scene: 'Сцена с ребёнком',
  cutscene: 'Ключевой кадр / кат-сцена',
  project: 'Проект ребёнка',
};

export const ACADEMY_LIBRARY_SCOPES = ['shared', 'teacher', 'child'] as const;
export type AcademyLibraryScope = (typeof ACADEMY_LIBRARY_SCOPES)[number];

export type AcademyLibraryActorRole =
  | 'USER'
  | 'PARENT'
  | 'TEACHER'
  | 'METHODIST'
  | 'ADMIN'
  | 'READONLY_ADMIN';

export interface AcademyLibraryAccessContext {
  scope: AcademyLibraryScope;
  actorRole: AcademyLibraryActorRole;
  actorUserId: string;
  ownerUserId?: string | null;
  childParentId?: string | null;
  /** Для преподавателя API вычисляет назначение по Lesson. */
  teacherAssigned?: boolean;
  createdById?: string | null;
}

/** Чистое правило видимости, которое API применяет после DB ownership-проверки. */
export function canReadAcademyLibraryAsset(ctx: AcademyLibraryAccessContext): boolean {
  if (ctx.scope === 'shared') return true;
  if (ctx.actorRole === 'ADMIN') return true;
  if (ctx.scope === 'teacher') return ctx.ownerUserId === ctx.actorUserId;
  if (ctx.actorRole === 'PARENT' || ctx.actorRole === 'USER') {
    return ctx.childParentId === ctx.actorUserId;
  }
  return ctx.actorRole === 'TEACHER' && ctx.teacherAssigned === true;
}

/** Общую библиотеку меняет админ; личную — владелец; детскую — создатель/админ. */
export function canMutateAcademyLibraryAsset(ctx: AcademyLibraryAccessContext): boolean {
  if (ctx.actorRole === 'ADMIN') return true;
  if (ctx.scope === 'shared') return false;
  if (ctx.scope === 'teacher') return ctx.ownerUserId === ctx.actorUserId;
  return ctx.actorRole === 'TEACHER'
    && ctx.teacherAssigned === true
    && ctx.createdById === ctx.actorUserId;
}

/** Детский материал нельзя промоутить ни при какой роли. */
export function canPromoteAcademyAsset(scope: AcademyLibraryScope, actorRole: AcademyLibraryActorRole): boolean {
  return scope === 'teacher' && actorRole === 'ADMIN';
}

// === Генерация ===

export const ACADEMY_GENERATION_KINDS = [
  'background',
  'prop',
  'npc',
  'effect',
  'pose',
  'scene',
  'cutscene',
] as const;
export type AcademyGenerationKind = (typeof ACADEMY_GENERATION_KINDS)[number];

export const ACADEMY_GENERATION_KIND_LABELS: Record<AcademyGenerationKind, string> = {
  background: 'Фон',
  prop: 'Предмет',
  npc: 'NPC-персонаж',
  effect: 'Эффект',
  pose: 'Поза ребёнка',
  scene: 'Сцена с ребёнком',
  cutscene: 'Ключевой кадр',
};

export const ACADEMY_GENERATION_OPERATIONS = [
  'generate',
  'transparent-background',
  'keyframe',
  'variation',
  'inpaint',
  'upscale',
] as const;
export type AcademyGenerationOperation = (typeof ACADEMY_GENERATION_OPERATIONS)[number];

export const ACADEMY_GENERATION_OPERATION_LABELS: Record<AcademyGenerationOperation, string> = {
  generate: 'Новая генерация',
  'transparent-background': 'Прозрачный фон',
  keyframe: 'Ключевой кадр',
  variation: 'Вариация',
  inpaint: 'Замена области',
  upscale: 'Апскейл',
};

export const ACADEMY_GENERATION_MODELS = ['nano-banana', 'gpt-image-2'] as const;
export const ACADEMY_GENERATION_ASPECT_RATIOS = ['1:1', '3:4', '4:3', '16:9', '9:16'] as const;
export const ACADEMY_GENERATION_STYLES = [
  'cinematic-animation',
  'realistic',
  'storybook',
  'clean-educational',
] as const;

export const ACADEMY_GENERATION_STYLE_LABELS: Record<(typeof ACADEMY_GENERATION_STYLES)[number], string> = {
  'cinematic-animation': 'Кинематографическая анимация',
  realistic: 'Реалистичный',
  storybook: 'Иллюстрация книги',
  'clean-educational': 'Чистый учебный',
};

export const ACADEMY_BACKGROUND_REMOVAL_ENDPOINT = 'fal-ai/birefnet/v2';
export const ACADEMY_BACKGROUND_REMOVAL_ESTIMATED_USD = 0.02;

export function isChildAssetKind(kind: string): kind is ChildAssetKind {
  return (CHILD_ASSET_KINDS as readonly string[]).includes(kind);
}

export function generationKindToAsset(kind: AcademyGenerationKind): {
  scope: 'teacher' | 'child';
  assetKind: AcademyMediaAssetKind | ChildAssetKind;
} {
  const map: Record<AcademyGenerationKind, AcademyMediaAssetKind | ChildAssetKind> = {
    background: 'academy-background',
    prop: 'academy-prop',
    npc: 'academy-npc',
    effect: 'academy-effect',
    pose: 'pose',
    scene: 'scene',
    cutscene: 'cutscene',
  };
  const assetKind = map[kind];
  return { scope: isChildAssetKind(assetKind) ? 'child' : 'teacher', assetKind };
}

export const academyGenerationSchema = z.object({
  kind: z.enum(ACADEMY_GENERATION_KINDS),
  operation: z.enum(ACADEMY_GENERATION_OPERATIONS).default('generate'),
  title: z.string().trim().min(1, 'Укажите название').max(160),
  prompt: z.string().trim().min(8, 'Опишите материал подробнее').max(4000),
  systemPrompt: z.string().trim().max(4000).optional(),
  model: z.enum(ACADEMY_GENERATION_MODELS).default('nano-banana'),
  style: z.enum(ACADEMY_GENERATION_STYLES).default('cinematic-animation'),
  aspectRatio: z.enum(ACADEMY_GENERATION_ASPECT_RATIOS).default('16:9'),
  quality: z.enum(['low', 'medium', 'high']).default('medium'),
  resolution: z.enum(['1K', '2K', '4K']).default('1K'),
  count: z.number().int().min(1).max(4).default(1),
  transparentBackground: z.boolean().default(false),
  childId: z.string().min(1).optional(),
  topicId: z.string().min(1).optional(),
  characterReferenceIds: z.array(z.string().min(1)).max(14).default([]),
  referenceAssetIds: z.array(z.string().min(1)).max(10).default([]),
  outfit: z.string().trim().max(500).optional(),
  emotion: z.string().trim().max(300).optional(),
  cameraAngle: z.string().trim().max(300).optional(),
  lighting: z.string().trim().max(300).optional(),
  tags: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
  maxCostUsd: z.number().positive().max(50),
}).superRefine((input, ctx) => {
  const target = generationKindToAsset(input.kind);
  if (target.scope === 'child' && !input.childId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['childId'], message: 'Выберите ребёнка' });
  }
  if (target.scope === 'teacher' && (input.childId || input.characterReferenceIds.length > 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['childId'],
      message: 'Детские референсы нельзя использовать для общей или преподавательской библиотеки',
    });
  }
  if (input.transparentBackground && ['background', 'scene', 'cutscene'].includes(input.kind)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['transparentBackground'],
      message: 'Прозрачный фон доступен для предметов, NPC, эффектов и поз',
    });
  }
  if (
    target.scope === 'teacher'
    && ['variation', 'inpaint', 'upscale'].includes(input.operation)
    && input.referenceAssetIds.length === 0
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['referenceAssetIds'],
      message: 'Для вариации, замены области или апскейла выберите референс из библиотеки',
    });
  }
});

export type AcademyGenerationInput = z.infer<typeof academyGenerationSchema>;

export const updateAcademyAssetSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
});

export const promoteAcademyAssetSchema = z.object({
  sourceScope: z.enum(['teacher', 'child']),
  assetId: z.string().min(1),
});

export function estimateAcademyGenerationCostUsd(input: Pick<
  AcademyGenerationInput,
  'model' | 'quality' | 'resolution' | 'aspectRatio' | 'count' | 'transparentBackground'
>): number {
  const model = getBlockCatalogItem('image-edit')?.supportedModels.find((item) => item.slug === input.model);
  if (!model) return 0;
  const perImage = estimateModelCostUsd(model, {
    quality: input.quality,
    resolution: input.resolution,
    aspect_ratio: input.aspectRatio,
  });
  const removal = input.transparentBackground ? ACADEMY_BACKGROUND_REMOVAL_ESTIMATED_USD : 0;
  return Number(((perImage + removal) * input.count).toFixed(4));
}

const KIND_PROMPTS: Record<AcademyGenerationKind, string> = {
  background: 'Create a wide reusable educational scene background with no people and no text.',
  prop: 'Create one clearly isolated educational prop, fully visible, with no text or watermark.',
  npc: 'Create a family-friendly supporting NPC character, fully visible, with no text or watermark.',
  effect: 'Create a reusable visual effect asset with a clear silhouette and no text.',
  pose: 'Create the exact same child from the supplied identity references in the requested full-body pose. Preserve identity precisely.',
  scene: 'Create a cinematic educational scene featuring the exact same child from the supplied identity references. Preserve identity precisely.',
  cutscene: 'Create a polished cinematic story keyframe featuring the exact same child from the supplied identity references. Preserve identity precisely.',
};

const OPERATION_PROMPTS: Record<AcademyGenerationOperation, string> = {
  generate: '',
  'transparent-background': 'Keep the foreground subject isolated; the result will be processed into a transparent PNG.',
  keyframe: 'Compose this as a strong cinematic keyframe with a clear focal point.',
  variation: 'Create a faithful variation of the supplied reference while preserving its essential design.',
  inpaint: 'Apply only the requested replacement and keep all unrelated areas consistent with the reference.',
  upscale: 'Recreate the supplied reference at higher clarity without changing its content or composition.',
};

/** Собирает стабильный provider prompt из полей панели. */
export function buildAcademyGenerationPrompt(input: AcademyGenerationInput): string {
  return [
    input.systemPrompt,
    KIND_PROMPTS[input.kind],
    OPERATION_PROMPTS[input.operation],
    `Requested style: ${ACADEMY_GENERATION_STYLE_LABELS[input.style]}.`,
    input.prompt,
    input.outfit ? `Outfit: ${input.outfit}.` : '',
    input.emotion ? `Emotion: ${input.emotion}.` : '',
    input.cameraAngle ? `Camera angle: ${input.cameraAngle}.` : '',
    input.lighting ? `Lighting: ${input.lighting}.` : '',
    'No logos, no watermark, no accidental text.',
  ].filter(Boolean).join(' ');
}

// === DTO ===

export interface AcademyAssetDragData {
  type: 'academy-asset';
  assetId: string;
  scope: AcademyLibraryScope;
  kind: string;
  fileUrl: string;
  mimeType: string;
}

export interface AcademyAssetDto {
  id: string;
  scope: AcademyLibraryScope;
  kind: string;
  kindLabel: string;
  title: string;
  description: string | null;
  tags: string[];
  fileUrl: string;
  thumbnailUrl: string | null;
  mimeType: string;
  fileSize: number;
  width: number | null;
  height: number | null;
  durationSec: number | null;
  ownerUserId: string | null;
  ownerName: string | null;
  childId: string | null;
  childName: string | null;
  generationModel: string | null;
  generationPrompt: string | null;
  generationCostUsd: number;
  sourceRefIds: string[];
  createdAt: string;
  canEdit: boolean;
  canPromote: boolean;
  dragData: AcademyAssetDragData;
}

export interface AcademyGenerationStatusDto {
  projectId: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  progress: number;
  errorMessage: string | null;
  estimatedCostUsd: number;
  assetIds: string[];
}

export interface AcademyGenerationChildDto {
  id: string;
  name: string;
  characterStatus: string | null;
}
