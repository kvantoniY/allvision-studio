import { prisma } from '@allvision/database';
import type { Payment } from '@allvision/database';
import type { WebhookEvent } from '@allvision/shared';
import crypto from 'node:crypto';
import { HttpError } from '../utils/http-error';
import { getPaymentProvider } from './payment-provider';
import { logger } from '../utils/logger';

type PaymentListItem = Pick<Payment, 'id' | 'amountRub' | 'tokensAdded'>;
type WebhookHandleResult = { ok: true; providerPaymentId?: string };
type PaymentCreateResult = {
  payment: PaymentListItem;
  confirmationUrl: string;
  confirmationMethod?: 'GET' | 'POST';
  confirmationParams?: Record<string, string>;
};

type ProviderStatus = 'pending' | 'succeeded' | 'failed' | 'cancelled';

function paymentProviderName() {
  return process.env.PAYMENT_PROVIDER ?? 'mock';
}

function providerEventToStatus(type: string) {
  if (type === 'payment.succeeded') return 'SUCCEEDED';
  if (type === 'payment.failed') return 'FAILED';
  if (type === 'payment.cancelled') return 'CANCELLED';
  throw new HttpError(400, 'UNSUPPORTED_PAYMENT_EVENT', 'Unsupported payment event');
}

function buildConfirmationMetadata(
  metadata: Record<string, unknown>,
  confirmation: {
    confirmationUrl: string;
    confirmationMethod?: 'GET' | 'POST';
    confirmationParams?: Record<string, string>;
  },
) {
  return {
    ...metadata,
    confirmationUrl: confirmation.confirmationUrl,
    ...(confirmation.confirmationMethod ? { confirmationMethod: confirmation.confirmationMethod } : {}),
    ...(confirmation.confirmationParams ? { confirmationParams: confirmation.confirmationParams } : {}),
  };
}

const providerStatusCache = new Map<string, { status: ProviderStatus; checkedAt: number }>();

function positiveIntEnv(name: string, fallback: number) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function providerStatusCacheMs() {
  return positiveIntEnv('PAYMENT_PROVIDER_STATUS_CACHE_MS', 5000);
}

function providerStatusCacheMaxEntries() {
  return positiveIntEnv('PAYMENT_PROVIDER_STATUS_CACHE_MAX', 500);
}

function pruneProviderStatusCache() {
  const ttl = providerStatusCacheMs();
  const now = Date.now();
  for (const [key, value] of providerStatusCache) {
    if (now - value.checkedAt >= ttl) {
      providerStatusCache.delete(key);
    }
  }
  const maxEntries = providerStatusCacheMaxEntries();
  if (providerStatusCache.size > maxEntries) {
    const sorted = [...providerStatusCache.entries()].sort((a, b) => a[1].checkedAt - b[1].checkedAt);
    const toRemove = providerStatusCache.size - maxEntries;
    for (let i = 0; i < toRemove; i += 1) {
      providerStatusCache.delete(sorted[i][0]);
    }
  }
}

function providerStatusToEventType(status: 'succeeded' | 'failed' | 'cancelled'): WebhookEvent['type'] {
  if (status === 'succeeded') return 'payment.succeeded';
  if (status === 'failed') return 'payment.failed';
  return 'payment.cancelled';
}

async function readProviderStatus(payment: Payment, options?: { bypassCache?: boolean }): Promise<ProviderStatus> {
  if (!payment.providerPaymentId) return 'pending';
  if (payment.provider !== paymentProviderName()) return 'pending';

  const cacheKey = `${payment.provider}:${payment.providerPaymentId}`;
  const now = Date.now();

  if (!options?.bypassCache) {
    const cached = providerStatusCache.get(cacheKey);
    if (cached && now - cached.checkedAt < providerStatusCacheMs()) {
      return cached.status;
    }
  }

  const status = (await getPaymentProvider().getPaymentProviderStatus(payment.providerPaymentId)) as ProviderStatus;
  providerStatusCache.set(cacheKey, { status, checkedAt: now });
  pruneProviderStatusCache();
  return status;
}

type ReconcileOptions = { bypassCache?: boolean; allowRevive?: boolean };

export async function reconcilePaymentWithProvider(payment: Payment, options?: ReconcileOptions): Promise<Payment> {
  if (!payment.providerPaymentId) return payment;

  const allowRevive = options?.allowRevive ?? false;
  const canReconcile =
    payment.status === 'PENDING' || (allowRevive && (payment.status === 'CANCELLED' || payment.status === 'FAILED'));
  if (!canReconcile) return payment;

  let providerStatus: ProviderStatus;
  try {
    providerStatus = await readProviderStatus(payment, { bypassCache: options?.bypassCache });
  } catch (error) {
    logger.warn(
      `[payments] provider status sync failed paymentId=${payment.id} provider=${payment.provider} providerPaymentId=${payment.providerPaymentId}: ${(error as Error).message}`,
    );
    return payment;
  }

  if (providerStatus === 'pending') return payment;

  if (payment.status !== 'PENDING' && providerStatus !== 'succeeded') {
    return payment;
  }

  logger.info(
    `[payments] reconcile applying event paymentId=${payment.id} dbStatus=${payment.status} providerStatus=${providerStatus}`,
  );

  await applyPaymentEvent({
    type: providerStatusToEventType(providerStatus),
    paymentId: payment.id,
    providerPaymentId: payment.providerPaymentId,
    amountRub: payment.amountRub,
    metadata: { source: 'reconciliation' },
  });

  return (await prisma.payment.findUnique({ where: { id: payment.id } })) ?? payment;
}

export async function reconcilePaymentList(items: Payment[], options?: ReconcileOptions) {
  const results: Payment[] = [];
  for (const payment of items) {
    results.push(await reconcilePaymentWithProvider(payment, options));
  }
  return results;
}

async function createProviderPaymentId(provider: string) {
  if (provider !== 'robokassa') return undefined;

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidate = String(crypto.randomInt(1, 2_147_483_648));
    const existing = await prisma.payment.findFirst({
      where: { provider, providerPaymentId: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
  }

  throw new HttpError(500, 'PAYMENT_ID_GENERATION_FAILED', 'Could not generate payment id');
}

async function getUserEmail(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  return user?.email;
}

export async function createTopupPayment(
  userId: string,
  tokenPackageId: string,
): Promise<PaymentCreateResult> {
  const pkg = await prisma.tokenPackage.findUnique({ where: { id: tokenPackageId } });
  if (!pkg) {
    throw new HttpError(404, 'TOKEN_PACKAGE_NOT_FOUND', 'Token package not found');
  }
  if (!pkg.isActive) {
    throw new HttpError(400, 'TOKEN_PACKAGE_INACTIVE', 'Token package is inactive');
  }

  const customerEmail = await getUserEmail(userId);
  const tokensAdded = pkg.tokens + pkg.bonus;
  const provider = paymentProviderName();
  const metadata = {
    tokenPackageId: pkg.id,
    packageTitle: pkg.title,
    baseTokens: pkg.tokens,
    bonusTokens: pkg.bonus,
  };

  const payment = await prisma.payment.create({
    data: {
      userId,
      amountRub: pkg.priceRub * 100,
      tokensAdded,
      status: 'PENDING',
      provider,
      purpose: 'TOPUP',
      metadata,
    },
  });

  logger.info(
    `[payments] created topup payment id=${payment.id} userId=${userId} amountRub=${payment.amountRub} tokensAdded=${tokensAdded} provider=${provider}`,
  );

  try {
    const providerPaymentId = await createProviderPaymentId(provider);
    const providerPayment = await getPaymentProvider().createPayment({
      amountRub: payment.amountRub,
      userId,
      purpose: 'topup',
      providerPaymentId,
      metadata: {
        paymentId: payment.id,
        tokenPackageId: pkg.id,
        packageTitle: pkg.title,
        baseTokens: String(pkg.tokens),
        bonusTokens: String(pkg.bonus),
        ...(customerEmail ? { customerEmail } : {}),
      },
    });

    const updated = await prisma.payment.update({
      where: { id: payment.id },
      data: {
        providerPaymentId: providerPayment.paymentId,
        metadata: buildConfirmationMetadata(metadata, providerPayment),
      },
    });

    logger.info(
      `[payments] topup payment confirmed id=${updated.id} providerPaymentId=${updated.providerPaymentId}`,
    );

    return {
      payment: {
        id: updated.id,
        amountRub: updated.amountRub,
        tokensAdded: updated.tokensAdded,
      },
      confirmationUrl: providerPayment.confirmationUrl,
      confirmationMethod: providerPayment.confirmationMethod,
      confirmationParams: providerPayment.confirmationParams,
    };
  } catch (error) {
    logger.error(
      `[payments] failed to register topup payment with provider id=${payment.id}: ${(error as Error).message}`,
    );
    await prisma.payment
      .updateMany({
        where: { id: payment.id, status: 'PENDING' },
        data: { status: 'FAILED' },
      })
      .catch((cleanupError) => {
        logger.warn(`[payments] failed to mark payment FAILED after provider error id=${payment.id}: ${(cleanupError as Error).message}`);
      });
    throw error;
  }
}

export async function createOrderPayment(
  userId: string,
  orderId: string,
): Promise<PaymentCreateResult> {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) {
    throw new HttpError(404, 'ORDER_NOT_FOUND', 'Order not found');
  }
  if (order.userId !== userId) {
    throw new HttpError(403, 'FORBIDDEN', 'Payment belongs to another user');
  }
  if (order.status !== 'PRICE_SET') {
    throw new HttpError(400, 'ORDER_PRICE_NOT_SET', 'Order is not ready for payment');
  }
  if (order.priceRub == null) {
    throw new HttpError(400, 'ORDER_PRICE_MISSING', 'Order price is missing');
  }
  if (order.paymentId) {
    throw new HttpError(400, 'ORDER_PAYMENT_EXISTS', 'Order already has a payment');
  }

  const metadata = {
    orderId: order.id,
    orderType: order.type,
  };
  const customerEmail = await getUserEmail(userId);
  const provider = paymentProviderName();

  const payment = await prisma.payment.create({
    data: {
      userId,
      amountRub: order.priceRub * 100,
      tokensAdded: null,
      status: 'PENDING',
      provider,
      purpose: 'ORDER',
      metadata,
    },
  });

  try {
    const providerPaymentId = await createProviderPaymentId(provider);
    const providerPayment = await getPaymentProvider().createPayment({
      amountRub: payment.amountRub,
      userId,
      purpose: 'order',
      providerPaymentId,
      metadata: {
        paymentId: payment.id,
        orderId: order.id,
        orderType: order.type,
        ...(customerEmail ? { customerEmail } : {}),
      },
    });

    const updated = await prisma.payment.update({
      where: { id: payment.id },
      data: {
        providerPaymentId: providerPayment.paymentId,
        metadata: buildConfirmationMetadata(metadata, providerPayment),
      },
    });

    await prisma.order.update({
      where: { id: order.id },
      data: { paymentId: updated.id },
    });

    logger.info(
      `[payments] order payment confirmed id=${updated.id} orderId=${order.id} providerPaymentId=${updated.providerPaymentId}`,
    );

    return {
      payment: {
        id: updated.id,
        amountRub: updated.amountRub,
        tokensAdded: updated.tokensAdded,
      },
      confirmationUrl: providerPayment.confirmationUrl,
      confirmationMethod: providerPayment.confirmationMethod,
      confirmationParams: providerPayment.confirmationParams,
    };
  } catch (error) {
    logger.error(
      `[payments] failed to register order payment with provider id=${payment.id}: ${(error as Error).message}`,
    );
    await prisma.payment
      .updateMany({
        where: { id: payment.id, status: 'PENDING' },
        data: { status: 'FAILED' },
      })
      .catch((cleanupError) => {
        logger.warn(`[payments] failed to mark order payment FAILED after provider error id=${payment.id}: ${(cleanupError as Error).message}`);
      });
    throw error;
  }
}

export async function findPaymentByIdOrProviderId(id: string): Promise<Payment | null> {
  return prisma.payment.findFirst({
    where: {
      OR: [{ id }, { providerPaymentId: id }],
    },
  });
}

export async function getPaymentForUser(userId: string, id: string): Promise<Payment> {
  const payment = await findPaymentByIdOrProviderId(id);
  if (!payment) {
    throw new HttpError(404, 'PAYMENT_NOT_FOUND', 'Payment not found');
  }
  if (payment.userId !== userId) {
    throw new HttpError(403, 'FORBIDDEN', 'Payment belongs to another user');
  }
  return payment;
}

export async function getPaymentStatusForUser(
  userId: string,
  id: string,
): Promise<{ status: Payment['status']; tokensAdded: number | null }> {
  const initial = await getPaymentForUser(userId, id);
  const payment = await reconcilePaymentWithProvider(initial, { bypassCache: true });
  return { status: payment.status, tokensAdded: payment.tokensAdded };
}

export async function handlePaymentWebhook(rawBody: Buffer, signature: string): Promise<WebhookHandleResult> {
  const event = await getPaymentProvider().verifyWebhook(rawBody, signature);
  logger.info(
    `[payments] webhook verified type=${event.type} providerPaymentId=${event.providerPaymentId} paymentId=${event.paymentId ?? 'none'}`,
  );
  return applyPaymentEvent(event);
}

export async function handlePaymentSuccessRedirect(rawBody: Buffer, signature: string): Promise<WebhookHandleResult> {
  const provider = getPaymentProvider();
  if (!provider.verifySuccessRedirect) {
    throw new HttpError(400, 'PAYMENT_SUCCESS_REDIRECT_UNSUPPORTED', 'Payment provider does not support success redirect verification');
  }
  const event = await provider.verifySuccessRedirect(rawBody, signature);
  logger.info(
    `[payments] success redirect verified type=${event.type} providerPaymentId=${event.providerPaymentId} paymentId=${event.paymentId ?? 'none'}`,
  );
  return applyPaymentEvent(event);
}

const PAYMENT_LOCK_NAMESPACE = 'allvision:payment:';

function advisoryLockKey(paymentId: string): bigint {
  const hash = crypto.createHash('sha256').update(`${PAYMENT_LOCK_NAMESPACE}${paymentId}`).digest();
  const high = hash.readBigInt64BE(0);
  const mask = (1n << 63n) - 1n;
  return high & mask;
}

async function withPaymentLock<T>(paymentId: string, fn: () => Promise<T>): Promise<T> {
  const key = advisoryLockKey(paymentId);
  let acquired = false;
  try {
    await prisma.$executeRawUnsafe(`SELECT pg_advisory_lock(${key.toString()}::bigint)`);
    acquired = true;
  } catch (error) {
    logger.warn(`[payments] advisory lock acquire failed paymentId=${paymentId}: ${(error as Error).message}`);
  }
  try {
    return await fn();
  } finally {
    if (acquired) {
      await prisma
        .$executeRawUnsafe(`SELECT pg_advisory_unlock(${key.toString()}::bigint)`)
        .catch((error) => {
          logger.warn(`[payments] advisory unlock failed paymentId=${paymentId}: ${(error as Error).message}`);
        });
    }
  }
}

async function applyPaymentEvent(event: WebhookEvent): Promise<WebhookHandleResult> {
  const status = providerEventToStatus(event.type);

  const paymentByInternalId = event.paymentId
    ? await prisma.payment.findUnique({ where: { id: event.paymentId } })
    : null;
  const initial = paymentByInternalId ?? await prisma.payment.findFirst({
    where: { providerPaymentId: event.providerPaymentId },
  });

  if (!initial) {
    logger.warn(
      `[payments] applyPaymentEvent: payment not found type=${event.type} providerPaymentId=${event.providerPaymentId} paymentId=${event.paymentId ?? 'none'}`,
    );
    throw new HttpError(404, 'PAYMENT_NOT_FOUND', 'Payment not found');
  }

  if (initial.providerPaymentId && initial.providerPaymentId !== event.providerPaymentId) {
    logger.warn(
      `[payments] applyPaymentEvent: provider id mismatch paymentId=${initial.id} dbProviderId=${initial.providerPaymentId} eventProviderId=${event.providerPaymentId}`,
    );
    throw new HttpError(400, 'PAYMENT_PROVIDER_ID_MISMATCH', 'Payment provider id does not match');
  }

  if (event.amountRub > 0 && event.amountRub !== initial.amountRub) {
    logger.warn(
      `[payments] applyPaymentEvent: amount mismatch paymentId=${initial.id} dbAmount=${initial.amountRub} eventAmount=${event.amountRub}`,
    );
    throw new HttpError(400, 'PAYMENT_AMOUNT_MISMATCH', 'Payment amount does not match');
  }

  return withPaymentLock(initial.id, async () => {
    const payment = await prisma.payment.findUnique({ where: { id: initial.id } });
    if (!payment) {
      throw new HttpError(404, 'PAYMENT_NOT_FOUND', 'Payment not found');
    }

    if (payment.status === 'SUCCEEDED') {
      logger.info(
        `[payments] applyPaymentEvent: payment already succeeded (idempotent skip) paymentId=${payment.id} eventType=${event.type}`,
      );
      return { ok: true, providerPaymentId: event.providerPaymentId };
    }

    if (status !== 'SUCCEEDED') {
      const result = await prisma.payment.updateMany({
        where: { id: payment.id, status: { not: 'SUCCEEDED' } },
        data: { status },
      });
      logger.info(
        `[payments] applyPaymentEvent: marked non-success paymentId=${payment.id} from=${payment.status} to=${status} matched=${result.count}`,
      );
      return { ok: true, providerPaymentId: event.providerPaymentId };
    }

    let creditedTokens: number | null = null;

    await prisma.$transaction(async (tx) => {
      const claim = await tx.payment.updateMany({
        where: { id: payment.id, status: { not: 'SUCCEEDED' } },
        data: {
          status: 'SUCCEEDED',
          paidAt: new Date(),
        },
      });
      if (claim.count === 0) {
        logger.info(
          `[payments] applyPaymentEvent: payment already succeeded in transaction (race) paymentId=${payment.id}`,
        );
        return;
      }

      if (payment.purpose === 'TOPUP') {
        const tokensAdded = payment.tokensAdded ?? 0;
        const user = await tx.user.update({
          where: { id: payment.userId },
          data: {
            tokenBalance: {
              increment: tokensAdded,
            },
          },
        });

        await tx.tokenTransaction.create({
          data: {
            userId: payment.userId,
            amount: tokensAdded,
            reason: 'topup',
            refId: payment.id,
            balanceAfter: user.tokenBalance,
          },
        });

        creditedTokens = tokensAdded;
        return;
      }

      await tx.order.updateMany({
        where: { paymentId: payment.id },
        data: { status: 'PAID' },
      });
    });

    if (creditedTokens != null) {
      logger.info(
        `[payments] applyPaymentEvent: credited tokens paymentId=${payment.id} userId=${payment.userId} tokens=${creditedTokens}`,
      );
    } else if (payment.purpose === 'ORDER') {
      logger.info(`[payments] applyPaymentEvent: order marked paid paymentId=${payment.id}`);
    }

    providerStatusCache.delete(`${payment.provider}:${payment.providerPaymentId}`);

    return { ok: true, providerPaymentId: event.providerPaymentId };
  });
}

export async function pollPendingPaymentsOnce(params?: { batchSize?: number; maxAgeMs?: number }) {
  const provider = paymentProviderName();
  const batchSize = params?.batchSize ?? positiveIntEnv('PAYMENT_PENDING_POLL_BATCH_SIZE', 20);
  const maxAgeMs = params?.maxAgeMs ?? positiveIntEnv('PAYMENT_PENDING_POLL_MAX_AGE_MS', 7 * 24 * 60 * 60 * 1000);
  const reviveAgeMs = positiveIntEnv('PAYMENT_REVIVE_MAX_AGE_MS', 60 * 60 * 1000);
  const createdAfter = new Date(Date.now() - maxAgeMs);
  const reviveAfter = new Date(Date.now() - reviveAgeMs);

  const pendingPayments = await prisma.payment.findMany({
    where: {
      provider,
      status: 'PENDING',
      providerPaymentId: { not: null },
      createdAt: { gte: createdAfter },
    },
    orderBy: { createdAt: 'asc' },
    take: batchSize,
  });

  const revivablePayments = await prisma.payment.findMany({
    where: {
      provider,
      status: { in: ['CANCELLED', 'FAILED'] },
      providerPaymentId: { not: null },
      createdAt: { gte: reviveAfter },
      paidAt: null,
    },
    orderBy: { createdAt: 'asc' },
    take: Math.max(1, Math.floor(batchSize / 2)),
  });

  if (pendingPayments.length > 0) {
    await reconcilePaymentList(pendingPayments);
  }
  if (revivablePayments.length > 0) {
    await reconcilePaymentList(revivablePayments, { allowRevive: true, bypassCache: true });
  }

  return { checked: pendingPayments.length, revived: revivablePayments.length };
}

export const _testHelpers = {
  clearProviderStatusCache() {
    providerStatusCache.clear();
  },
};
