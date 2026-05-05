import crypto from 'node:crypto';
import { z } from 'zod';
import type { PaymentProvider, PaymentProviderStatus, WebhookEvent } from '@allvision/shared';
import { HttpError } from '../utils/http-error';

const webhookSchema = z.object({
  paymentId: z.string().min(1),
  event: z.enum(['succeeded', 'failed', 'canceled', 'cancelled']),
});

const eventToType = {
  succeeded: 'payment.succeeded',
  failed: 'payment.failed',
  canceled: 'payment.cancelled',
  cancelled: 'payment.cancelled',
} as const;

export class MockPaymentProvider implements PaymentProvider {
  async createPayment(params: {
    amountRub: number;
    userId: string;
    purpose: 'topup';
    metadata: Record<string, string>;
  }): Promise<{ paymentId: string; confirmationUrl: string }> {
    const paymentId = params.metadata.paymentId ?? `mock_${crypto.randomUUID()}`;
    const webUrl = process.env.PUBLIC_WEB_URL ?? 'http://localhost:3000';

    return {
      paymentId,
      confirmationUrl: `${webUrl}/mock-payment/${paymentId}`,
    };
  }

  async verifyWebhook(rawBody: Buffer, signature: string): Promise<WebhookEvent> {
    const secret = process.env.MOCK_PAYMENT_WEBHOOK_SECRET;
    if (secret && signature !== secret) {
      throw new HttpError(401, 'INVALID_WEBHOOK_SIGNATURE', 'Invalid payment webhook signature');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody.toString('utf8') || '{}');
    } catch {
      throw new HttpError(400, 'INVALID_WEBHOOK_BODY', 'Invalid payment webhook body');
    }

    const body = webhookSchema.parse(parsed);

    return {
      type: eventToType[body.event],
      paymentId: body.paymentId,
      providerPaymentId: body.paymentId,
      amountRub: 0,
      metadata: {},
    };
  }

  async getPaymentProviderStatus(_paymentId: string): Promise<PaymentProviderStatus> {
    return 'pending';
  }
}
