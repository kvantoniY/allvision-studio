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
      'Как родитель или законный представитель разрешаю обрабатывать загруженные фотографии ребёнка только для подготовки и проведения его персональных занятий. Изображения не публикуются и не используются для рекламы.',
    requiredForPhotos: true,
  },
  {
    type: 'AI_CHARACTER',
    title: 'Создание AI-персонажа',
    description:
      'Разрешаю создать синтетического учебного персонажа с внешностью ребёнка. Материалы не применяются для установления личности, распознавания лица или создания общедоступной биометрической базы.',
    requiredForPhotos: true,
  },
  {
    type: 'AI_GENERATION',
    title: 'Генерация иллюстраций и видео',
    description:
      'Разрешаю создавать закрытые иллюстрации, позы и короткие видео с AI-персонажем ребёнка для его уроков, игровых наград и отчётов о занятиях.',
    requiredForPhotos: true,
  },
  {
    type: 'EXTERNAL_PROVIDERS',
    title: 'Использование внешних AI-сервисов',
    description:
      'Понимаю, что для генерации минимально необходимые изображения и инструкции могут передаваться привлечённым AI-провайдерам через сервер Академии. Публичные ссылки на детские материалы не создаются.',
    requiredForPhotos: true,
  },
  {
    type: 'DATA_RETENTION',
    title: 'Правила хранения и удаления',
    description:
      'Ознакомлен(а) с закрытым хранением материалов и могу отозвать согласие или удалить профиль ребёнка. После удаления персональные поля обезличиваются, а исходные и производные файлы ставятся в очередь физического удаления.',
    requiredForPhotos: true,
  },
];

export const CONSENT_CURRENT_VERSION = 'v2';

/** Неизменяемый текст, который сохраняется вместе с фактом принятия согласия. */
export function consentTextSnapshot(type: ConsentTypeValue): string {
  const definition = CONSENT_DEFINITIONS.find((item) => item.type === type);
  if (!definition) throw new Error(`Неизвестный тип согласия: ${type}`);
  return `${definition.title}\n${definition.description}\nРедакция: ${CONSENT_CURRENT_VERSION}`;
}

export function requiredConsentTypesForPhotos(): ConsentTypeValue[] {
  return CONSENT_DEFINITIONS.filter((item) => item.requiredForPhotos).map((item) => item.type);
}

/** Все ли обязательные для фото согласия приняты (и не отозваны). */
export function hasAllPhotoConsents(
  accepted: Array<{ type: string; version?: string; revokedAt?: string | Date | null }>,
): boolean {
  const active = new Set(
    accepted
      .filter((item) => !item.revokedAt && item.version === CONSENT_CURRENT_VERSION)
      .map((item) => item.type),
  );
  return requiredConsentTypesForPhotos().every((type) => active.has(type));
}
