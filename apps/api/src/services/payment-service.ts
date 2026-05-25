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

const providerStatusCache = new Map<string, { status: 'pending' | 'succeeded' | 'failed' | 'cancelled'; checkedAt: number }>();

function positiveIntEnv(name: string, fallback: number) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function providerStatusCacheMs() {
  return positiveIntEnv('PAYMENT_PROVIDER_STATUS_CACHE_MS', 15000);
}

function providerStatusToEventType(status: 'succeeded' | 'failed' | 'cancelled'): WebhookEvent['type'] {
  if (status === 'succeeded') return 'payment.succeeded';
  if (status === 'failed') return 'payment.failed';
  return 'payment.cancelled';
}

async function readProviderStatus(payment: Payment) {
  if (!payment.providerPaymentId) return 'pending' as const;
  if (payment.provider !== paymentProviderName()) return 'pending' as const;

  const now = Date.now();
  const cacheKey = `${payment.provider}:${payment.providerPaymentId}`;
  const cached = providerStatusCache.get(cacheKey);
  if (cached && now - cached.checkedAt < providerStatusCacheMs()) {
    return cached.status;
  }

  const status = await getPaymentProvider().getPaymentProviderStatus(payment.providerPaymentId);
  providerStatusCache.set(cacheKey, { status, checkedAt: now });
  return status;
}

export async function reconcilePaymentWithProvider(payment: Payment): Promise<Payment> {
  if (payment.status !== 'PENDING' || !payment.providerPaymentId) return payment;

  let providerStatus: Awaited<ReturnType<typeof readProviderStatus>>;
  try {
    providerStatus = await readProviderStatus(payment);
  } catch (error) {
    logger.warn(
      `[payments] provider status sync failed paymentId=${payment.id} provider=${payment.provider} providerPaymentId=${payment.providerPaymentId}: ${(error as Error).message}`,
    );
    return payment;
  }

  if (providerStatus === 'pending') return payment;

  await applyPaymentEvent({
    type: providerStatusToEventType(providerStatus),
    paymentId: payment.id,
    providerPaymentId: payment.providerPaymentId,
    amountRub: payment.amountRub,
    metadata: {},
  });

  return (await prisma.payment.findUnique({ where: { id: payment.id } })) ?? payment;
}

export async function reconcilePaymentList(items: Payment[]) {
  return Promise.all(items.map((payment) => reconcilePaymentWithProvider(payment)));
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

export async function getPaymentStatusForUser(userId: string, id: string): Promise<{ status: Payment['status'] }> {
  const payment = await reconcilePaymentWithProvider(await getPaymentForUser(userId, id));
  return { status: payment.status };
}

export async function handlePaymentWebhook(rawBody: Buffer, signature: string): Promise<WebhookHandleResult> {
  const event = await getPaymentProvider().verifyWebhook(rawBody, signature);
  return applyPaymentEvent(event);
}

export async function handlePaymentSuccessRedirect(rawBody: Buffer, signature: string): Promise<WebhookHandleResult> {
  const provider = getPaymentProvider();
  if (!provider.verifySuccessRedirect) {
    throw new HttpError(400, 'PAYMENT_SUCCESS_REDIRECT_UNSUPPORTED', 'Payment provider does not support success redirect verification');
  }
  const event = await provider.verifySuccessRedirect(rawBody, signature);
  return applyPaymentEvent(event);
}

async function applyPaymentEvent(event: WebhookEvent): Promise<WebhookHandleResult> {
  const status = providerEventToStatus(event.type);
  const paymentByInternalId = event.paymentId
    ? await prisma.payment.findUnique({ where: { id: event.paymentId } })
    : null;
  const payment = paymentByInternalId ?? await prisma.payment.findFirst({
    where: { providerPaymentId: event.providerPaymentId },
  });

  if (!payment) {
    throw new HttpError(404, 'PAYMENT_NOT_FOUND', 'Payment not found');
  }

  if (payment.providerPaymentId && payment.providerPaymentId !== event.providerPaymentId) {
    throw new HttpError(400, 'PAYMENT_PROVIDER_ID_MISMATCH', 'Payment provider id does not match');
  }

  if (event.amountRub > 0 && event.amountRub !== payment.amountRub) {
    throw new HttpError(400, 'PAYMENT_AMOUNT_MISMATCH', 'Payment amount does not match');
  }

  if (payment.status === 'SUCCEEDED') {
    return { ok: true, providerPaymentId: event.providerPaymentId };
  }

  if (status !== 'SUCCEEDED') {
    await prisma.payment.updateMany({
      where: { id: payment.id, status: { not: 'SUCCEEDED' } },
      data: { status },
    });
    return { ok: true, providerPaymentId: event.providerPaymentId };
  }

  await prisma.$transaction(async (tx) => {
    const claim = await tx.payment.updateMany({
      where: { id: payment.id, status: { not: 'SUCCEEDED' } },
      data: {
        status: 'SUCCEEDED',
        paidAt: new Date(),
      },
    });
    if (claim.count === 0) {
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
      return;
    }

    await tx.order.updateMany({
      where: { paymentId: payment.id },
      data: { status: 'PAID' },
    });
  });

  return { ok: true, providerPaymentId: event.providerPaymentId };
}

export async function pollPendingPaymentsOnce(params?: { batchSize?: number; maxAgeMs?: number }) {
  const provider = paymentProviderName();
  const batchSize = params?.batchSize ?? positiveIntEnv('PAYMENT_PENDING_POLL_BATCH_SIZE', 20);
  const maxAgeMs = params?.maxAgeMs ?? positiveIntEnv('PAYMENT_PENDING_POLL_MAX_AGE_MS', 7 * 24 * 60 * 60 * 1000);
  const createdAfter = new Date(Date.now() - maxAgeMs);

  const payments = await prisma.payment.findMany({
    where: {
      provider,
      status: 'PENDING',
      providerPaymentId: { not: null },
      createdAt: { gte: createdAfter },
    },
    orderBy: { createdAt: 'asc' },
    take: batchSize,
  });

  if (payments.length === 0) return { checked: 0 };

  await reconcilePaymentList(payments);
  return { checked: payments.length };
}
