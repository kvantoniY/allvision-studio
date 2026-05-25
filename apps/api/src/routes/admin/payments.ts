import { Router, type NextFunction, type Request, type Response } from 'express';
import { Prisma, prisma } from '@allvision/database';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';
import { requireAdmin } from '../../middleware/require-admin';
import { HttpError } from '../../utils/http-error';
import * as payments from '../../services/payment-service';

export const adminPaymentsRouter = Router();

adminPaymentsRouter.use(requireAuth, requireAdmin);

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  status: z.enum(['PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED']).optional(),
  search: z.string().trim().min(1).optional(),
});

adminPaymentsRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = listQuerySchema.parse(req.query);
    const where: Prisma.PaymentWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { id: { contains: query.search } },
              { providerPaymentId: { contains: query.search } },
              { user: { email: { contains: query.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [items, total] = await prisma.$transaction([
      prisma.payment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: {
          id: true,
          createdAt: true,
          paidAt: true,
          amountRub: true,
          tokensAdded: true,
          status: true,
          provider: true,
          providerPaymentId: true,
          purpose: true,
          user: { select: { id: true, email: true } },
        },
      }),
      prisma.payment.count({ where }),
    ]);

    res.json({ items, total, page: query.page, limit: query.limit });
  } catch (err) {
    next(err);
  }
});

adminPaymentsRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payment = await prisma.payment.findUnique({
      where: { id: req.params.id },
      include: { user: { select: { id: true, email: true, tokenBalance: true } } },
    });
    if (!payment) throw new HttpError(404, 'PAYMENT_NOT_FOUND', 'Payment not found');

    const tokenTx = await prisma.tokenTransaction.findFirst({
      where: { refId: payment.id, reason: 'topup' },
      select: { id: true, amount: true, balanceAfter: true, createdAt: true },
    });

    res.json({ payment, tokenTransaction: tokenTx });
  } catch (err) {
    next(err);
  }
});

adminPaymentsRouter.post('/:id/recheck', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payment = await prisma.payment.findUnique({ where: { id: req.params.id } });
    if (!payment) throw new HttpError(404, 'PAYMENT_NOT_FOUND', 'Payment not found');

    const reconciled = await payments.reconcilePaymentWithProvider(payment, {
      bypassCache: true,
      allowRevive: true,
    });
    res.json({ status: reconciled.status, tokensAdded: reconciled.tokensAdded });
  } catch (err) {
    next(err);
  }
});

adminPaymentsRouter.post('/:id/confirm', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payment = await payments.manualConfirmPayment(req.params.id, req.user!.id);
    res.json({ status: payment.status, tokensAdded: payment.tokensAdded });
  } catch (err) {
    next(err);
  }
});

adminPaymentsRouter.post('/:id/mark-failed', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payment = await payments.manualMarkPaymentFailed(req.params.id, req.user!.id);
    res.json({ status: payment.status });
  } catch (err) {
    next(err);
  }
});
