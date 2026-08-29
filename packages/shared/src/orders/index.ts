import { z } from 'zod';

/**
 * G6 — поздравления на заказ.
 *
 * Тип заказа настраивается в админке целиком: поля брифа, вилка цен и письма по статусам.
 * Новый вид заказа не требует изменений в коде — это принципиально, потому что заказные
 * форматы придумываются быстрее, чем выкатываются релизы.
 */

export const BRIEF_FIELD_TYPES = ['text', 'textarea', 'select', 'date', 'number', 'photos'] as const;
export type BriefFieldType = (typeof BRIEF_FIELD_TYPES)[number];

export const briefFieldSchema = z.object({
  id: z.string().trim().min(1).max(60).regex(/^[a-zA-Z0-9_-]+$/),
  type: z.enum(BRIEF_FIELD_TYPES),
  label: z.string().trim().min(1).max(160),
  required: z.boolean().default(false),
  hint: z.string().trim().max(400).optional(),
  placeholder: z.string().trim().max(200).optional(),
  maxLength: z.coerce.number().int().min(1).max(5000).optional(),
  options: z.array(z.object({ value: z.string().trim().min(1).max(120), label: z.string().trim().min(1).max(160) })).optional(),
  maxPhotos: z.coerce.number().int().min(1).max(20).optional(),
});

export type BriefField = z.infer<typeof briefFieldSchema>;

export const briefFieldsSchema = z.array(briefFieldSchema).min(1).max(20);

/**
 * Путь заявки. Порядок статусов — это порядок работы, поэтому переходы описаны явно:
 * админ не должен иметь возможности «доставить» неоплаченный заказ по случайному клику.
 */
export const CUSTOM_ORDER_STATUSES = ['NEW', 'QUOTED', 'PAID', 'IN_PROGRESS', 'DELIVERED', 'CANCELLED'] as const;
export type CustomOrderStatus = (typeof CUSTOM_ORDER_STATUSES)[number];

export const CUSTOM_ORDER_STATUS_LABELS: Record<CustomOrderStatus, string> = {
  NEW: 'Новая заявка',
  QUOTED: 'Цена названа',
  PAID: 'Оплачено',
  IN_PROGRESS: 'В работе',
  DELIVERED: 'Готово',
  CANCELLED: 'Отменено',
};

/** Что видит заказчик: короткое объяснение, а не название статуса. */
export const CUSTOM_ORDER_STATUS_HINTS: Record<CustomOrderStatus, string> = {
  NEW: 'Мы получили заявку и скоро напишем — уточним детали и назовём цену.',
  QUOTED: 'Мы назвали цену. Подтвердите заказ, чтобы мы взяли его в работу.',
  PAID: 'Оплата получена, ставим заказ в очередь.',
  IN_PROGRESS: 'Работаем над вашим поздравлением.',
  DELIVERED: 'Готово — файл можно скачать.',
  CANCELLED: 'Заявка отменена.',
};

/** Разрешённые переходы. Отмена возможна из любого рабочего состояния. */
const TRANSITIONS: Record<CustomOrderStatus, CustomOrderStatus[]> = {
  NEW: ['QUOTED', 'CANCELLED'],
  // Из «цена названа» можно и оплатить на сайте, и сразу взять в работу: с заказными
  // работами часто договариваются с менеджером и платят иначе. Доставить неоплаченное
  // случайным кликом всё так же нельзя — DELIVERED доступен только из IN_PROGRESS.
  QUOTED: ['PAID', 'IN_PROGRESS', 'NEW', 'CANCELLED'],
  PAID: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['DELIVERED', 'CANCELLED'],
  DELIVERED: [],
  CANCELLED: [],
};

export function canTransitionOrder(from: CustomOrderStatus, to: CustomOrderStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function nextOrderStatuses(from: CustomOrderStatus): CustomOrderStatus[] {
  return TRANSITIONS[from] ?? [];
}

/** Статусы, в которых заказ ещё живёт: по ним считаются «активные заявки». */
export const ACTIVE_ORDER_STATUSES: CustomOrderStatus[] = ['NEW', 'QUOTED', 'PAID', 'IN_PROGRESS'];

export const orderEmailTemplateSchema = z.object({
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(4000),
});

export type OrderEmailTemplate = z.infer<typeof orderEmailTemplateSchema>;

export const orderEmailTemplatesSchema = z.record(z.enum(CUSTOM_ORDER_STATUSES), orderEmailTemplateSchema).optional();

/**
 * Подстановки в шаблон письма. Держим набор маленьким и предсказуемым: админ пишет
 * обычный текст, а не разбирается в синтаксисе шаблонизатора.
 */
export type OrderEmailVars = {
  name: string;
  orderTitle: string;
  price: string;
  link: string;
  note: string;
};

export function renderOrderEmail(template: string, vars: OrderEmailVars): string {
  return template.replace(/\{\{\s*(name|orderTitle|price|link|note)\s*\}\}/g, (_match, key: keyof OrderEmailVars) => vars[key] ?? '');
}

/** Значения брифа по умолчанию для формы. */
export function emptyBriefValues(fields: BriefField[]): Record<string, string> {
  return Object.fromEntries(fields.map((field) => [field.id, '']));
}

export type BriefValidationIssue = { fieldId: string; message: string };

/**
 * Проверка заполненного брифа. Возвращает список проблем, а не бросает: форме нужно
 * подсветить все поля разом, а не по одному за отправку.
 */
export function validateBriefValues(fields: BriefField[], values: Record<string, unknown>): BriefValidationIssue[] {
  const issues: BriefValidationIssue[] = [];
  for (const field of fields) {
    const value = values[field.id];
    const isEmpty = value === undefined || value === null || (typeof value === 'string' && value.trim() === '');

    if (field.required && isEmpty) {
      issues.push({ fieldId: field.id, message: `Заполните поле «${field.label}»` });
      continue;
    }
    if (isEmpty) continue;

    if (field.type === 'select' && field.options) {
      const allowed = field.options.map((option) => option.value);
      if (typeof value !== 'string' || !allowed.includes(value)) {
        issues.push({ fieldId: field.id, message: `Выберите вариант в поле «${field.label}»` });
      }
    }
    if (field.type === 'number' && Number.isNaN(Number(value))) {
      issues.push({ fieldId: field.id, message: `В поле «${field.label}» нужно число` });
    }
    if (field.maxLength && typeof value === 'string' && value.length > field.maxLength) {
      issues.push({ fieldId: field.id, message: `Поле «${field.label}» слишком длинное` });
    }
  }
  return issues;
}

/**
 * Способы связи по заявке.
 *
 * Не всем удобно ждать письма: часть людей хочет сразу написать в мессенджер, часть —
 * оставить контакт и чтобы менеджер написал сам. Оба пути ведут к одной заявке, поэтому
 * список общий для формы и админской карточки.
 */
export const ORDER_CONTACT_CHANNELS = ['max', 'telegram', 'whatsapp'] as const;
export type OrderContactChannel = (typeof ORDER_CONTACT_CHANNELS)[number];

export const ORDER_CONTACT_CHANNEL_TITLES: Record<OrderContactChannel, string> = {
  max: 'MAX',
  telegram: 'Telegram',
  whatsapp: 'WhatsApp',
};
