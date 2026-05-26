import type { Request } from 'express';
import { HttpError } from '../utils/http-error';
import { logger } from '../utils/logger';

const DEFAULT_VERIFY_URL = 'https://smartcaptcha.cloud.yandex.ru/validate';

type YandexCaptchaResponse = {
  status?: string;
  message?: string;
};

function envText(name: string, fallback = '') {
  return (process.env[name] ?? fallback).trim();
}

function captchaSecret() {
  return envText('YANDEX_SMARTCAPTCHA_SECRET_KEY');
}

export function captchaEnabled() {
  const flag = envText('CAPTCHA_ENABLED').toLowerCase();
  if (flag === '0' || flag === 'false' || flag === 'off') return false;
  if (flag === '1' || flag === 'true' || flag === 'on') return true;
  return Boolean(captchaSecret());
}

function captchaVerifyUrl() {
  return envText('YANDEX_SMARTCAPTCHA_VERIFY_URL', DEFAULT_VERIFY_URL);
}

export function captchaTokenFromRequest(req: Request) {
  const header = req.headers['x-captcha-token'];
  if (typeof header === 'string' && header.trim()) return header.trim();
  if (Array.isArray(header) && header[0]?.trim()) return header[0].trim();

  const bodyToken = req.body?.captchaToken;
  if (typeof bodyToken === 'string' && bodyToken.trim()) return bodyToken.trim();

  return '';
}

export async function verifyCaptchaToken(token: string, ip?: string) {
  if (process.env.NODE_ENV === 'test') return;
  if (!captchaEnabled()) return;

  const secret = captchaSecret();
  if (!secret) {
    logger.error('[captcha] CAPTCHA_ENABLED is true but YANDEX_SMARTCAPTCHA_SECRET_KEY is missing');
    throw new HttpError(503, 'CAPTCHA_NOT_CONFIGURED', 'Проверка безопасности временно недоступна');
  }

  if (!token) {
    throw new HttpError(400, 'CAPTCHA_REQUIRED', 'Подтвердите, что вы не робот');
  }

  const body = new URLSearchParams({ secret, token });
  if (ip) body.set('ip', ip);

  let response: Response;
  try {
    response = await fetch(captchaVerifyUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
  } catch (error) {
    logger.error(`[captcha] Yandex SmartCaptcha validation request failed: ${(error as Error).message}`);
    throw new HttpError(503, 'CAPTCHA_UNAVAILABLE', 'Проверка безопасности временно недоступна');
  }

  let payload: YandexCaptchaResponse = {};
  try {
    payload = (await response.json()) as YandexCaptchaResponse;
  } catch {
    // Leave payload empty; status handling below will reject the response.
  }

  if (!response.ok || payload.status !== 'ok') {
    logger.warn(`[captcha] rejected status=${response.status} providerStatus=${payload.status ?? 'unknown'} message=${payload.message ?? ''}`);
    throw new HttpError(400, 'CAPTCHA_INVALID', 'Проверка безопасности не пройдена. Попробуйте ещё раз');
  }
}
