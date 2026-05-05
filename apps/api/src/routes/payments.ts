import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireAuth, optionalAuth } from '../middleware/auth';
import { HttpError } from '../utils/http-error';
import * as payments from '../services/payment-service';

export const paymentsRouter = Router();

const topupSchema = z.object({
  coins: z.coerce.number().int().min(1),
  amountRub: z.coerce.number().int().min(1),
});

paymentsRouter.post('/topup', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = topupSchema.parse(req.body);
    const result = await payments.createTopupPayment(req.user!.id, data);
    res.json(result);
  } catch (e) {
    next(e);
  }
});

paymentsRouter.post('/webhook', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody ?? Buffer.from(JSON.stringify(req.body));
    const signature = String(req.headers['x-payment-signature'] ?? req.body?.signature ?? '');
    await payments.handlePaymentWebhook(rawBody, signature);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

paymentsRouter.get('/:id/status', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await payments.getPaymentStatusForUser(req.user!.id, req.params.id);
    res.json(result);
  } catch (e) {
    next(e);
  }
});

paymentsRouter.get('/:id', optionalAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payment = await payments.findPaymentByIdOrProviderId(req.params.id);
    if (!payment) {
      throw new HttpError(404, 'PAYMENT_NOT_FOUND', 'Payment not found');
    }

    if (req.user && payment.userId !== req.user.id) {
      throw new HttpError(403, 'FORBIDDEN', 'Payment belongs to another user');
    }

    if (!req.user && payment.provider !== 'mock') {
      throw new HttpError(401, 'UNAUTHORIZED', 'Authentication is required');
    }

    res.json(payment);
  } catch (e) {
    next(e);
  }
});
