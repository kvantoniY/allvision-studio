import {
  parseAdminServiceData,
  validatePipelineConfig,
  validateUserInputForm,
  type CreateAdminServiceInput,
  type UpdateAdminServiceInput,
} from '@allvision/shared';
import fs from 'node:fs';

type AdminServiceRecord = {
  id: string;
  slug: string;
  title: string;
};

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

function validateService(service: CreateAdminServiceInput) {
  const parsed = parseAdminServiceData(service, 'create') as CreateAdminServiceInput;
  validateUserInputForm(parsed.userInputForm);
  validatePipelineConfig(parsed.pipelineConfig, parsed.userInputForm);
  return parsed;
}

const services = [
  {
    slug: 'photo-2k17-style',
    title: 'Фото в стиле 2к17',
    shortDesc: 'Ностальгичный портрет как из 2017: вспышка, глянец, соцсети и легкая дерзость эпохи.',
    description:
      'Загрузите портрет или фото по пояс, а сервис соберет стилизованный снимок в духе 2017 года: прямой вспышечный свет, глянцевую обработку, аккуратную ретушь, зерно, контраст и настроение старых соцсетей.\n\nAI сохраняет лицо, возраст, позу и узнаваемые черты человека. Стиль добавляется как художественная обработка, без логотипов, водяных знаков и грубой замены личности.\n\nПодходит для аватарок, ностальгичных постов, обложек и личных подарков.',
    category: 'TRENDS_MEMES',
    priceCoinsStandard: 30,
    priceCoinsPro: 45,
    isActive: true,
    isFeatured: true,
    sortOrder: 2,
    userInputForm: [
      {
        id: 'photo',
        type: 'photo',
        label: 'Фото',
        required: true,
        hint: 'Портрет или фото по пояс, JPG/PNG/WebP до 10MB',
        maxSizeMb: 10,
        allowedFormats: ['jpg', 'jpeg', 'png', 'webp'],
        allowStudioAvatars: true,
        allowSystemLibrary: false,
      },
      {
        id: 'vibe',
        type: 'select',
        label: 'Настроение',
        required: true,
        options: [
          { label: 'Вечеринка и вспышка', value: 'flash_party' },
          { label: 'Глянцевый портрет', value: 'glossy_portrait' },
          { label: 'Уличный casual', value: 'street_casual' },
          { label: 'Мягкая ностальгия', value: 'soft_nostalgia' },
        ],
      },
      { id: 'tier', type: 'tier', label: 'Качество', required: true },
    ],
    pipelineConfig: [
      {
        id: 'step_1',
        blockSlug: 'image-edit',
        input: '{{user.photo}}',
        params: {
          model: { standard: 'nano-banana', pro: 'nano-banana' },
          prompt:
            'Keep the EXACT same person from the uploaded photo. IDENTITY IS THE ABSOLUTE TOP PRIORITY: reproduce their face precisely — identical face shape, eyes, nose, mouth, eyebrows, skin tone, hairstyle, age and pose. The face must stay perfectly sharp, in focus, photorealistic and 1:1 recognizable as the same person. Never smooth, beautify, slim, re-age, swap or repaint the face, and never apply a beauty filter — keep natural skin texture and real pores, no plastic look, no blur on the face. Restyle ONLY the photo around the person into a mid-2010s 2017 social-media look (selected vibe: {{user.vibe}}): direct on-camera flash or glossy soft flash, mid-2010s color grading, subtle film grain, sharp smartphone/editorial detail, trendy casual styling of the era, confident playful mood. Realistic, premium, recognizable. No logos, brand names, text, watermarks, deformed hands, extra people, nudity or parody.',
          negative_prompt:
            'logos, text, watermark, extra fingers, deformed face, changed identity, plastic skin, overprocessed beauty filter, low resolution, blur, nudity, explicit content',
          output_format: 'jpg',
          aspect_ratio: 'auto',
          resolution: '2K',
        },
      },
    ],
  },
  {
    slug: 'photo-restoration',
    title: 'Реставрация фото',
    shortDesc: 'Убираем царапины, шум, заломы и выцветание, сохраняя лица и атмосферу снимка.',
    description:
      'Загрузите старую, поврежденную или выцветшую фотографию. Сервис аккуратно уберет пыль, пятна, трещины, шум скана и следы времени, сохранив композицию, лица, одежду и естественную фактуру исходного снимка.\n\nЭто не фильтр и не полная перерисовка: задача сервиса - вернуть фотографии чистый архивный вид без потери узнаваемости людей и исторического настроения.\n\nПодходит для семейных архивов, печати, подарков и подготовки старых снимков к дальнейшей анимации.',
    category: 'NOSTALGIA',
    priceCoinsStandard: 20,
    priceCoinsPro: 35,
    isActive: true,
    isFeatured: true,
    sortOrder: 0,
    userInputForm: [
      {
        id: 'photo',
        type: 'photo',
        label: 'Фото',
        required: true,
        hint: 'Скан или фото снимка, JPG/PNG/WebP до 10MB',
        maxSizeMb: 10,
        allowedFormats: ['jpg', 'jpeg', 'png', 'webp'],
        allowStudioAvatars: true,
        allowSystemLibrary: false,
      },
      {
        id: 'restorationGoal',
        type: 'select',
        label: 'Что важнее',
        required: true,
        options: [
          { label: 'Бережно восстановить как архив', value: 'archival' },
          { label: 'Сделать ярче и чище', value: 'clean_modern' },
          { label: 'Восстановить лица', value: 'faces_first' },
          { label: 'Подготовить к печати', value: 'print_ready' },
        ],
      },
      { id: 'tier', type: 'tier', label: 'Качество', required: true },
    ],
    pipelineConfig: [
      {
        id: 'step_1',
        blockSlug: 'image-edit',
        input: '{{user.photo}}',
        params: {
          model: { standard: 'nano-banana', pro: 'nano-banana' },
          prompt:
            'Carefully restore the uploaded damaged or old photograph. Restoration priority: {{user.restorationGoal}}. Remove dust, scratches, stains, cracks, scanning noise, compression artifacts, and yellowing while preserving original identity, facial features, clothing, composition, historical mood, and natural texture. Recover realistic detail and balanced contrast. If color is faded, restore believable natural color; if the image is black-and-white, keep it black-and-white unless color is clearly appropriate. The result should look like a professional archival restoration, not a beauty filter or a new photo.',
          negative_prompt:
            'changed identity, waxy skin, over-smoothed faces, artificial colors, cartoon style, added people, text, watermark, distorted eyes, deformed hands, excessive sharpening, fake plastic retouch',
          output_format: 'jpg',
          aspect_ratio: 'auto',
          resolution: '1K',
        },
      },
    ],
  },
] satisfies CreateAdminServiceInput[];

async function main() {
  loadEnvFile();
  const validated = services.map(validateService);
  if (hasFlag('validate-only') || hasFlag('dry-run')) {
    console.log(`validated ${validated.length} admin services`);
    return;
  }

  const email = argValue('email') ?? localDefault(process.env.ADMIN_EMAIL ?? process.env.ADMIN_INITIAL_EMAIL, 'admin@allvision.studio');
  const password = argValue('password') ?? localDefault(process.env.ADMIN_PASSWORD ?? process.env.ADMIN_INITIAL_PASSWORD, 'admin123');
  if (!email || !password) {
    throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD, or pass --email=... --password=... for a non-local API.');
  }

  const loginResponse = await fetch(apiUrl('/api/auth/login'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!loginResponse.ok) {
    throw new Error(`Login failed: ${loginResponse.status} ${loginResponse.statusText}`);
  }
  const cookie = cookieHeader(loginResponse.headers);
  if (!cookie) throw new Error('Login did not return auth cookies.');

  const list = await requestJson<{ items: AdminServiceRecord[] }>('/api/admin/services?limit=200', { cookie });

  for (const service of validated) {
    const existing = list.items.find((item) => item.slug === service.slug);
    if (existing) {
      const { slug: _slug, sortOrder: _sortOrder, ...body } = service;
      await requestJson<{ service: AdminServiceRecord }>(`/api/admin/services/${existing.id}`, {
        method: 'PATCH',
        cookie,
        body: JSON.stringify(body satisfies UpdateAdminServiceInput),
      });
      console.log(`updated ${service.slug}`);
      continue;
    }

    const created = await requestJson<{ service: AdminServiceRecord }>('/api/admin/services', {
      method: 'POST',
      cookie,
      body: JSON.stringify(service),
    });
    console.log(`created ${created.service.slug}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
