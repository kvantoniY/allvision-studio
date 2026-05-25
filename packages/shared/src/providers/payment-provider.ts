export interface PaymentProvider {
  createPayment(params: {
    amountRub: number;
    userId: string;
    purpose: 'topup' | 'order';
    providerPaymentId?: string;
    metadata: Record<string, string>;
  }): Promise<PaymentConfirmation>;

  verifyWebhook(rawBody: Buffer, signature: string): Promise<WebhookEvent>;
  verifySuccessRedirect?(rawBody: Buffer, signature: string): Promise<WebhookEvent>;

  getPaymentProviderStatus(paymentId: string): Promise<PaymentProviderStatus>;
}

export type PaymentProviderStatus = 'pending' | 'succeeded' | 'failed' | 'cancelled';
export type PaymentConfirmationMethod = 'GET' | 'POST';

export type PaymentConfirmation = {
  paymentId: string;
  confirmationUrl: string;
  confirmationMethod?: PaymentConfirmationMethod;
  confirmationParams?: Record<string, string>;
};

export interface WebhookEvent {
  type: 'payment.succeeded' | 'payment.failed' | 'payment.cancelled';
  paymentId: string;
  providerPaymentId: string;
  amountRub: number;
  metadata: Record<string, string>;
}
