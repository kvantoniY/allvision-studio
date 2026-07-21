// Academy A2: профиль внешности ребёнка — эталонный набор референсов.
// Визуальный стиль: реалистичный ребёнок внутри кинематографического анимационного
// мира (НЕ плоская мультяшная наклейка).

export const CHARACTER_REF_KINDS = [
  'portrait',
  'profile_side',
  'three_quarter',
  'full_body',
  'neutral_pose',
  'expression_joy',
  'expression_surprise',
] as const;

export type CharacterRefKind = (typeof CHARACTER_REF_KINDS)[number];

export const CHARACTER_REF_LABELS: Record<CharacterRefKind, string> = {
  portrait: 'Эталонный портрет',
  profile_side: 'Профиль',
  three_quarter: 'Три четверти',
  full_body: 'Полный рост',
  neutral_pose: 'Нейтральная поза',
  expression_joy: 'Радость',
  expression_surprise: 'Удивление',
};

export const CHARACTER_PROFILE_STATUSES = [
  'DRAFT',
  'GENERATING',
  'READY',
  'APPROVED',
  'FAILED',
] as const;

export type CharacterProfileStatusValue = (typeof CHARACTER_PROFILE_STATUSES)[number];

// Общий identity-каркас: сохранить внешность ребёнка с исходных фото.
const IDENTITY_BASE =
  'Create a high-quality character reference image of the exact same child as in the '
  + 'provided reference photos. Preserve the child\'s real facial features, face shape, '
  + 'eye color, hair color and hairstyle with photographic fidelity — this must be '
  + 'recognizably the same child. Style: realistic child rendered inside a premium '
  + 'cinematic animated world (soft cinematic lighting, gentle color grading), NOT a flat '
  + 'cartoon sticker. Clean neutral warm studio background. Simple comfortable base '
  + 'outfit (plain t-shirt and trousers) unless stated otherwise. No text, no watermark.';

export const CHARACTER_REF_PROMPTS: Record<CharacterRefKind, string> = {
  portrait: `${IDENTITY_BASE} Framing: front-facing head-and-shoulders portrait, looking at camera, calm friendly expression, evenly lit face.`,
  profile_side: `${IDENTITY_BASE} Framing: strict side profile view of the head and shoulders, facing left, neutral expression.`,
  three_quarter: `${IDENTITY_BASE} Framing: three-quarter view of the head and shoulders, neutral pleasant expression.`,
  full_body: `${IDENTITY_BASE} Framing: full body, standing straight facing camera, arms relaxed at the sides, entire figure visible head to toe.`,
  neutral_pose: `${IDENTITY_BASE} Framing: full body, relaxed natural standing pose, slight friendly smile, ready to be used as an animation base pose.`,
  expression_joy: `${IDENTITY_BASE} Framing: head-and-shoulders, big joyful smile, bright happy eyes, natural childlike delight.`,
  expression_surprise: `${IDENTITY_BASE} Framing: head-and-shoulders, surprised expression — raised eyebrows, slightly open mouth, wide eyes.`,
};

/** Модель генерации по умолчанию (переопределяется env CHARACTER_PROFILE_MODEL). */
export const CHARACTER_PROFILE_DEFAULT_MODEL = 'nano-banana';

/** Бюджетный потолок одного профиля, USD (переопределяется env CHARACTER_PROFILE_MAX_USD). */
export const CHARACTER_PROFILE_DEFAULT_MAX_USD = 3;

// === DTO ===

export interface CharacterReferenceDto {
  id: string;
  kind: CharacterRefKind;
  label: string;
  width: number | null;
  height: number | null;
  costUsd: number;
  createdAt: string;
  /** Авторизованный URL раздачи (закрытое хранилище, не /static). */
  fileUrl: string;
}

export interface CharacterProfileDto {
  id: string;
  childId: string;
  status: CharacterProfileStatusValue;
  progress: number;
  errorMessage: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  references: CharacterReferenceDto[];
}
