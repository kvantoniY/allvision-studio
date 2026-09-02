import { prisma } from '@allvision/database';
import type { Prisma, PrismaClient } from '@prisma/client';
import { HttpError } from '../utils/http-error';
import { logger } from '../utils/logger';

/**
 * Промокоды на пополнение баланса.
 *
 * Код удешевляет покупку, но не меняет число токенов: в пакете сколько было, столько и
 * начислится. Так владелец может раздавать скидку в рекламе, не пересчитывая экономику
 * пакетов.
 *
 * Ключевое правило: код считается использованным ТОЛЬКО после успешной оплаты и зачисления
 * токенов. Введённый в форме и брошенный на полпути он не должен съедать лимит — иначе
 * счётчик показывал бы интерес к рекламе, а не покупки, ради подсчёта которых всё и
 * затевалось.
 */

/** Минимальная сумма к оплате: провайдеры не принимают ноль. */
const MIN_CHARGE_KOPECKS = 100;

export type PromoDiscount = {
  promoCodeId: string;
  code: string;
  /** Копейки: в них же хранится Payment.amountRub. */
  discountKopecks: number;
  amountKopecks: number;
  originalKopecks: number;
};

/** Приводим к одному виду: человек вводит как угодно, а искать надо однозначно. */
export function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

/**
 * Скидка кода на конкретную сумму.
 *
 * Процент округляем вниз в пользу магазина на копейках и не даём уйти ниже минимального
 * платежа: скидка «на всю сумму» превратилась бы в платёж на ноль рублей, который
 * провайдер просто отклонит.
 */
export function discountKopecksFor(
  promo: { discountType: string; discountValue: number },
  amountKopecks: number,
): number {
  const raw = promo.discountType === 'PERCENT'
    ? Math.floor((amountKopecks * promo.discountValue) / 100)
    : promo.discountValue * 100;
  return Math.max(0, Math.min(raw, Math.max(0, amountKopecks - MIN_CHARGE_KOPECKS)));
}

/** Условия кода: этого хватает витрине, чтобы показать новую цену на всех пакетах. */
export type PromoTerms = {
  code: string;
  discountType: 'PERCENT' | 'FIXED';
  discountValue: number;
  description: string | null;
};

/**
 * Проверка самого кода, без суммы.
 *
 * Нужна витрине: пакетов несколько, и человек должен увидеть новую цену сразу на всех, а не
 * гадать, к какому из них код применится.
 */
export async function resolvePromoTerms(rawCode: string): Promise<PromoTerms> {
  const code = normalizeCode(rawCode);
  if (!code) throw new HttpError(400, 'PROMO_CODE_REQUIRED', 'Введите промокод');

  const promo = await prisma.promoCode.findUnique({ where: { code } });
  if (!promo || !promo.isActive) {
    throw new HttpError(404, 'PROMO_CODE_NOT_FOUND', 'Такого промокода нет');
  }
  if (promo.expiresAt && promo.expiresAt.getTime() < Date.now()) {
    throw new HttpError(400, 'PROMO_CODE_EXPIRED', 'Срок действия промокода истёк');
  }
  if (promo.maxUses != null && promo.usedCount >= promo.maxUses) {
    throw new HttpError(400, 'PROMO_CODE_EXHAUSTED', 'Промокод уже использован полностью');
  }

  return {
    code: promo.code,
    discountType: promo.discountType as 'PERCENT' | 'FIXED',
    discountValue: promo.discountValue,
    description: promo.description,
  };
}

/**
 * Скидка кода на конкретную сумму — то, что уйдёт в платёж.
 *
 * Бросает понятную ошибку: человеку важно знать, код не тот, просрочен или уже разобран.
 */
export async function resolvePromoDiscount(rawCode: string, amountKopecks: number): Promise<PromoDiscount> {
  const code = normalizeCode(rawCode);
  if (!code) throw new HttpError(400, 'PROMO_CODE_REQUIRED', 'Введите промокод');

  const promo = await prisma.promoCode.findUnique({ where: { code } });
  if (!promo || !promo.isActive) {
    throw new HttpError(404, 'PROMO_CODE_NOT_FOUND', 'Такого промокода нет');
  }
  if (promo.expiresAt && promo.expiresAt.getTime() < Date.now()) {
    throw new HttpError(400, 'PROMO_CODE_EXPIRED', 'Срок действия промокода истёк');
  }
  if (promo.maxUses != null && promo.usedCount >= promo.maxUses) {
    throw new HttpError(400, 'PROMO_CODE_EXHAUSTED', 'Промокод уже использован полностью');
  }

  const discountKopecks = discountKopecksFor(promo, amountKopecks);
  if (discountKopecks <= 0) {
    throw new HttpError(400, 'PROMO_CODE_NOT_APPLICABLE', 'Промокод не применяется к этой сумме');
  }

  return {
    promoCodeId: promo.id,
    code: promo.code,
    discountKopecks,
    amountKopecks: amountKopecks - discountKopecks,
    originalKopecks: amountKopecks,
  };
}

/** Промо-часть метаданных платежа: по ней зачёт находит код после оплаты. */
export type PromoPaymentMetadata = {
  promoCodeId: string;
  promoCode: string;
  promoDiscountKopecks: number;
};

export function promoMetadata(discount: PromoDiscount): PromoPaymentMetadata {
  return {
    promoCodeId: discount.promoCodeId,
    promoCode: discount.code,
    promoDiscountKopecks: discount.discountKopecks,
  };
}

function readPromoMetadata(metadata: unknown): PromoPaymentMetadata | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const raw = metadata as Record<string, unknown>;
  const promoCodeId = typeof raw.promoCodeId === 'string' ? raw.promoCodeId : null;
  const promoCode = typeof raw.promoCode === 'string' ? raw.promoCode : null;
  const discount = Number(raw.promoDiscountKopecks);
  if (!promoCodeId || !promoCode || !Number.isFinite(discount)) return null;
  return { promoCodeId, promoCode, promoDiscountKopecks: discount };
}

type TxClient = Prisma.TransactionClient | PrismaClient;

/**
 * Зачёт использования — внутри той же транзакции, что и начисление токенов.
 *
 * Уникальный `paymentId` защищает от повторного webhook: вторая попытка просто ничего не
 * добавит. Лимит здесь НЕ проверяется намеренно: человек уже заплатил по скидочной цене, и
 * отказать в зачёте задним числом значит соврать в отчёте. Гонку на последнем использовании
 * видно по превышению счётчика, и это честнее, чем потерянная строка.
 */
export async function redeemPromoForPayment(
  tx: TxClient,
  payment: { id: string; userId: string; amountRub: number; metadata: unknown },
): Promise<void> {
  const promo = readPromoMetadata(payment.metadata);
  if (!promo) return;

  const existing = await tx.promoCodeUse.findUnique({ where: { paymentId: payment.id } });
  if (existing) return;

  await tx.promoCodeUse.create({
    data: {
      promoCodeId: promo.promoCodeId,
      userId: payment.userId,
      paymentId: payment.id,
      discountRub: promo.promoDiscountKopecks,
      amountRub: payment.amountRub,
    },
  });
  await tx.promoCode.update({
    where: { id: promo.promoCodeId },
    data: { usedCount: { increment: 1 } },
  });

  logger.info(
    `[promo] redeemed code=${promo.promoCode} paymentId=${payment.id} userId=${payment.userId} discountKopecks=${promo.promoDiscountKopecks}`,
  );
}
