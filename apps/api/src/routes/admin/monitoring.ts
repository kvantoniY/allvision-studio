import net from 'node:net';
import tls from 'node:tls';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { prisma } from '@allvision/database';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { requireAuth } from '../../middleware/auth';
import { requireAdmin } from '../../middleware/require-admin';
import { HttpError } from '../../utils/http-error';

export const adminMonitoringRouter = Router();

adminMonitoringRouter.use(requireAuth, requireAdmin);

const INDICATORS_KEY = 'MONITORING_INDICATORS';

type Health = 'ok' | 'warn' | 'down' | 'unknown';

const indicatorSchema = z.object({
  id: z.string().min(1).max(64).optional(),
  label: z.string().min(1).max(200),
  category: z.string().max(80).optional().default(''),
  note: z.string().max(2000).optional().default(''),
  url: z.string().max(500).optional().default(''),
  trackDate: z.boolean().optional().default(false),
  expiresAt: z.string().max(40).optional().nullable(),
  warnDays: z.coerce.number().int().min(0).max(3650).optional().nullable(),
  trackBalance: z.boolean().optional().default(false),
  balance: z.coerce.number().optional().nullable(),
  balanceUnit: z.string().max(16).optional().default('₽'),
  warnBalance: z.coerce.number().optional().nullable(),
  manualStatus: z.enum(['auto', 'ok', 'warn', 'down']).optional().default('auto'),
  updatedAt: z.string().max(40).optional(),
});

const updateIndicatorsSchema = z.object({
  indicators: z.array(indicatorSchema).max(100),
});

type StoredIndicator = z.infer<typeof indicatorSchema> & { id: string };

function worst(list: Health[]): Health {
  if (list.includes('down')) return 'down';
  if (list.includes('warn')) return 'warn';
  if (list.includes('ok')) return 'ok';
  return 'unknown';
}

function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return null;
  return Math.floor((ts - Date.now()) / (24 * 60 * 60 * 1000));
}

function dateHealth(iso: string, warnDays: number): Health {
  const left = daysUntil(iso);
  if (left === null) return 'unknown';
  if (left < 0) return 'down';
  if (left <= warnDays) return 'warn';
  return 'ok';
}

function balanceHealth(balance: number, warnBalance: number): Health {
  if (balance <= 0) return 'down';
  if (balance <= warnBalance) return 'warn';
  return 'ok';
}

function computeIndicator(raw: StoredIndicator) {
  const daysLeft = raw.trackDate ? daysUntil(raw.expiresAt) : null;
  let health: Health;
  if (raw.manualStatus && raw.manualStatus !== 'auto') {
    health = raw.manualStatus;
  } else {
    const parts: Health[] = [];
    if (raw.trackDate && raw.expiresAt) parts.push(dateHealth(raw.expiresAt, raw.warnDays ?? 7));
    if (raw.trackBalance && raw.balance != null) parts.push(balanceHealth(raw.balance, raw.warnBalance ?? 0));
    health = parts.length ? worst(parts) : 'unknown';
  }
  return { ...raw, daysLeft, health };
}

async function readIndicators(): Promise<StoredIndicator[]> {
  const row = await prisma.setting.findUnique({ where: { key: INDICATORS_KEY } });
  if (!row?.value) return [];
  try {
    const parsed = JSON.parse(row.value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        const res = indicatorSchema.safeParse(item);
        if (!res.success) return null;
        return { ...res.data, id: res.data.id ?? randomUUID() } satisfies StoredIndicator;
      })
      .filter((v): v is StoredIndicator => v !== null);
  } catch {
    return [];
  }
}

async function writeIndicators(list: StoredIndicator[]) {
  await prisma.setting.upsert({
    where: { key: INDICATORS_KEY },
    update: { value: JSON.stringify(list) },
    create: { key: INDICATORS_KEY, value: JSON.stringify(list) },
  });
}

// --- Automatic checks -------------------------------------------------------

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => {
      if (!done) {
        done = true;
        resolve(fallback);
      }
    }, ms);
    promise
      .then((value) => {
        if (!done) {
          done = true;
          clearTimeout(timer);
          resolve(value);
        }
      })
      .catch(() => {
        if (!done) {
          done = true;
          clearTimeout(timer);
          resolve(fallback);
        }
      });
  });
}

function monitoredDomain() {
  const explicit = (process.env.MONITORING_DOMAIN ?? '').trim();
  if (explicit) return explicit.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const fromUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? process.env.PUBLIC_API_URL ?? '').trim();
  if (fromUrl) {
    try {
      return new URL(fromUrl.startsWith('http') ? fromUrl : `https://${fromUrl}`).hostname;
    } catch {
      /* ignore */
    }
  }
  return 'allvision-pulse.ru';
}

async function checkSsl(host: string) {
  return withTimeout<Record<string, unknown>>(
    new Promise((resolve, reject) => {
      const socket = tls.connect(
        { host, port: 443, servername: host, rejectUnauthorized: false, timeout: 5000 },
        () => {
          const cert = socket.getPeerCertificate();
          socket.end();
          if (!cert || !cert.valid_to) {
            resolve({ available: false, error: 'NO_CERT' });
            return;
          }
          const validTo = new Date(cert.valid_to).toISOString();
          const daysLeft = daysUntil(validTo);
          const health: Health = daysLeft === null ? 'unknown' : daysLeft < 0 ? 'down' : daysLeft <= 14 ? 'warn' : 'ok';
          resolve({
            available: true,
            host,
            validTo,
            daysLeft,
            issuer: cert.issuer?.O ?? cert.issuer?.CN ?? null,
            health,
          });
        },
      );
      socket.on('error', reject);
      socket.on('timeout', () => {
        socket.destroy();
        reject(new Error('TLS_TIMEOUT'));
      });
    }),
    6000,
    { available: false, host, error: 'TLS_UNAVAILABLE' },
  );
}

function whoisPaidTill(text: string): string | null {
  // .ru registry (TCI) uses "paid-till: 2026-12-31T21:00:00Z"; generic uses "Registry Expiry Date:".
  const patterns = [
    /paid-till:\s*([0-9T:\-.+Z]+)/i,
    /Registry Expiry Date:\s*([0-9T:\-.+Z]+)/i,
    /Expiration Date:\s*([0-9T:\-.+Z]+)/i,
    /Expiry Date:\s*([0-9T:\-.+Z]+)/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) {
      const ts = Date.parse(m[1].trim());
      if (Number.isFinite(ts)) return new Date(ts).toISOString();
    }
  }
  return null;
}

async function checkDomainWhois(domain: string) {
  const tld = domain.split('.').pop()?.toLowerCase();
  const server = tld === 'ru' || tld === 'su' || tld === 'рф' ? 'whois.tcinet.ru' : 'whois.iana.org';
  return withTimeout<Record<string, unknown>>(
    new Promise((resolve, reject) => {
      let buffer = '';
      const socket = net.connect({ host: server, port: 43, timeout: 5000 }, () => {
        socket.write(`${domain}\r\n`);
      });
      socket.setEncoding('utf8');
      socket.on('data', (chunk) => {
        buffer += chunk;
      });
      socket.on('end', () => {
        const validTo = whoisPaidTill(buffer);
        if (!validTo) {
          resolve({ available: false, domain, error: 'NO_PAID_TILL' });
          return;
        }
        const daysLeft = daysUntil(validTo);
        const health: Health = daysLeft === null ? 'unknown' : daysLeft < 0 ? 'down' : daysLeft <= 30 ? 'warn' : 'ok';
        resolve({ available: true, domain, validTo, daysLeft, health });
      });
      socket.on('error', reject);
      socket.on('timeout', () => {
        socket.destroy();
        reject(new Error('WHOIS_TIMEOUT'));
      });
    }),
    6000,
    { available: false, domain, error: 'WHOIS_UNAVAILABLE' },
  );
}

async function checkCaptcha() {
  const secret = (process.env.YANDEX_SMARTCAPTCHA_SECRET_KEY ?? '').trim();
  const flag = (process.env.CAPTCHA_ENABLED ?? '').trim().toLowerCase();
  const enabled = ['0', 'false', 'off'].includes(flag) ? false : ['1', 'true', 'on'].includes(flag) ? true : Boolean(secret);
  if (!enabled) {
    return { enabled: false, configured: Boolean(secret), health: 'warn' as Health, note: 'Капча выключена' };
  }
  if (!secret) {
    return { enabled: true, configured: false, health: 'down' as Health, note: 'CAPTCHA_ENABLED, но нет секретного ключа' };
  }
  const verifyUrl = (process.env.YANDEX_SMARTCAPTCHA_VERIFY_URL ?? 'https://smartcaptcha.cloud.yandex.ru/validate').trim();
  return withTimeout<Record<string, unknown>>(
    (async () => {
      const body = new URLSearchParams({ secret, token: 'monitoring-probe' });
      const r = await fetch(verifyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
      const json = (await r.json().catch(() => ({}))) as { status?: string; message?: string };
      // Валидный секрет + заведомо неверный токен => сервис отвечает 200 status="failed".
      // Ошибка секрета/сервиса => не-200 или иное. Так проверяем, что верификация жива.
      if (r.ok && (json.status === 'failed' || json.status === 'ok')) {
        return { enabled: true, configured: true, health: 'ok' as Health, note: 'Сервис верификации отвечает', checkedAt: new Date().toISOString() };
      }
      return {
        enabled: true,
        configured: true,
        health: 'down' as Health,
        note: `Верификация вернула ${r.status} ${json.message ?? json.status ?? ''}`.trim(),
        checkedAt: new Date().toISOString(),
      };
    })(),
    6000,
    { enabled: true, configured: true, health: 'unknown' as Health, note: 'Проверка не завершилась (таймаут)' },
  );
}

async function checkFalBalance() {
  const apiKey = process.env.FAL_BILLING_KEY || process.env.FAL_KEY;
  if (!apiKey) return { available: false, health: 'unknown' as Health, error: 'FAL_KEY_MISSING' };
  return withTimeout<Record<string, unknown>>(
    (async () => {
      const r = await fetch('https://api.fal.ai/v1/account/billing?expand=credits', {
        headers: { Authorization: `Key ${apiKey}` },
      });
      const json = (await r.json().catch(() => ({}))) as { credits?: { current_balance?: number; currency?: string } };
      if (!r.ok) return { available: false, health: 'unknown' as Health, error: `FAL_${r.status}` };
      const balanceUsd = Number(json?.credits?.current_balance ?? 0);
      const balanceMin = Number(process.env.FAL_BALANCE_MIN_USD ?? '2');
      const health: Health = balanceUsd <= 0 ? 'down' : balanceUsd < balanceMin ? 'warn' : 'ok';
      return { available: true, balanceUsd, currency: json?.credits?.currency ?? 'USD', health, checkedAt: new Date().toISOString() };
    })(),
    6000,
    { available: false, health: 'unknown' as Health, error: 'FAL_TIMEOUT' },
  );
}

// --- Errors -----------------------------------------------------------------

async function readGenerationErrors() {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [failed, total, completed] = await Promise.all([
    prisma.project.findMany({
      where: { status: 'FAILED', createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        title: true,
        mode: true,
        createdAt: true,
        errorCode: true,
        errorMessage: true,
        selectedTier: true,
        tokensCost: true,
        userInputs: true,
        inputText: true,
        inputImages: true,
        service: { select: { slug: true, title: true } },
        user: { select: { id: true, email: true } },
        aiUsageLogs: {
          where: { status: { not: 'success' } },
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: {
            model: true,
            blockSlug: true,
            status: true,
            errorCode: true,
            errorMessage: true,
            taskId: true,
            costUsd: true,
            createdAt: true,
          },
        },
      },
    }),
    prisma.project.count({ where: { status: 'FAILED', createdAt: { gte: since } } }),
    prisma.project.count({ where: { status: 'COMPLETED', createdAt: { gte: since } } }),
  ]);

  const byCode = new Map<string, number>();
  for (const p of failed) {
    const code = p.errorCode ?? 'UNKNOWN';
    byCode.set(code, (byCode.get(code) ?? 0) + 1);
  }

  return {
    since: since.toISOString(),
    failedCount: total,
    completedCount: completed,
    byCode: Array.from(byCode.entries())
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count),
    items: failed,
  };
}

// --- Routes -----------------------------------------------------------------

adminMonitoringRouter.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const domain = monitoredDomain();
    const [stored, ssl, whois, captcha, falBalance, errors] = await Promise.all([
      readIndicators(),
      checkSsl(domain),
      checkDomainWhois(domain),
      checkCaptcha(),
      checkFalBalance(),
      readGenerationErrors(),
    ]);

    res.json({
      indicators: stored.map(computeIndicator),
      auto: { domain, ssl, whois, captcha, falBalance },
      errors,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

adminMonitoringRouter.put('/indicators', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = updateIndicatorsSchema.parse(req.body);
    const now = new Date().toISOString();
    const list: StoredIndicator[] = body.indicators.map((item) => ({
      ...item,
      id: item.id && item.id.trim() ? item.id : randomUUID(),
      updatedAt: item.updatedAt ?? now,
    }));
    await writeIndicators(list);
    res.json({ indicators: list.map(computeIndicator) });
  } catch (err) {
    if (err instanceof z.ZodError) {
      next(new HttpError(400, 'INVALID_INDICATORS', 'Проверьте поля индикаторов'));
      return;
    }
    next(err);
  }
});
