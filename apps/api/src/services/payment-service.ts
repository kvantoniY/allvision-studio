import crypto from 'node:crypto';
import { prisma } from '@allvision/database';
import { HttpError } from '../utils/http-error';
import { getPaymentProvider } from './payment-provider';

type PaymentStatus = 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';

export type CoinTopupPayment = {
  id: string;
  userId: string;
  amountRub: number;
  coinsAdded: number;
  status: PaymentStatus;
  provider: string;
  providerPaymentId?: string;
  confirmationUrl?: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
  paidAt?: Date;
};

type PaymentListItem = Pick<CoinTopupPayment, 'id' | 'amountRub' | 'coinsAdded' | 'status'>;

const payments = new Map<string, CoinTopupPayment>();

function paymentProviderName() {
  return process.env.PAYMENT_PROVIDER ?? 'mock';
}

function providerEventToStatus(type: string): PaymentStatus {
  if (type === 'payment.succeeded') return 'SUCCEEDED';
  if (type === 'payment.failed') return 'FAILED';
  if (type === 'payment.cancelled') return 'CANCELLED';
  throw new HttpError(400, 'UNSUPPORTED_PAYMENT_EVENT', 'Unsupported payment event');
}

export async function createTopupPayment(
  userId: string,
  params: { coins: number; amountRub: number },
): Promise<{ payment: PaymentListItem; confirmationUrl: string }> {
  if (params.coins <= 0) {
    throw new HttpError(400, 'INVALID_COINS_AMOUNT', 'Coins amount must be positive');
  }
  if (params.amountRub <= 0) {
    throw new HttpError(400, 'INVALID_PAYMENT_AMOUNT', 'Payment amount must be positive');
  }

  const id = `topup_${crypto.randomUUID()}`;
  const provider = paymentProviderName();
  const metadata = {
    paymentId: id,
    coins: String(params.coins),
    amountRub: String(params.amountRub),
  };

  const providerPayment = await getPaymentProvider().createPayment({
    amountRub: params.amountRub,
    userId,
    purpose: 'topup',
    metadata,
  });

  const payment: CoinTopupPayment = {
    id,
    userId,
    amountRub: params.amountRub,
    coinsAdded: params.coins,
    status: 'PENDING',
    provider,
    providerPaymentId: providerPayment.paymentId,
    confirmationUrl: providerPayment.confirmationUrl,
    metadata,
    createdAt: new Date(),
  };

  payments.set(payment.id, payment);
  payments.set(providerPayment.paymentId, payment);

  return {
    payment: {
      id: payment.id,
      amountRub: payment.amountRub,
      coinsAdded: payment.coinsAdded,
      status: payment.status,
    },
    confirmationUrl: providerPayment.confirmationUrl,
  };
}

export async function findPaymentByIdOrProviderId(id: string): Promise<CoinTopupPayment | null> {
  return payments.get(id) ?? null;
}

export async function getPaymentForUser(userId: string, id: string): Promise<CoinTopupPayment> {
  const payment = await findPaymentByIdOrProviderId(id);
  if (!payment) {
    throw new HttpError(404, 'PAYMENT_NOT_FOUND', 'Payment not found');
  }
  if (payment.userId !== userId) {
    throw new HttpError(403, 'FORBIDDEN', 'Payment belongs to another user');
  }
  return payment;
}

export async function getPaymentStatusForUser(userId: string, id: string): Promise<{ status: PaymentStatus }> {
  const payment = await getPaymentForUser(userId, id);
  return { status: payment.status };
}

export async function handlePaymentWebhook(rawBody: Buffer, signature: string): Promise<{ ok: true }> {
  const event = await getPaymentProvider().verifyWebhook(rawBody, signature);
  const status = providerEventToStatus(event.type);
  const payment = payments.get(event.providerPaymentId) ?? payments.get(event.paymentId);

  if (!payment) {
    throw new HttpError(404, 'PAYMENT_NOT_FOUND', 'Payment not found');
  }

  if (payment.status === 'SUCCEEDED') {
    return { ok: true };
  }

  if (status !== 'SUCCEEDED') {
    payment.status = status;
    payments.set(payment.id, payment);
    if (payment.providerPaymentId) payments.set(payment.providerPaymentId, payment);
    return { ok: true };
  }

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id: payment.userId },
      data: { coinBalance: { increment: payment.coinsAdded } },
    });

    await tx.coinTransaction.create({
      data: {
        userId: payment.userId,
        amount: payment.coinsAdded,
        reason: 'topup',
        refType: 'Topup',
        refId: payment.id,
        balanceAfter: user.coinBalance,
      },
    });
  });

  payment.status = 'SUCCEEDED';
  payment.paidAt = new Date();
  payments.set(payment.id, payment);
  if (payment.providerPaymentId) payments.set(payment.providerPaymentId, payment);

  return { ok: true };
}
