import type { PaymentProvider } from '@allvision/shared';
import { getPaymentProvider as factoryGetPaymentProvider } from '../providers';

export function getPaymentProvider(): PaymentProvider {
  return factoryGetPaymentProvider();
}
