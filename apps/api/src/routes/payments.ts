import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireAuth, optionalAuth } from '../middleware/auth';
import { HttpError } from '../utils/http-error';
import { logger } from '../utils/logger';
import * as payments from '../services/payment-service';

export const paymentsRouter = Router();

const topupSchema = z.object({
  tokenPackageId: z.string().min(1),
});

function paramsToRawBody(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return Buffer.from('');
  }

  const params = new URLSearchParams();
  for (const [key, rawValue] of Object.entries(value)) {
    if (Array.isArray(rawValue)) {
      rawValue.forEach((item) => params.append(key, String(item)));
      continue;
    }
    if (rawValue != null) {
      params.set(key, String(rawValue));
    }
  }

  return Buffer.from(params.toString(), 'utf8');
}

function rawPaymentBody(req: Request) {
  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
  if (rawBody && rawBody.length > 0) return rawBody;
  return paramsToRawBody(req.method === 'GET' ? req.query : req.body);
}

function paymentSignature(req: Request) {
  return String(
    req.headers['x-payment-signature'] ??
      req.body?.signature ??
      req.body?.SignatureValue ??
      req.query?.SignatureValue ??
      '',
  );
}

paymentsRouter.post('/topup', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = topupSchema.parse(req.body);
    const result = await payments.createTopupPayment(req.user!.id, data.tokenPackageId);
    res.json(result);
  } catch (e) {
    next(e);
  }
});

paymentsRouter.post('/order/:orderId', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await payments.createOrderPayment(req.user!.id, req.params.orderId);
    res.json(result);
  } catch (e) {
    next(e);
  }
});

paymentsRouter.all('/robokassa/result', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await payments.handlePaymentWebhook(rawPaymentBody(req), paymentSignature(req));
    res.type('text/plain').send(`OK${result.providerPaymentId ?? ''}`);
  } catch (e) {
    next(e);
  }
});

paymentsRouter.all('/robokassa/success', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const invId = typeof req.query.InvId === 'string' ? req.query.InvId : '';
    if (req.query.OutSum && req.query.SignatureValue && invId) {
      try {
        await payments.handlePaymentSuccessRedirect(rawPaymentBody(req), paymentSignature(req));
      } catch (error) {
        logger.warn(`[payments] Robokassa success fallback rejected for InvId=${invId}: ${(error as Error).message}`);
      }
    }
    let payment = invId ? await payments.findPaymentByIdOrProviderId(invId) : null;
    if (payment?.status === 'PENDING') {
      payment = await payments.reconcilePaymentWithProvider(payment);
    }
    const status = payment?.status === 'SUCCEEDED' ? 'success' : 'pending';
    const tokens = status === 'success' && payment?.tokensAdded ? `&tokens=${payment.tokensAdded}` : '';
    const paymentId = payment ? `&paymentId=${payment.id}` : '';
    res.redirect(302, `${process.env.PUBLIC_WEB_URL ?? 'http://localhost:3000'}/profile?tab=billing&payment=${status}${tokens}${paymentId}`);
  } catch (e) {
    next(e);
  }
});

paymentsRouter.all('/robokassa/fail', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.redirect(302, `${process.env.PUBLIC_WEB_URL ?? 'http://localhost:3000'}/profile?tab=billing&payment=failed`);
  } catch (e) {
    next(e);
  }
});

paymentsRouter.post('/webhook', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await payments.handlePaymentWebhook(rawPaymentBody(req), paymentSignature(req));
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
