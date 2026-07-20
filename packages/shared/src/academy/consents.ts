// Согласия родителя на обработку данных ребёнка (Academy A1).
// Порядок и состав зеркалит Prisma enum ConsentType.

export const CONSENT_TYPES = [
  'IMAGE_PROCESSING',
  'AI_CHARACTER',
  'AI_GENERATION',
  'EXTERNAL_PROVIDERS',
  'DATA_RETENTION',
] as const;

export type ConsentTypeValue = (typeof CONSENT_TYPES)[number];

export interface ConsentDefinition {
  type: ConsentTypeValue;
  title: string;
  description: string;
  /** Без этих согласий нельзя загружать фотографии ребёнка. */
  requiredForPhotos: boolean;
}

export const CONSENT_DEFINITIONS: ConsentDefinition[] = [
  {
    type: 'IMAGE_PROCESSING',
    title: 'Обработка изображений ребёнка',
    description:
      'Разрешаю обработку загруженных фотографий ребёнка для подготовки учебных материалов.',
    requiredForPhotos: true,
  },
  {
    type: 'AI_CHARACTER',
    title: 'Создание AI-персонажа',
    description:
      'Разрешаю создание синтетического персонажа с внешностью ребёнка для персонализации уроков.',
    requiredForPhotos: true,
  },
  {
    type: 'AI_GENERATION',
    title: 'Генерация иллюстраций и видео',
    description:
      'Разрешаю генерацию иллюстраций и коротких видео с участием AI-персонажа ребёнка.',
    requiredForPhotos: true,
  },
  {
    type: 'EXTERNAL_PROVIDERS',
    title: 'Использование внешних AI-сервисов',
    description:
      'Понимаю, что генерация выполняется внешними AI-сервисами; материалы передаются только через сервер платформы, без публичного доступа.',
    requiredForPhotos: true,
  },
  {
    type: 'DATA_RETENTION',
    title: 'Правила хранения и удаления',
    description:
      'Ознакомлен(а) с правилами хранения материалов и возможностью в любой момент удалить фотографии, персонажа и все производные данные.',
    requiredForPhotos: true,
  },
];

export const CONSENT_CURRENT_VERSION = 'v1';

export function requiredConsentTypesForPhotos(): ConsentTypeValue[] {
  return CONSENT_DEFINITIONS.filter((item) => item.requiredForPhotos).map((item) => item.type);
}

/** Все ли обязательные для фото согласия приняты (и не отозваны). */
export function hasAllPhotoConsents(
  accepted: Array<{ type: string; revokedAt?: string | Date | null }>,
): boolean {
  const active = new Set(
    accepted.filter((item) => !item.revokedAt).map((item) => item.type),
  );
  return requiredConsentTypesForPhotos().every((type) => active.has(type));
}
