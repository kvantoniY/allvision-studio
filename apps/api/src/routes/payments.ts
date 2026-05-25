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

function getInvId(req: Request): string {
  const fromQuery = typeof req.query.InvId === 'string' ? req.query.InvId : '';
  if (fromQuery) return fromQuery;
  const fromBody = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>).InvId : undefined;
  return typeof fromBody === 'string' ? fromBody : '';
}

function getOutSum(req: Request): string {
  const fromQuery = typeof req.query.OutSum === 'string' ? req.query.OutSum : '';
  if (fromQuery) return fromQuery;
  const fromBody = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>).OutSum : undefined;
  return typeof fromBody === 'string' ? fromBody : '';
}

paymentsRouter.all('/robokassa/result', async (req: Request, res: Response, next: NextFunction) => {
  const invId = getInvId(req);
  const outSum = getOutSum(req);
  const rawBody = rawPaymentBody(req);
  logger.info(
    `[payments] robokassa result webhook received method=${req.method} invId=${invId || 'unknown'} outSum=${outSum || 'unknown'} bodyBytes=${rawBody.length}`,
  );
  try {
    const result = await payments.handlePaymentWebhook(rawBody, paymentSignature(req), {
      rawBodyText: rawBody.toString('utf8'),
      source: 'webhook',
    });
    logger.info(`[payments] robokassa result webhook applied invId=${result.providerPaymentId ?? invId ?? 'unknown'}`);
    res.type('text/plain').send(`OK${result.providerPaymentId ?? ''}`);
  } catch (e) {
    logger.warn(
      `[payments] robokassa result webhook failed invId=${invId || 'unknown'} bodyPreview=${rawBody.toString('utf8').slice(0, 300)}: ${(e as Error).message}`,
    );
    // Сохраняем сырое тело webhook для последующей диагностики, даже если подпись битая.
    if (invId) {
      await payments
        .recordWebhookFailure(invId, {
          source: 'webhook',
          bodyText: rawBody.toString('utf8'),
          error: (e as Error).message,
        })
        .catch((cleanupError) =>
          logger.warn(`[payments] recordWebhookFailure failed invId=${invId}: ${(cleanupError as Error).message}`),
        );
    }
    next(e);
  }
});

paymentsRouter.all('/robokassa/success', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const invId = getInvId(req);
    const outSum = getOutSum(req);
    const hasSignature = Boolean(req.query.SignatureValue || (req.body && (req.body as Record<string, unknown>).SignatureValue));
    const rawBody = rawPaymentBody(req);
    logger.info(
      `[payments] robokassa success redirect received method=${req.method} invId=${invId || 'unknown'} outSum=${outSum || 'unknown'} hasSignature=${hasSignature}`,
    );

    if (outSum && hasSignature && invId) {
      try {
        await payments.handlePaymentSuccessRedirect(rawBody, paymentSignature(req), {
          rawBodyText: rawBody.toString('utf8'),
          source: 'success-redirect',
        });
        logger.info(`[payments] robokassa success redirect applied invId=${invId}`);
      } catch (error) {
        logger.warn(`[payments] robokassa success redirect verification failed invId=${invId}: ${(error as Error).message}`);
        if (invId) {
          await payments
            .recordWebhookFailure(invId, {
              source: 'success-redirect',
              bodyText: rawBody.toString('utf8'),
              error: (error as Error).message,
            })
            .catch(() => undefined);
        }
      }
    }

    let payment = invId ? await payments.findPaymentByIdOrProviderId(invId) : null;
    if (payment && payment.status !== 'SUCCEEDED') {
      try {
        payment = await payments.reconcilePaymentWithProvider(payment, { bypassCache: true, allowRevive: true });
      } catch (error) {
        logger.warn(`[payments] robokassa success reconcile failed invId=${invId}: ${(error as Error).message}`);
      }
    }

    const finalStatus = payment?.status;
    let urlStatus: 'success' | 'failed' | 'cancelled' | 'pending';
    if (finalStatus === 'SUCCEEDED') urlStatus = 'success';
    else if (finalStatus === 'CANCELLED') urlStatus = 'cancelled';
    else if (finalStatus === 'FAILED') urlStatus = 'failed';
    else urlStatus = 'pending';

    const tokens = urlStatus === 'success' && payment?.tokensAdded ? `&tokens=${payment.tokensAdded}` : '';
    const paymentId = payment ? `&paymentId=${payment.id}` : '';

    logger.info(`[payments] robokassa success redirect resolved invId=${invId} dbStatus=${finalStatus ?? 'unknown'} urlStatus=${urlStatus}`);

    res.redirect(302, `${process.env.PUBLIC_WEB_URL ?? 'http://localhost:3000'}/profile?tab=billing&payment=${urlStatus}${tokens}${paymentId}`);
  } catch (e) {
    next(e);
  }
});

paymentsRouter.all('/robokassa/fail', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const invId = getInvId(req);
    logger.info(`[payments] robokassa fail redirect received invId=${invId || 'unknown'}`);

    let payment = invId ? await payments.findPaymentByIdOrProviderId(invId) : null;
    if (payment && payment.status !== 'SUCCEEDED') {
      try {
        payment = await payments.reconcilePaymentWithProvider(payment, { bypassCache: true, allowRevive: true });
      } catch (error) {
        logger.warn(`[payments] robokassa fail reconcile failed invId=${invId}: ${(error as Error).message}`);
      }
    }

    const finalStatus = payment?.status;
    let urlStatus: 'success' | 'failed' | 'pending';
    if (finalStatus === 'SUCCEEDED') urlStatus = 'success';
    else if (finalStatus === 'CANCELLED' || finalStatus === 'FAILED') urlStatus = 'failed';
    else urlStatus = 'pending';

    const tokens = urlStatus === 'success' && payment?.tokensAdded ? `&tokens=${payment.tokensAdded}` : '';
    const paymentId = payment ? `&paymentId=${payment.id}` : invId ? `&paymentId=${invId}` : '';
    res.redirect(
      302,
      `${process.env.PUBLIC_WEB_URL ?? 'http://localhost:3000'}/profile?tab=billing&payment=${urlStatus}${tokens}${paymentId}`,
    );
  } catch (e) {
    next(e);
  }
});

paymentsRouter.post('/webhook', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rawBody = rawPaymentBody(req);
    const result = await payments.handlePaymentWebhook(rawBody, paymentSignature(req), {
      rawBodyText: rawBody.toString('utf8'),
      source: 'webhook',
    });
    logger.info(`[payments] mock webhook applied providerPaymentId=${result.providerPaymentId ?? 'unknown'}`);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

paymentsRouter.get('/:id/status', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const force = req.query.force === '1' || req.query.force === 'true';
    const result = await payments.getPaymentStatusForUser(req.user!.id, req.params.id, { force });
    res.json(result);
  } catch (e) {
    next(e);
  }
});

paymentsRouter.post('/:id/recheck', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await payments.forceRecheckPaymentForUser(req.user!.id, req.params.id);
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
