import { prisma } from '@allvision/database';
import {
  CUSTOM_ORDER_STATUS_LABELS,
  briefFieldsSchema,
  canTransitionOrder,
  renderOrderEmail,
  validateBriefValues,
  type BriefField,
  type CustomOrderStatus,
  type OrderEmailTemplate,
} from '@allvision/shared';
import { HttpError } from '../utils/http-error';
import { logger } from '../utils/logger';
import { sendTransactionalEmail, transactionalMailConfigured } from './mail-service';

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://allvision-pulse.ru').replace(/\/+$/, '');

export function parseBriefFields(value: unknown): BriefField[] {
  const parsed = briefFieldsSchema.safeParse(value);
  if (!parsed.success) return [];
  return parsed.data;
}

/**
 * Письмо о смене статуса.
 *
 * Шаблон берётся из типа заказа; если админ его не заполнил, используется встроенный текст.
 * Заказчик не должен оставаться без ответа только потому, что до шаблона не дошли руки.
 */
const FALLBACK_TEMPLATES: Partial<Record<CustomOrderStatus, OrderEmailTemplate>> = {
  NEW: {
    subject: 'Заявка принята — {{orderTitle}}',
    body: 'Здравствуйте, {{name}}!\n\nМы получили вашу заявку «{{orderTitle}}» и скоро напишем: уточним детали и назовём цену.\n\nСледить за заявкой: {{link}}',
  },
  QUOTED: {
    subject: 'Цена по заявке «{{orderTitle}}»',
    body: 'Здравствуйте, {{name}}!\n\nПо вашей заявке «{{orderTitle}}» цена — {{price}}.\n{{note}}\n\nПодтвердить заказ: {{link}}',
  },
  PAID: {
    subject: 'Оплата получена — {{orderTitle}}',
    body: 'Здравствуйте, {{name}}!\n\nОплата получена, заказ «{{orderTitle}}» встал в очередь. Напишем, когда работа будет готова.\n\nЗаявка: {{link}}',
  },
  IN_PROGRESS: {
    subject: 'Работаем над «{{orderTitle}}»',
    body: 'Здравствуйте, {{name}}!\n\nВзяли ваш заказ «{{orderTitle}}» в работу.\n{{note}}\n\nЗаявка: {{link}}',
  },
  DELIVERED: {
    subject: 'Ваше поздравление готово',
    body: 'Здравствуйте, {{name}}!\n\nЗаказ «{{orderTitle}}» готов — файл можно скачать в личном кабинете.\n{{note}}\n\nСкачать: {{link}}',
  },
  CANCELLED: {
    subject: 'Заявка «{{orderTitle}}» отменена',
    body: 'Здравствуйте, {{name}}!\n\nЗаявка «{{orderTitle}}» отменена.\n{{note}}\n\nЕсли это ошибка — напишите нам, мы вернём её в работу.',
  },
};

function templateFor(
  emailTemplates: unknown,
  status: CustomOrderStatus,
): OrderEmailTemplate | undefined {
  if (emailTemplates && typeof emailTemplates === 'object') {
    const record = (emailTemplates as Record<string, unknown>)[status];
    if (record && typeof record === 'object') {
      const { subject, body } = record as Record<string, unknown>;
      if (typeof subject === 'string' && typeof body === 'string' && subject.trim() && body.trim()) {
        return { subject, body };
      }
    }
  }
  return FALLBACK_TEMPLATES[status];
}

export async function sendOrderStatusEmail(input: {
  orderId: string;
  status: CustomOrderStatus;
  note?: string | null;
}) {
  const order = await prisma.customOrder.findUnique({
    where: { id: input.orderId },
    select: {
      id: true,
      typeTitle: true,
      contactName: true,
      contactEmail: true,
      quotedPriceCoins: true,
      orderType: { select: { emailTemplates: true } },
    },
  });
  if (!order) return;

  const template = templateFor(order.orderType?.emailTemplates, input.status);
  if (!template) return;

  const vars = {
    name: order.contactName,
    orderTitle: order.typeTitle,
    price: order.quotedPriceCoins ? `${order.quotedPriceCoins} коинов` : 'по договорённости',
    link: `${SITE_URL}/orders/${order.id}`,
    note: (input.note ?? '').trim(),
  };
  const subject = renderOrderEmail(template.subject, vars);
  const text = renderOrderEmail(template.body, vars);
  const html = `<p>${text.replace(/\n/g, '<br />')}</p>`;

  if (!transactionalMailConfigured()) {
    // Без настроенного провайдера письмо не теряется молча: его видно в логах,
    // и админ может связаться с заказчиком вручную.
    logger.info(`[orders] письмо не отправлено (почта не настроена): ${order.contactEmail} — ${subject}`);
    return;
  }
  try {
    await sendTransactionalEmail({ to: order.contactEmail, subject, html, text });
  } catch (err) {
    // Смена статуса не должна падать из-за почты: заказ уже переведён, письмо вторично.
    logger.error(`[orders] не удалось отправить письмо по заявке ${order.id}`, err);
  }
}

export async function createCustomOrder(input: {
  userId: string;
  typeSlug: string;
  brief: Record<string, unknown>;
  attachments: string[];
  contactName: string;
  contactEmail: string;
  contactPhone?: string;
  contactMessenger?: string;
  contactHandle?: string;
}) {
  const orderType = await prisma.orderTypeDef.findFirst({
    where: { slug: input.typeSlug, isActive: true },
    select: { id: true, title: true, briefFields: true },
  });
  if (!orderType) throw new HttpError(404, 'ORDER_TYPE_NOT_FOUND', 'Такой заказ сейчас недоступен');

  const fields = parseBriefFields(orderType.briefFields);
  const issues = validateBriefValues(fields, input.brief);
  if (issues.length > 0) {
    throw new HttpError(400, 'INVALID_BRIEF', issues[0].message);
  }

  // Оставляем в брифе только объявленные поля: лишние ключи из формы хранить незачем.
  const brief = Object.fromEntries(
    fields.map((field) => [field.id, input.brief[field.id] ?? null]),
  );

  const order = await prisma.customOrder.create({
    data: {
      userId: input.userId,
      orderTypeId: orderType.id,
      typeTitle: orderType.title,
      brief: brief as never,
      attachments: input.attachments,
      contactName: input.contactName,
      contactEmail: input.contactEmail,
      contactPhone: input.contactPhone ?? null,
      contactMessenger: input.contactMessenger ?? null,
      contactHandle: input.contactHandle ?? null,
    },
    select: { id: true, status: true, createdAt: true, typeTitle: true },
  });

  await sendOrderStatusEmail({ orderId: order.id, status: 'NEW' });
  return order;
}

/**
 * Смена статуса заявки.
 *
 * Переходы описаны явно в shared: «доставить» неоплаченный заказ случайным кликом
 * быть не должно. Системное сообщение в переписке остаётся следом для обеих сторон.
 */
export async function changeOrderStatus(input: {
  orderId: string;
  next: CustomOrderStatus;
  adminId?: string;
  note?: string;
  quotedPriceCoins?: number;
  resultUrl?: string;
}) {
  const order = await prisma.customOrder.findUnique({
    where: { id: input.orderId },
    select: { id: true, status: true },
  });
  if (!order) throw new HttpError(404, 'ORDER_NOT_FOUND', 'Заявка не найдена');

  const current = order.status as CustomOrderStatus;
  if (!canTransitionOrder(current, input.next)) {
    throw new HttpError(
      400,
      'INVALID_STATUS_TRANSITION',
      `Из «${CUSTOM_ORDER_STATUS_LABELS[current]}» нельзя перейти в «${CUSTOM_ORDER_STATUS_LABELS[input.next]}»`,
    );
  }
  if (input.next === 'QUOTED' && !input.quotedPriceCoins) {
    throw new HttpError(400, 'PRICE_REQUIRED', 'Назовите цену перед отправкой заказчику');
  }

  const updated = await prisma.customOrder.update({
    where: { id: order.id },
    data: {
      status: input.next,
      ...(input.quotedPriceCoins !== undefined ? { quotedPriceCoins: input.quotedPriceCoins } : {}),
      ...(input.resultUrl !== undefined ? { resultUrl: input.resultUrl } : {}),
      ...(input.note !== undefined ? { adminNote: input.note } : {}),
      messages: {
        create: {
          authorId: input.adminId ?? null,
          fromAdmin: Boolean(input.adminId),
          body: input.note?.trim()
            ? `Статус: ${CUSTOM_ORDER_STATUS_LABELS[input.next]}. ${input.note.trim()}`
            : `Статус: ${CUSTOM_ORDER_STATUS_LABELS[input.next]}`,
        },
      },
    },
    select: { id: true, status: true, quotedPriceCoins: true, updatedAt: true },
  });

  await sendOrderStatusEmail({ orderId: order.id, status: input.next, note: input.note });
  return updated;
}

/**
 * Оплата заявки коинами.
 *
 * Отдельный платёж заводить не стали: у пользователя уже есть баланс, а списание
 * одной транзакцией даёт готовую историю и понятный возврат при отмене.
 */
export async function payCustomOrder(userId: string, orderId: string) {
  const order = await prisma.customOrder.findFirst({
    where: { id: orderId, userId },
    select: { id: true, status: true, quotedPriceCoins: true, typeTitle: true },
  });
  if (!order) throw new HttpError(404, 'ORDER_NOT_FOUND', 'Заявка не найдена');
  if (order.status !== 'QUOTED') {
    throw new HttpError(400, 'ORDER_NOT_QUOTED', 'Оплатить можно только заявку с названной ценой');
  }
  const price = order.quotedPriceCoins ?? 0;
  if (price <= 0) throw new HttpError(400, 'PRICE_REQUIRED', 'По заявке ещё не названа цена');

  try {
    await prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: userId, tokenBalance: { gte: price } },
        data: { tokenBalance: { decrement: price } },
        select: { tokenBalance: true },
      });
      await tx.tokenTransaction.create({
        data: {
          reason: 'custom_order',
          amount: -price,
          balanceAfter: user.tokenBalance,
          refId: order.id,
          userId,
        },
      });
      await tx.customOrder.update({
        where: { id: order.id },
        data: {
          status: 'PAID',
          messages: {
            create: { authorId: userId, fromAdmin: false, body: `Заказ оплачен: ${price} коинов` },
          },
        },
      });
    });
  } catch (err) {
    if ((err as { code?: string }).code === 'P2025') {
      throw new HttpError(402, 'INSUFFICIENT_TOKENS', 'Недостаточно коинов на балансе');
    }
    throw err;
  }

  await sendOrderStatusEmail({ orderId: order.id, status: 'PAID' });
  return { status: 'PAID' as const, price };
}
