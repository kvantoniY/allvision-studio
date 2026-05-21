import { prisma } from '@allvision/database';
import type { Payment } from '@allvision/database';
import { HttpError } from '../utils/http-error';
import { getPaymentProvider } from './payment-provider';

type PaymentListItem = Pick<Payment, 'id' | 'amountRub' | 'tokensAdded'>;
type WebhookHandleResult = { ok: true; providerPaymentId?: string };

function paymentProviderName() {
  return process.env.PAYMENT_PROVIDER ?? 'mock';
}

function providerEventToStatus(type: string) {
  if (type === 'payment.succeeded') return 'SUCCEEDED';
  if (type === 'payment.failed') return 'FAILED';
  if (type === 'payment.cancelled') return 'CANCELLED';
  throw new HttpError(400, 'UNSUPPORTED_PAYMENT_EVENT', 'Unsupported payment event');
}

function buildConfirmationMetadata(metadata: Record<string, unknown>, confirmationUrl: string) {
  return {
    ...metadata,
    confirmationUrl,
  };
}

async function getUserEmail(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  return user?.email;
}

export async function createTopupPayment(
  userId: string,
  tokenPackageId: string,
): Promise<{ payment: PaymentListItem; confirmationUrl: string }> {
  const pkg = await prisma.tokenPackage.findUnique({ where: { id: tokenPackageId } });
  if (!pkg) {
    throw new HttpError(404, 'TOKEN_PACKAGE_NOT_FOUND', 'Token package not found');
  }
  if (!pkg.isActive) {
    throw new HttpError(400, 'TOKEN_PACKAGE_INACTIVE', 'Token package is inactive');
  }

  const customerEmail = await getUserEmail(userId);
  const tokensAdded = pkg.tokens + pkg.bonus;
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
      provider: paymentProviderName(),
      purpose: 'TOPUP',
      metadata,
    },
  });

  const providerPayment = await getPaymentProvider().createPayment({
    amountRub: payment.amountRub,
    userId,
    purpose: 'topup',
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
      metadata: buildConfirmationMetadata(metadata, providerPayment.confirmationUrl),
    },
  });

  return {
    payment: {
      id: updated.id,
      amountRub: updated.amountRub,
      tokensAdded: updated.tokensAdded,
    },
    confirmationUrl: providerPayment.confirmationUrl,
  };
}

export async function createOrderPayment(
  userId: string,
  orderId: string,
): Promise<{ payment: PaymentListItem; confirmationUrl: string }> {
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

  const payment = await prisma.payment.create({
    data: {
      userId,
      amountRub: order.priceRub * 100,
      tokensAdded: null,
      status: 'PENDING',
      provider: paymentProviderName(),
      purpose: 'ORDER',
      metadata,
    },
  });

  const providerPayment = await getPaymentProvider().createPayment({
    amountRub: payment.amountRub,
    userId,
    purpose: 'order',
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
      metadata: buildConfirmationMetadata(metadata, providerPayment.confirmationUrl),
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
  const payment = await getPaymentForUser(userId, id);
  return { status: payment.status };
}

export async function handlePaymentWebhook(rawBody: Buffer, signature: string): Promise<WebhookHandleResult> {
  const event = await getPaymentProvider().verifyWebhook(rawBody, signature);
  const status = providerEventToStatus(event.type);
  const payment = await prisma.payment.findFirst({
    where: { providerPaymentId: event.providerPaymentId },
  });

  if (!payment) {
    throw new HttpError(404, 'PAYMENT_NOT_FOUND', 'Payment not found');
  }

  if (event.amountRub > 0 && event.amountRub !== payment.amountRub) {
    throw new HttpError(400, 'PAYMENT_AMOUNT_MISMATCH', 'Payment amount does not match');
  }

  if (payment.status === 'SUCCEEDED') {
    return { ok: true, providerPaymentId: event.providerPaymentId };
  }

  if (status !== 'SUCCEEDED') {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status },
    });
    return { ok: true, providerPaymentId: event.providerPaymentId };
  }

  await prisma.$transaction(async (tx) => {
    const currentPayment = await tx.payment.findUnique({ where: { id: payment.id } });
    if (!currentPayment || currentPayment.status === 'SUCCEEDED') {
      return;
    }

    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: 'SUCCEEDED',
        paidAt: new Date(),
      },
    });

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
