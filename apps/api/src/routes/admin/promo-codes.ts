import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { prisma } from '@allvision/database';
import { requireAuth } from '../../middleware/auth';
import { requireAdmin } from '../../middleware/require-admin';
import { HttpError } from '../../utils/http-error';
import { normalizeCode } from '../../services/promo-code-service';

/**
 * Промокоды в админке.
 *
 * Кроме обычного CRUD здесь живёт то, ради чего коды и заводятся: сколько раз каждый
 * использовали и на какую сумму. Использование засчитывается только по фактически
 * оплаченным пополнениям, поэтому число в таблице — это покупки, а не интерес к рекламе.
 */

export const adminPromoCodesRouter = Router();

adminPromoCodesRouter.use(requireAuth, requireAdmin);

const upsertSchema = z.object({
  code: z.string().trim().min(2).max(40).regex(/^[A-Za-z0-9_-]+$/, 'Только латиница, цифры, дефис и подчёркивание'),
  description: z.string().trim().max(300).optional().nullable(),
  /** Канал, ради которого код заведён: «ролик у блогера», «инстаграм». */
  source: z.string().trim().max(120).optional().nullable(),
  discountType: z.enum(['PERCENT', 'FIXED']),
  discountValue: z.number().int().min(1),
  /** null — без ограничения по числу использований. */
  maxUses: z.number().int().min(1).max(1_000_000).optional().nullable(),
  isActive: z.boolean().optional(),
  expiresAt: z.string().datetime().optional().nullable(),
});

const patchSchema = upsertSchema.partial();

/** Процент больше 90 превращает пополнение в подарок — почти наверняка опечатка. */
function assertDiscountSane(type: string | undefined, value: number | undefined) {
  if (type === 'PERCENT' && value != null && value > 90) {
    throw new HttpError(400, 'PROMO_DISCOUNT_TOO_BIG', 'Скидка больше 90% — проверьте значение');
  }
}

function toDto(promo: {
  id: string;
  code: string;
  description: string | null;
  source: string | null;
  discountType: string;
  discountValue: number;
  maxUses: number | null;
  usedCount: number;
  isActive: boolean;
  expiresAt: Date | null;
  createdAt: Date;
}, stats?: { uses: number; discountKopecks: number; amountKopecks: number }) {
  return {
    ...promo,
    expiresAt: promo.expiresAt?.toISOString() ?? null,
    createdAt: promo.createdAt.toISOString(),
    stats: {
      uses: stats?.uses ?? promo.usedCount,
      // Копейки наружу не выносим: в отчёте нужны рубли.
      discountRub: Math.round((stats?.discountKopecks ?? 0) / 100),
      paidRub: Math.round((stats?.amountKopecks ?? 0) / 100),
    },
  };
}

adminPromoCodesRouter.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const promos = await prisma.promoCode.findMany({ orderBy: { createdAt: 'desc' } });
    const grouped = await prisma.promoCodeUse.groupBy({
      by: ['promoCodeId'],
      _count: { _all: true },
      _sum: { discountRub: true, amountRub: true },
    });
    const byId = new Map(grouped.map((row) => [row.promoCodeId, row]));

    res.json({
      promoCodes: promos.map((promo) => {
        const row = byId.get(promo.id);
        return toDto(promo, {
          uses: row?._count._all ?? 0,
          discountKopecks: row?._sum.discountRub ?? 0,
          amountKopecks: row?._sum.amountRub ?? 0,
        });
      }),
    });
  } catch (err) {
    next(err);
  }
});

/** Кто и когда воспользовался кодом: нужно, когда цифра в таблице вызывает вопросы. */
adminPromoCodesRouter.get('/:id/uses', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const uses = await prisma.promoCodeUse.findMany({
      where: { promoCodeId: req.params.id },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { user: { select: { id: true, email: true, name: true } } },
    });
    res.json({
      uses: uses.map((use) => ({
        id: use.id,
        createdAt: use.createdAt.toISOString(),
        paymentId: use.paymentId,
        discountRub: Math.round(use.discountRub / 100),
        paidRub: Math.round(use.amountRub / 100),
        user: use.user,
      })),
    });
  } catch (err) {
    next(err);
  }
});

adminPromoCodesRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = upsertSchema.parse(req.body ?? {});
    assertDiscountSane(body.discountType, body.discountValue);
    const code = normalizeCode(body.code);

    const exists = await prisma.promoCode.findUnique({ where: { code } });
    if (exists) throw new HttpError(409, 'PROMO_CODE_EXISTS', 'Такой промокод уже есть');

    const promo = await prisma.promoCode.create({
      data: {
        code,
        description: body.description ?? null,
        source: body.source ?? null,
        discountType: body.discountType,
        discountValue: body.discountValue,
        maxUses: body.maxUses ?? null,
        isActive: body.isActive ?? true,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      },
    });
    res.status(201).json({ promoCode: toDto(promo) });
  } catch (err) {
    next(err);
  }
});

adminPromoCodesRouter.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = patchSchema.parse(req.body ?? {});
    const current = await prisma.promoCode.findUnique({ where: { id: req.params.id } });
    if (!current) throw new HttpError(404, 'PROMO_CODE_NOT_FOUND', 'Промокод не найден');
    assertDiscountSane(body.discountType ?? current.discountType, body.discountValue ?? current.discountValue);

    if (body.code) {
      const code = normalizeCode(body.code);
      const clash = await prisma.promoCode.findUnique({ where: { code } });
      if (clash && clash.id !== current.id) {
        throw new HttpError(409, 'PROMO_CODE_EXISTS', 'Такой промокод уже есть');
      }
    }

    const promo = await prisma.promoCode.update({
      where: { id: current.id },
      data: {
        ...(body.code ? { code: normalizeCode(body.code) } : {}),
        ...(body.description !== undefined ? { description: body.description ?? null } : {}),
        ...(body.source !== undefined ? { source: body.source ?? null } : {}),
        ...(body.discountType ? { discountType: body.discountType } : {}),
        ...(body.discountValue !== undefined ? { discountValue: body.discountValue } : {}),
        ...(body.maxUses !== undefined ? { maxUses: body.maxUses ?? null } : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
        ...(body.expiresAt !== undefined ? { expiresAt: body.expiresAt ? new Date(body.expiresAt) : null } : {}),
      },
    });
    res.json({ promoCode: toDto(promo) });
  } catch (err) {
    next(err);
  }
});

/**
 * Удаление кода уносит и его историю (каскад).
 *
 * Поэтому отработавший код лучше выключать, а не удалять: выключенный не применяется, но
 * остаётся в отчёте. Про это же говорит подсказка в интерфейсе.
 */
adminPromoCodesRouter.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await prisma.promoCode.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch {
    throw new HttpError(404, 'PROMO_CODE_NOT_FOUND', 'Промокод не найден');
  }
});
