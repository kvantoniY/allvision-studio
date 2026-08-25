import crypto from 'node:crypto';
import { XMLParser } from 'fast-xml-parser';
import { z } from 'zod';
import type { PaymentConfirmation, PaymentProvider, PaymentProviderStatus, WebhookEvent } from '@allvision/shared';
import { HttpError } from '../utils/http-error';
import { logger } from '../utils/logger';

function shortHash(value: string, length = 8): string {
  if (!value) return '';
  return crypto.createHash('sha1').update(value, 'utf8').digest('hex').slice(0, length);
}

const ROBOKASSA_PAY_URL = 'https://auth.robokassa.ru/Merchant/Index.aspx';
const ROBOKASSA_OP_STATE_URL = 'https://auth.robokassa.ru/Merchant/WebService/Service.asmx/OpStateExt';
const ROBOKASSA_STATUS_TIMEOUT_MS = 5000;

const opStateParser = new XMLParser({
  ignoreAttributes: false,
  removeNSPrefix: true,
  parseTagValue: false,
  trimValues: true,
});

const robokassaResultSchema = z
  .object({
    OutSum: z.coerce.string().min(1),
    InvId: z.coerce.string().min(1),
    SignatureValue: z.string().min(1).optional(),
  })
  .passthrough();

function normalizeOutSum(value: string): number {
  const trimmed = value.replace(/\s+/g, '').replace(',', '.');
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    throw new HttpError(400, 'INVALID_ROBOKASSA_BODY', `Cannot parse OutSum value: ${value}`);
  }
  return Math.round(parsed * 100);
}

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
  opStateUrl: string;
  statusTimeoutMs: number;
  apiUrl: string;
  webUrl: string;
  expirationTimeZone: string;
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

function positiveIntEnv(name: string, fallback: number) {
  const raw = env(name);
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
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
    opStateUrl: env('ROBOKASSA_OP_STATE_URL') ?? ROBOKASSA_OP_STATE_URL,
    statusTimeoutMs: positiveIntEnv('ROBOKASSA_STATUS_TIMEOUT_MS', ROBOKASSA_STATUS_TIMEOUT_MS),
    apiUrl: (process.env.PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/+$/, ''),
    webUrl: (process.env.PUBLIC_WEB_URL ?? 'http://localhost:3000').replace(/\/+$/, ''),
    expirationTimeZone: env('ROBOKASSA_EXPIRATION_TIME_ZONE') ?? 'Europe/Moscow',
  };
}

function formatRobokassaExpirationDate(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    hourCycle: 'h23',
  }).formatToParts(value);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}T${byType.hour}:${byType.minute}`;
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

function buildOpStateSignature(params: {
  merchantLogin: string;
  invoiceId: string;
  password2: string;
  hashAlgorithm: string;
}) {
  return hash([params.merchantLogin, params.invoiceId, params.password2].join(':'), params.hashAlgorithm);
}

function firstItem<T>(value: T | T[] | undefined): T | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  const item = firstItem(value as Record<string, unknown> | Record<string, unknown>[] | undefined);
  return item && typeof item === 'object' && !Array.isArray(item) ? item : undefined;
}

function textValue(value: unknown): string | undefined {
  const item = firstItem(value as unknown[] | undefined) ?? value;
  if (item == null) return undefined;
  if (typeof item === 'string' || typeof item === 'number') return String(item);
  if (typeof item === 'object' && !Array.isArray(item)) {
    const text = (item as Record<string, unknown>)['#text'];
    if (text != null) return String(text);
  }
  return undefined;
}

function numberValue(value: unknown): number | undefined {
  const raw = textValue(value);
  if (!raw) return undefined;
  const number = Number(raw);
  return Number.isFinite(number) ? number : undefined;
}

function providerStatusFromRobokassaState(code: number): PaymentProviderStatus {
  // По документации Robokassa State.Code:
  //   5  — заявка инициирована, ожидается оплата
  //   10 — оплата отменена/просрочена
  //   50 — деньги получены банком, ожидается зачисление мерчанту
  //   60 — деньги возвращены покупателю
  //   80 — оплата приостановлена
  //   100 — оплата завершена успешно
  // Code 50 ("получено банком") считаем succeeded — для пользователя деньги списались,
  // фактическое зачисление мерчанту обычно происходит в течение минут.
  if (code === 100 || code === 50) return 'succeeded';
  if (code === 10) return 'cancelled';
  if (code === 60) return 'failed';
  return 'pending';
}

function parseOpStateStatus(xml: string, invId: string): PaymentProviderStatus {
  let parsed: unknown;
  try {
    parsed = opStateParser.parse(xml);
  } catch (error) {
    logger.warn(
      `[robokassa] OpStateExt xml parse failed invId=${invId}: ${(error as Error).message} preview=${xml.slice(0, 200)}`,
    );
    throw new HttpError(502, 'ROBOKASSA_STATUS_PARSE_FAILED', 'Invalid Robokassa status response');
  }

  const root = objectValue(parsed);
  const response = objectValue(root?.OperationStateResponse ?? root?.OperationStateExtResponse ?? root);
  const result = objectValue(response?.Result);
  const resultCode = numberValue(result?.Code);

  // Robokassa Result.Code:
  //   0  — success, state присутствует
  //   1  — InvoiceID не указан
  //   2  — счёт не найден / некорректный
  //   3  — счёт не оплачен (но существует)
  //   5  — некорректная подпись
  if (resultCode === 3) {
    logger.info(`[robokassa] OpStateExt invId=${invId} result.code=3 → invoice not paid yet (pending)`);
    return 'pending';
  }
  if (resultCode === 2) {
    logger.info(`[robokassa] OpStateExt invId=${invId} result.code=2 → invoice unknown yet (pending)`);
    return 'pending';
  }
  if (resultCode !== 0) {
    const resultDescription = typeof result?.Description === 'string' ? result.Description : undefined;
    logger.warn(
      `[robokassa] OpStateExt invId=${invId} result.code=${resultCode ?? 'unknown'} description=${resultDescription ?? 'none'}`,
    );
    throw new HttpError(
      502,
      'ROBOKASSA_STATUS_REJECTED',
      `Robokassa status request rejected with code ${resultCode ?? 'unknown'}`,
    );
  }

  const state = objectValue(response?.State);
  const stateCode = numberValue(state?.Code);
  if (stateCode == null) {
    logger.warn(`[robokassa] OpStateExt invId=${invId} state.code missing preview=${xml.slice(0, 200)}`);
    throw new HttpError(502, 'ROBOKASSA_STATUS_PARSE_FAILED', 'Robokassa status response has no state code');
  }

  const status = providerStatusFromRobokassaState(stateCode);
  logger.info(`[robokassa] OpStateExt invId=${invId} state.code=${stateCode} → ${status}`);
  return status;
}

async function fetchTextWithTimeout(url: URL, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: { Accept: 'application/xml,text/xml;q=0.9,*/*;q=0.1' },
    });
    const text = await response.text();
    if (!response.ok) {
      throw new HttpError(502, 'ROBOKASSA_STATUS_HTTP_ERROR', `Robokassa status request failed with HTTP ${response.status}`);
    }
    return text;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if ((error as Error).name === 'AbortError') {
      throw new HttpError(504, 'ROBOKASSA_STATUS_TIMEOUT', 'Robokassa status request timed out');
    }
    throw new HttpError(502, 'ROBOKASSA_STATUS_UNAVAILABLE', `Robokassa status request failed: ${(error as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
}

function outSumVariations(outSum: string): string[] {
  const set = new Set<string>();
  set.add(outSum);
  const trimmed = outSum.replace(/\s+/g, '').replace(',', '.');
  set.add(trimmed);
  const numeric = Number(trimmed);
  if (Number.isFinite(numeric)) {
    set.add(numeric.toFixed(2));
    set.add(numeric.toFixed(4));
    set.add(numeric.toFixed(6));
    set.add(String(numeric));
    if (Number.isInteger(numeric)) set.add(String(numeric));
  }
  return [...set];
}

function tryAllSignatureVariations(params: {
  body: { OutSum: string; InvId: string };
  receivedSignature: string;
  shpParams: Record<string, string>;
  passwords: Array<{ label: string; value: string }>;
  hashAlgorithm: string;
}): { ok: true; label: string; outSum: string } | { ok: false; expectedDefault: string } {
  for (const { label, value: password } of params.passwords) {
    for (const outSumCandidate of outSumVariations(params.body.OutSum)) {
      const expected = buildResultSignature({
        outSum: outSumCandidate,
        invId: params.body.InvId,
        password,
        hashAlgorithm: params.hashAlgorithm,
        shpParams: params.shpParams,
      });
      if (timingSafeEqual(params.receivedSignature, expected)) {
        return { ok: true, label, outSum: outSumCandidate };
      }
    }
  }
  const expectedDefault = buildResultSignature({
    outSum: params.body.OutSum,
    invId: params.body.InvId,
    password: params.passwords[0]?.value ?? '',
    hashAlgorithm: params.hashAlgorithm,
    shpParams: params.shpParams,
  });
  return { ok: false, expectedDefault };
}

function webhookEventFromRobokassaPayload(
  payload: Record<string, string>,
  password: string,
  hashAlgorithm: string,
  source: 'webhook' | 'success-redirect',
) {
  const body = robokassaResultSchema.parse(payload);
  const shpParams = Object.fromEntries(sortedShpParams(payload));
  const receivedSignature = body.SignatureValue || '';

  const passwords: Array<{ label: string; value: string }> = [{ label: source === 'webhook' ? 'password2' : 'password1', value: password }];
  // Fallback: пробуем оба пароля, на случай если в ЛК Робокассы перепутаны
  // настройки Result/Success URL и для конкретного метода оплаты подпись
  // считается другим паролем.
  const config = getConfig();
  if (source === 'webhook' && config.password1 && config.password1 !== password) {
    passwords.push({ label: 'password1-fallback', value: config.password1 });
  }
  if (source === 'success-redirect' && config.password2 && config.password2 !== password) {
    passwords.push({ label: 'password2-fallback', value: config.password2 });
  }

  const verification = tryAllSignatureVariations({
    body: { OutSum: body.OutSum, InvId: body.InvId },
    receivedSignature,
    shpParams,
    passwords,
    hashAlgorithm,
  });

  if (!verification.ok) {
    logger.warn(
      `[robokassa] ${source} signature mismatch invId=${body.InvId} outSum=${body.OutSum} algo=${hashAlgorithm} ` +
        `received=${shortHash(receivedSignature)} expected=${shortHash(verification.expectedDefault)} ` +
        `shpKeys=${Object.keys(shpParams).join(',') || 'none'} ` +
        `triedPasswords=${passwords.map((p) => p.label).join('+')}`,
    );
    throw new HttpError(401, 'INVALID_ROBOKASSA_SIGNATURE', 'Invalid Robokassa callback signature');
  }

  if (verification.label !== passwords[0].label || verification.outSum !== body.OutSum) {
    logger.warn(
      `[robokassa] ${source} signature matched via FALLBACK invId=${body.InvId} ` +
        `password=${verification.label} outSumUsed=${verification.outSum} (received=${body.OutSum})`,
    );
  } else {
    logger.info(
      `[robokassa] ${source} signature ok invId=${body.InvId} outSum=${body.OutSum} shp_paymentId=${shpParams.Shp_paymentId ?? 'none'}`,
    );
  }

  return {
    type: 'payment.succeeded' as const,
    paymentId: shpParams.Shp_paymentId ?? body.InvId,
    providerPaymentId: body.InvId,
    amountRub: normalizeOutSum(body.OutSum),
    metadata: { ...shpParams, source, signatureMatch: verification.label },
  };
}

export class RobokassaPaymentProvider implements PaymentProvider {
  async createPayment(params: {
    amountRub: number;
    userId: string;
    purpose: 'topup' | 'order';
    providerPaymentId?: string;
    expiresAt?: Date;
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

    if (params.expiresAt) {
      confirmationParams.ExpirationDate = formatRobokassaExpirationDate(params.expiresAt, config.expirationTimeZone);
    }

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
    logger.info(
      `[robokassa] verifyWebhook payload keys=${Object.keys(payload).join(',')} hasSignature=${Boolean(payload.SignatureValue)} algo=${config.hashAlgorithm}`,
    );
    return webhookEventFromRobokassaPayload(payload, config.password2, config.hashAlgorithm, 'webhook');
  }

  async verifySuccessRedirect(rawBody: Buffer, signature: string): Promise<WebhookEvent> {
    const config = getConfig();
    const payload = parseRawPayload(rawBody);
    if (signature) payload.SignatureValue = signature;
    logger.info(
      `[robokassa] verifySuccessRedirect payload keys=${Object.keys(payload).join(',')} hasSignature=${Boolean(payload.SignatureValue)} algo=${config.hashAlgorithm}`,
    );
    return webhookEventFromRobokassaPayload(payload, config.password1, config.hashAlgorithm, 'success-redirect');
  }

  async getPaymentProviderStatus(paymentId: string): Promise<PaymentProviderStatus> {
    const config = getConfig();
    if (config.isTest) {
      logger.info(`[robokassa] OpStateExt skipped (TEST mode) invId=${paymentId}`);
      return 'pending';
    }

    const url = new URL(config.opStateUrl);
    url.searchParams.set('MerchantLogin', config.merchantLogin);
    url.searchParams.set('InvoiceID', paymentId);
    url.searchParams.set(
      'Signature',
      buildOpStateSignature({
        merchantLogin: config.merchantLogin,
        invoiceId: paymentId,
        password2: config.password2,
        hashAlgorithm: config.hashAlgorithm,
      }),
    );

    logger.info(`[robokassa] OpStateExt request invId=${paymentId}`);
    const xml = await fetchTextWithTimeout(url, config.statusTimeoutMs);
    return parseOpStateStatus(xml, paymentId);
  }
}
