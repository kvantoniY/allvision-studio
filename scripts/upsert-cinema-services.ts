import fs from 'node:fs';
import {
  parseAdminServiceData,
  validatePipelineConfig,
  validateUserInputForm,
  type CreateAdminServiceInput,
  type UpdateAdminServiceInput,
} from '@allvision/shared';
import { giftFactoryServices } from '../packages/database/src/seed';

type AdminServiceRecord = {
  id: string;
  slug: string;
  title: string;
};

const TARGET_SLUGS = ['me-in-movie', 'me-in-cartoon', 'road-camera-couple'] as const;

function loadEnvFile(path = '.env') {
  if (!fs.existsSync(path)) return;
  const lines = fs.readFileSync(path, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const index = trimmed.indexOf('=');
    const key = trimmed.slice(0, index).trim();
    if (process.env[key]) continue;
    let value = trimmed.slice(index + 1).trim();
    value = value.replace(/^(['"])(.*)\1$/, '$2');
    process.env[key] = value;
  }
}

function argValue(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`);
}

function apiUrl(path: string) {
  const explicit = argValue('api') ?? process.env.ADMIN_API_URL ?? process.env.PUBLIC_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
  return `${explicit.replace(/\/$/, '')}${path}`;
}

function localDefault<T extends string | undefined>(value: T, fallback: string): string | undefined {
  const base = argValue('api') ?? process.env.ADMIN_API_URL ?? process.env.PUBLIC_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
  if (value) return value;
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(base) ? fallback : undefined;
}

function cookieHeader(headers: Headers) {
  const maybeHeadersWithGetSetCookie = headers as Headers & { getSetCookie?: () => string[] };
  const setCookies = maybeHeadersWithGetSetCookie.getSetCookie?.() ?? [];
  const raw = setCookies.length > 0 ? setCookies : [headers.get('set-cookie')].filter((value): value is string => Boolean(value));
  return raw
    .flatMap((value) => value.split(/,(?=\s*[^;,]+=)/))
    .map((value) => value.split(';')[0].trim())
    .filter(Boolean)
    .join('; ');
}

async function requestJson<T>(path: string, options: RequestInit & { cookie?: string } = {}): Promise<T> {
  const response = await fetch(apiUrl(path), {
    ...options,
    headers: {
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(options.cookie ? { cookie: options.cookie } : {}),
      ...(options.headers ?? {}),
    },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const message = data?.error?.message ?? data?.message ?? response.statusText;
    throw new Error(`${response.status} ${response.statusText}: ${message}`);
  }
  return data as T;
}

type GiftFactoryService = (typeof giftFactoryServices)[number];

function validateShape(input: { userInputForm: unknown; pipelineConfig: unknown }) {
  validateUserInputForm(input.userInputForm);
  validatePipelineConfig(input.pipelineConfig, input.userInputForm);
}

function toCreateInput(service: GiftFactoryService): CreateAdminServiceInput {
  const priceCoinsStandard = service.priceCoinsStandard ?? service.priceTokens;
  const priceCoinsPro = service.priceCoinsPro ?? priceCoinsStandard;
  return {
    slug: service.slug,
    title: service.title,
    shortDesc: service.shortDesc,
    description: service.description,
    category: service.category,
    priceCoinsStandard,
    priceCoinsPro,
    previewImage: service.previewImage ?? service.coverImage ?? null,
    previewVideo: service.previewVideo ?? null,
    previewMode: 'auto',
    isActive: service.isActive ?? true,
    isFeatured: service.isFeatured ?? false,
    sortOrder: service.sortOrder,
    userInputForm: service.userInputForm,
    pipelineConfig: service.pipelineConfig,
  };
}

function toUpdateInput(service: GiftFactoryService): UpdateAdminServiceInput {
  return {
    title: service.title,
    shortDesc: service.shortDesc,
    description: service.description,
    userInputForm: service.userInputForm,
    pipelineConfig: service.pipelineConfig,
  };
}

async function login() {
  const email = argValue('email') ?? localDefault(process.env.ADMIN_EMAIL ?? process.env.ADMIN_INITIAL_EMAIL, 'admin@allvision.studio');
  const password = argValue('password') ?? localDefault(process.env.ADMIN_PASSWORD ?? process.env.ADMIN_INITIAL_PASSWORD, 'admin123');
  if (!email || !password) {
    throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD, or pass --email=... --password=... for a non-local API.');
  }

  const response = await fetch(apiUrl('/api/auth/login'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) {
    throw new Error(`Login failed: ${response.status} ${response.statusText}`);
  }
  const cookie = cookieHeader(response.headers);
  if (!cookie) throw new Error('Login did not return auth cookies.');
  return cookie;
}

async function main() {
  loadEnvFile();

  const selected = TARGET_SLUGS.map((slug) => {
    const service = giftFactoryServices.find((item) => item.slug === slug);
    if (!service) throw new Error(`Missing service config: ${slug}`);
    validateShape(service);
    return service;
  });

  if (hasFlag('validate-only') || hasFlag('dry-run')) {
    for (const service of selected) {
      parseAdminServiceData(toCreateInput(service), 'create');
      parseAdminServiceData(toUpdateInput(service), 'update');
    }
    console.log(`validated ${selected.length} cinema service configs`);
    if (hasFlag('dry-run')) console.log('dry-run: no API requests sent');
    return;
  }

  const cookie = await login();
  const list = await requestJson<{ items: AdminServiceRecord[] }>('/api/admin/services?limit=200', { cookie });

  for (const service of selected) {
    const existing = list.items.find((item) => item.slug === service.slug);
    if (existing) {
      await requestJson<{ service: AdminServiceRecord }>(`/api/admin/services/${existing.id}`, {
        method: 'PATCH',
        cookie,
        body: JSON.stringify(toUpdateInput(service)),
      });
      console.log(`updated ${service.slug} (prices, previews and sort order preserved)`);
      continue;
    }

    const created = await requestJson<{ service: AdminServiceRecord }>('/api/admin/services', {
      method: 'POST',
      cookie,
      body: JSON.stringify(toCreateInput(service)),
    });
    console.log(`created ${created.service.slug}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
