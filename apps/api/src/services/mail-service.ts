import { logger } from '../utils/logger';

type SendMailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

const DEFAULT_UNISENDER_BASE_URL = 'https://goapi.unisender.ru/ru/transactional/api/v1';

function mailFromEmail() {
  return process.env.MAIL_FROM_EMAIL ?? 'noreply@allvision-pulse.ru';
}

function mailFromName() {
  return process.env.MAIL_FROM_NAME ?? 'Allvision Studio';
}

function unisenderBaseUrl() {
  return (process.env.UNISENDER_BASE_URL ?? DEFAULT_UNISENDER_BASE_URL).replace(/\/+$/, '');
}

function isUnisenderEnabled() {
  return (process.env.MAIL_PROVIDER ?? '').toLowerCase() === 'unisender' || Boolean(process.env.UNISENDER_API_KEY);
}

export function transactionalMailConfigured() {
  return isUnisenderEnabled() && Boolean(process.env.UNISENDER_API_KEY);
}

export async function sendTransactionalEmail(input: SendMailInput): Promise<{ sent: boolean }> {
  const apiKey = process.env.UNISENDER_API_KEY;

  if (!isUnisenderEnabled() || !apiKey) {
    logger.warn(`[mail] transactional mail is not configured; skipped email to=${input.to} subject="${input.subject}"`);
    return { sent: false };
  }

  const response = await fetch(`${unisenderBaseUrl()}/email/send.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': apiKey,
    },
    body: JSON.stringify({
      message: {
        recipients: [{ email: input.to }],
        from_email: mailFromEmail(),
        from_name: mailFromName(),
        subject: input.subject,
        body: {
          html: input.html,
          plaintext: input.text,
        },
      },
    }),
  });

  const bodyText = await response.text();
  if (!response.ok) {
    logger.error(`[mail] Unisender send failed status=${response.status} body=${bodyText.slice(0, 500)}`);
    throw new Error(`Unisender send failed: ${response.status}`);
  }

  logger.info(`[mail] sent email to=${input.to} subject="${input.subject}"`);
  return { sent: true };
}
