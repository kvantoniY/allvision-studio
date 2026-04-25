export interface PaymentProvider {
  createPayment(params: {
    amountRub: number;
    userId: string;
    purpose: 'topup' | 'order';
    metadata: Record<string, string>;
  }): Promise<{ paymentId: string; confirmationUrl: string }>;

  verifyWebhook(rawBody: Buffer, signature: string): Promise<WebhookEvent>;

  getPaymentProviderStatus(paymentId: string): Promise<PaymentProviderStatus>;
}

export type PaymentProviderStatus = 'pending' | 'succeeded' | 'failed' | 'cancelled';

export interface WebhookEvent {
  type: 'payment.succeeded' | 'payment.failed' | 'payment.cancelled';
  paymentId: string;
  providerPaymentId: string;
  amountRub: number;
  metadata: Record<string, string>;
}
