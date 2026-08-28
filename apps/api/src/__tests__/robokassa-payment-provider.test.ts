import crypto from 'node:crypto';
import { RobokassaPaymentProvider } from '../providers/robokassa-payment-provider';

const ENV_KEYS = [
  'ROBOKASSA_MERCHANT_LOGIN',
  'ROBOKASSA_PASSWORD1',
  'ROBOKASSA_PASSWORD2',
  'ROBOKASSA_HASH_ALGORITHM',
  'ROBOKASSA_TEST_MODE',
  'ROBOKASSA_RECEIPT_ENABLED',
  'ROBOKASSA_RECEIPT_PAYMENT_METHOD',
  'ROBOKASSA_RECEIPT_PAYMENT_OBJECT',
  'ROBOKASSA_RECEIPT_TAX',
  'ROBOKASSA_RECEIPT_SNO',
  'ROBOKASSA_PAYMENT_URL',
  'ROBOKASSA_OP_STATE_URL',
  'ROBOKASSA_STATUS_TIMEOUT_MS',
  'ROBOKASSA_EXPIRATION_TIME_ZONE',
  'PUBLIC_API_URL',
  'PUBLIC_WEB_URL',
] as const;

const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
const originalFetch = global.fetch;

function md5(value: string) {
  return crypto.createHash('md5').update(value, 'utf8').digest('hex');
}

beforeEach(() => {
  process.env.ROBOKASSA_MERCHANT_LOGIN = 'allvision-studio';
  process.env.ROBOKASSA_PASSWORD1 = 'password-one';
  process.env.ROBOKASSA_PASSWORD2 = 'password-two';
  process.env.ROBOKASSA_HASH_ALGORITHM = 'md5';
  process.env.ROBOKASSA_TEST_MODE = '0';
  process.env.ROBOKASSA_RECEIPT_ENABLED = 'true';
  process.env.ROBOKASSA_RECEIPT_PAYMENT_METHOD = 'full_payment';
  process.env.ROBOKASSA_RECEIPT_PAYMENT_OBJECT = 'service';
  process.env.ROBOKASSA_RECEIPT_TAX = 'none';
  delete process.env.ROBOKASSA_RECEIPT_SNO;
  process.env.ROBOKASSA_PAYMENT_URL = 'https://auth.robokassa.ru/Merchant/Index.aspx';
  process.env.ROBOKASSA_OP_STATE_URL = 'https://auth.robokassa.ru/Merchant/WebService/Service.asmx/OpStateExt';
  process.env.ROBOKASSA_STATUS_TIMEOUT_MS = '5000';
  process.env.ROBOKASSA_EXPIRATION_TIME_ZONE = 'Europe/Moscow';
  process.env.PUBLIC_API_URL = 'https://allvision-pulse.ru';
  process.env.PUBLIC_WEB_URL = 'https://allvision-pulse.ru';
  global.fetch = originalFetch;
});

afterAll(() => {
  global.fetch = originalFetch;
  for (const key of ENV_KEYS) {
    const value = originalEnv[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

describe('RobokassaPaymentProvider', () => {
  it('creates POST confirmation params with receipt and bounded InvId', async () => {
    const provider = new RobokassaPaymentProvider();
    const result = await provider.createPayment({
      amountRub: 49900,
      userId: 'user_1',
      purpose: 'topup',
      providerPaymentId: '123456',
      expiresAt: new Date(Date.UTC(2029, 0, 16, 9, 0)),
      metadata: {
        paymentId: 'payment_1',
        packageTitle: 'Старт',
        customerEmail: 'customer@example.ru',
      },
    });

    expect(result.paymentId).toBe('123456');
    expect(result.confirmationUrl).toBe('https://auth.robokassa.ru/Merchant/Index.aspx');
    expect(result.confirmationMethod).toBe('POST');
    expect(result.confirmationParams?.InvId).toBe('123456');
    expect(Number(result.confirmationParams?.InvId)).toBeLessThanOrEqual(2_147_483_647);
    expect(result.confirmationParams?.IsTest).toBeUndefined();
    expect(result.confirmationParams?.Description).toBe('Доступ к цифровым услугам Allvision Studio, пакет Старт');
    expect(result.confirmationParams?.ExpirationDate).toBe('2029-01-16T12:00');

    const receipt = JSON.parse(decodeURIComponent(result.confirmationParams?.Receipt ?? '')) as {
      items: Array<Record<string, unknown>>;
    };
    expect(receipt.items[0]).toMatchObject({
      name: 'Доступ к цифровым услугам Allvision Studio, пакет Старт',
      quantity: 1,
      sum: 499,
      payment_method: 'full_payment',
      payment_object: 'service',
      tax: 'none',
    });

    const params = result.confirmationParams!;
    const expectedSignature = md5([
      'allvision-studio',
      '499.00',
      '123456',
      params.Receipt,
      params.SuccessUrl2,
      params.SuccessUrl2Method,
      params.FailUrl2,
      params.FailUrl2Method,
      'password-one',
      'Shp_paymentId=payment_1',
      'Shp_purpose=topup',
    ].join(':'));
    expect(params.SignatureValue).toBe(expectedSignature);
  });

  it('verifies signed ResultURL callbacks', async () => {
    const provider = new RobokassaPaymentProvider();
    const outSum = '499.00';
    const invId = '123456';
    const signature = md5(`${outSum}:${invId}:password-two:Shp_paymentId=payment_1:Shp_purpose=topup`);
    const body = new URLSearchParams({
      OutSum: outSum,
      InvId: invId,
      SignatureValue: signature,
      Shp_paymentId: 'payment_1',
      Shp_purpose: 'topup',
    });

    const event = await provider.verifyWebhook(Buffer.from(body.toString(), 'utf8'), '');

    expect(event).toMatchObject({
      type: 'payment.succeeded',
      paymentId: 'payment_1',
      providerPaymentId: invId,
      amountRub: 49900,
    });
  });

  it('verifies signed SuccessURL redirects with password #1', async () => {
    const provider = new RobokassaPaymentProvider();
    const outSum = '499.00';
    const invId = '123456';
    const signature = md5(`${outSum}:${invId}:password-one:Shp_paymentId=payment_1:Shp_purpose=topup`);
    const body = new URLSearchParams({
      OutSum: outSum,
      InvId: invId,
      SignatureValue: signature,
      Shp_paymentId: 'payment_1',
      Shp_purpose: 'topup',
    });

    const event = await provider.verifySuccessRedirect(Buffer.from(body.toString(), 'utf8'), '');

    expect(event).toMatchObject({
      type: 'payment.succeeded',
      paymentId: 'payment_1',
      providerPaymentId: invId,
      amountRub: 49900,
    });
  });

  it('rejects ResultURL callbacks with invalid signatures', async () => {
    const provider = new RobokassaPaymentProvider();
    const body = new URLSearchParams({
      OutSum: '499.00',
      InvId: '123456',
      SignatureValue: 'bad-signature',
      Shp_paymentId: 'payment_1',
      Shp_purpose: 'topup',
    });

    await expect(provider.verifyWebhook(Buffer.from(body.toString(), 'utf8'), '')).rejects.toMatchObject({
      status: 401,
      code: 'INVALID_ROBOKASSA_SIGNATURE',
    });
  });

  it('checks final payment status through OpStateExt', async () => {
    const provider = new RobokassaPaymentProvider();
    const invId = '123456';
    const expectedSignature = md5(`allvision-studio:${invId}:password-two`);
    const fetchMock = jest.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      expect(url.searchParams.get('MerchantLogin')).toBe('allvision-studio');
      expect(url.searchParams.get('InvoiceID')).toBe(invId);
      expect(url.searchParams.get('Signature')).toBe(expectedSignature);

      return new Response(
        [
          '<OperationStateResponse>',
          '<Result><Code>0</Code></Result>',
          '<State><Code>100</Code></State>',
          '</OperationStateResponse>',
        ].join(''),
        { status: 200 },
      );
    });
    global.fetch = fetchMock as typeof fetch;

    await expect(provider.getPaymentProviderStatus(invId)).resolves.toBe('succeeded');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
