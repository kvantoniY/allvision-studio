import type { PaymentProvider } from '@allvision/shared';
import { HttpError } from '../utils/http-error';
import { MockPaymentProvider } from '../providers/mock-payment-provider';

export function getPaymentProvider(): PaymentProvider {
  const provider = process.env.PAYMENT_PROVIDER ?? 'mock';

  if (provider === 'mock') {
    return new MockPaymentProvider();
  }

  throw new HttpError(500, 'PAYMENT_PROVIDER_NOT_CONFIGURED', `Payment provider "${provider}" is not configured`);
}
