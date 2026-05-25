import crypto from 'node:crypto';
import { z } from 'zod';
import type { PaymentConfirmation, PaymentProvider, PaymentProviderStatus, WebhookEvent } from '@allvision/shared';
import { HttpError } from '../utils/http-error';

const ROBOKASSA_PAY_URL = 'https://auth.robokassa.ru/Merchant/Index.aspx';

const robokassaResultSchema = z
  .object({
    OutSum: z.coerce.string().min(1),
    InvId: z.coerce.string().min(1),
    SignatureValue: z.string().min(1).optional(),
  })
  .passthrough();

type RobokassaConfig = {
  merchantLogin: string;
  password1: string;
  password2: string;
  hashAlgorithm: string;
  isTest: boolean;
  receiptEnabled: boolean;
  receiptPaymentMethod: string;
  receiptPaymentObject: string;
  receiptTax: string;
  receiptSno?: string;
  paymentUrl: string;
  apiUrl: string;
  webUrl: string;
};

function env(name: string) {
  return process.env[name]?.trim();
}

function requiredEnv(name: string) {
  const value = env(name);
  if (!value) {
    throw new Error(`${name} is required for PAYMENT_PROVIDER=robokassa`);
  }
  return value;
}

function isTruthy(value: string | undefined, fallback = false) {
  if (value == null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function getConfig(): RobokassaConfig {
  return {
    merchantLogin: requiredEnv('ROBOKASSA_MERCHANT_LOGIN'),
    password1: requiredEnv('ROBOKASSA_PASSWORD1'),
    password2: requiredEnv('ROBOKASSA_PASSWORD2'),
    hashAlgorithm: (env('ROBOKASSA_HASH_ALGORITHM') ?? 'md5').toLowerCase(),
    isTest: isTruthy(env('ROBOKASSA_TEST_MODE'), false),
    receiptEnabled: isTruthy(env('ROBOKASSA_RECEIPT_ENABLED'), true),
    receiptPaymentMethod: env('ROBOKASSA_RECEIPT_PAYMENT_METHOD') ?? 'full_payment',
    receiptPaymentObject: env('ROBOKASSA_RECEIPT_PAYMENT_OBJECT') ?? 'service',
    receiptTax: env('ROBOKASSA_RECEIPT_TAX') ?? 'none',
    receiptSno: env('ROBOKASSA_RECEIPT_SNO'),
    paymentUrl: env('ROBOKASSA_PAYMENT_URL') ?? ROBOKASSA_PAY_URL,
    apiUrl: (process.env.PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/+$/, ''),
    webUrl: (process.env.PUBLIC_WEB_URL ?? 'http://localhost:3000').replace(/\/+$/, ''),
  };
}

function rublesFromKopecks(amountRub: number) {
  return (amountRub / 100).toFixed(2);
}

function numberRubles(amountRub: number) {
  return Number(rublesFromKopecks(amountRub));
}

function buildInvId() {
  return String(crypto.randomInt(1, 2_147_483_648));
}

function hash(value: string, algorithm: string) {
  return crypto.createHash(algorithm).update(value, 'utf8').digest('hex');
}

function timingSafeEqual(a: string, b: string) {
  const left = Buffer.from(a.toLowerCase(), 'utf8');
  const right = Buffer.from(b.toLowerCase(), 'utf8');
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function sortedShpParams(params: Record<string, string>) {
  return Object.entries(params)
    .filter(([key]) => key.startsWith('Shp_'))
    .sort(([a], [b]) => a.localeCompare(b));
}

function clip(value: string, max: number) {
  return value.length <= max ? value : value.slice(0, max);
}

function sanitizeDescription(value: string) {
  return clip(value.replace(/[<>"]/g, '').replace(/\s+/g, ' ').trim(), 100);
}

function topupDescription(packageTitle?: string) {
  const suffix = packageTitle ? `, пакет ${packageTitle}` : '';
  return `Доступ к цифровым услугам Allvision Studio${suffix}`;
}

function buildReceipt(params: {
  amountRub: number;
  description: string;
  customerEmail?: string;
  config: RobokassaConfig;
}) {
  const receipt: {
    sno?: string;
    items: Array<Record<string, string | number>>;
  } = {
    items: [
      {
        name: clip(params.description, 128),
        quantity: 1,
        sum: numberRubles(params.amountRub),
        payment_method: params.config.receiptPaymentMethod,
        payment_object: params.config.receiptPaymentObject,
        tax: params.config.receiptTax,
      },
    ],
  };

  if (params.config.receiptSno) {
    receipt.sno = params.config.receiptSno;
  }

  return encodeURIComponent(JSON.stringify(receipt));
}

function buildStartSignature(params: {
  merchantLogin: string;
  outSum: string;
  invId: string;
  password1: string;
  hashAlgorithm: string;
  receipt?: string;
  successUrl2?: string;
  successUrl2Method?: string;
  failUrl2?: string;
  failUrl2Method?: string;
  shpParams: Record<string, string>;
}) {
  const modifiers = [
    params.receipt,
    params.successUrl2,
    params.successUrl2Method,
    params.failUrl2,
    params.failUrl2Method,
  ].filter((value): value is string => Boolean(value));

  const parts = [
    params.merchantLogin,
    params.outSum,
    params.invId,
    ...modifiers,
    params.password1,
    ...sortedShpParams(params.shpParams).map(([key, value]) => `${key}=${value}`),
  ];

  return hash(parts.join(':'), params.hashAlgorithm);
}

function parseRawPayload(rawBody: Buffer): Record<string, string> {
  const text = rawBody.toString('utf8').trim();
  if (!text) {
    throw new HttpError(400, 'INVALID_ROBOKASSA_BODY', 'Robokassa callback body is empty');
  }

  if (text.startsWith('{')) {
    try {
      const parsed = JSON.parse(text) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Expected object');
      }
      return Object.fromEntries(
        Object.entries(parsed).map(([key, value]) => [key, typeof value === 'string' ? value : String(value)]),
      );
    } catch {
      throw new HttpError(400, 'INVALID_ROBOKASSA_BODY', 'Invalid Robokassa JSON callback');
    }
  }

  return Object.fromEntries(new URLSearchParams(text));
}

function buildResultSignature(params: {
  outSum: string;
  invId: string;
  password: string;
  hashAlgorithm: string;
  shpParams: Record<string, string>;
}) {
  const parts = [
    params.outSum,
    params.invId,
    params.password,
    ...sortedShpParams(params.shpParams).map(([key, value]) => `${key}=${value}`),
  ];

  return hash(parts.join(':'), params.hashAlgorithm);
}

function webhookEventFromRobokassaPayload(payload: Record<string, string>, password: string, hashAlgorithm: string) {
  const body = robokassaResultSchema.parse(payload);
  const shpParams = Object.fromEntries(sortedShpParams(payload));
  const expectedSignature = buildResultSignature({
    outSum: body.OutSum,
    invId: body.InvId,
    password,
    hashAlgorithm,
    shpParams,
  });
  const receivedSignature = body.SignatureValue || '';

  if (!timingSafeEqual(receivedSignature, expectedSignature)) {
    throw new HttpError(401, 'INVALID_ROBOKASSA_SIGNATURE', 'Invalid Robokassa callback signature');
  }

  return {
    type: 'payment.succeeded' as const,
    paymentId: shpParams.Shp_paymentId ?? body.InvId,
    providerPaymentId: body.InvId,
    amountRub: Math.round(Number(body.OutSum) * 100),
    metadata: shpParams,
  };
}

export class RobokassaPaymentProvider implements PaymentProvider {
  async createPayment(params: {
    amountRub: number;
    userId: string;
    purpose: 'topup' | 'order';
    providerPaymentId?: string;
    metadata: Record<string, string>;
  }): Promise<PaymentConfirmation> {
    const config = getConfig();
    const invId = params.providerPaymentId ?? buildInvId();
    const outSum = rublesFromKopecks(params.amountRub);
    const successUrl2 = `${config.apiUrl}/api/payments/robokassa/success`;
    const failUrl2 = `${config.apiUrl}/api/payments/robokassa/fail`;
    const successUrl2Method = 'GET';
    const failUrl2Method = 'GET';
    const description = sanitizeDescription(
      params.purpose === 'topup'
        ? topupDescription(params.metadata.packageTitle)
        : `Allvision Studio: заказ ${params.metadata.orderId ?? invId}`,
    );

    const shpParams = {
      Shp_paymentId: params.metadata.paymentId,
      Shp_purpose: params.purpose,
    };
    const receipt = config.receiptEnabled
      ? buildReceipt({
          amountRub: params.amountRub,
          description,
          customerEmail: params.metadata.customerEmail,
          config,
        })
      : undefined;

    const signature = buildStartSignature({
      merchantLogin: config.merchantLogin,
      outSum,
      invId,
      password1: config.password1,
      hashAlgorithm: config.hashAlgorithm,
      receipt,
      successUrl2,
      successUrl2Method,
      failUrl2,
      failUrl2Method,
      shpParams,
    });

    const confirmationParams: Record<string, string> = {
      MerchantLogin: config.merchantLogin,
      OutSum: outSum,
      InvId: invId,
      Description: description,
      SignatureValue: signature,
      Culture: 'ru',
      Encoding: 'utf-8',
      SuccessUrl2: successUrl2,
      SuccessUrl2Method: successUrl2Method,
      FailUrl2: failUrl2,
      FailUrl2Method: failUrl2Method,
      ...shpParams,
    };

    if (params.metadata.customerEmail) {
      confirmationParams.Email = params.metadata.customerEmail;
    }
    if (config.isTest) {
      confirmationParams.IsTest = '1';
    }
    if (receipt) {
      confirmationParams.Receipt = receipt;
    }

    return {
      paymentId: invId,
      confirmationUrl: config.paymentUrl,
      confirmationMethod: 'POST',
      confirmationParams,
    };
  }

  async verifyWebhook(rawBody: Buffer, signature: string): Promise<WebhookEvent> {
    const config = getConfig();
    const payload = parseRawPayload(rawBody);
    if (signature) payload.SignatureValue = signature;
    return webhookEventFromRobokassaPayload(payload, config.password2, config.hashAlgorithm);
  }

  async verifySuccessRedirect(rawBody: Buffer, signature: string): Promise<WebhookEvent> {
    const config = getConfig();
    const payload = parseRawPayload(rawBody);
    if (signature) payload.SignatureValue = signature;
    return webhookEventFromRobokassaPayload(payload, config.password1, config.hashAlgorithm);
  }

  async getPaymentProviderStatus(_paymentId: string): Promise<PaymentProviderStatus> {
    return 'pending';
  }
}
