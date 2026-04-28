import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import request from 'supertest';
import sharp from 'sharp';
import { EpisodeStatus, prisma } from '@allvision/database';
import { app } from '../app';
import { _resetProvidersForTests } from '../providers';
import { signAccessToken } from '../utils/jwt';
import * as fileService from '../services/file-service';

const RUN_ID = Date.now();
const ADMIN_EMAIL = `admin-templates-${RUN_ID}@example.com`;
const USER_EMAIL = `admin-templates-user-${RUN_ID}@example.com`;

let tmpDir: string;
let originalUploads: string | undefined;
let originalApiUrl: string | undefined;
let adminUserId: string;
let regularUserId: string;

function adminCookie(userId: string) {
  return [`accessToken=${signAccessToken(userId, 'ADMIN')}`];
}

function userCookie(userId: string) {
  return [`accessToken=${signAccessToken(userId, 'USER')}`];
}

async function imageBuffer(color = '#22aa88') {
  return sharp({
    create: { width: 32, height: 32, channels: 3, background: color },
  })
    .png()
    .toBuffer();
}

function videoBuffer() {
  return Buffer.from(`fake-template-video-${RUN_ID}`);
}

function rolesJson() {
  return JSON.stringify([{ role: 'main', required: true, label: 'Main character' }]);
}

async function cleanup() {
  const users = await prisma.user.findMany({
    where: { email: { in: [ADMIN_EMAIL, USER_EMAIL] } },
    select: { id: true },
  });
  const userIds = users.map((user) => user.id);

  if (userIds.length > 0) {
    await prisma.episodeCharacter.deleteMany({ where: { episode: { userId: { in: userIds } } } });
    await prisma.abuseReport.deleteMany({ where: { episode: { userId: { in: userIds } } } });
    await prisma.episode.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.tokenTransaction.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }

  await prisma.scenarioTemplate.deleteMany({ where: { slug: { contains: String(RUN_ID) } } });
}

async function createTemplate(data: Partial<{ slug: string; title: string; sortOrder: number; isActive: boolean; isFeatured: boolean }> = {}) {
  return prisma.scenarioTemplate.create({
    data: {
      slug: data.slug ?? `template-${RUN_ID}-${crypto.randomUUID()}`,
      title: data.title ?? `Template ${RUN_ID}`,
      shortDesc: 'Short description',
      description: 'Template description',
      category: 'birthday',
      previewVideo: `http://test.local:4000/static/template-assets/previews/${RUN_ID}.mp4`,
      previewImage: `http://test.local:4000/static/template-assets/images/${RUN_ID}.png`,
      promptTemplate: 'Hello {{character_main}}',
      characterRoles: [{ role: 'main', required: true, label: 'Main character' }],
      needsScene: false,
      recommendedDuration: 10,
      defaultStyle: 'cinematic',
      aiProvider: 'fal',
      aiModel: 'mock-model',
      aiConfig: {},
      priceTokens: 100,
      tags: ['test'],
      sortOrder: data.sortOrder ?? 100,
      isActive: data.isActive ?? true,
      isFeatured: data.isFeatured ?? false,
    },
  });
}

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'admin-templates-test-'));
  originalUploads = process.env.UPLOADS_DIR;
  originalApiUrl = process.env.PUBLIC_API_URL;
  process.env.UPLOADS_DIR = tmpDir;
  process.env.PUBLIC_API_URL = 'http://test.local:4000';
  _resetProvidersForTests();

  await cleanup();
  const admin = await prisma.user.create({
    data: { email: ADMIN_EMAIL, passwordHash: 'test', role: 'ADMIN', tokenBalance: 1000 },
  });
  const regular = await prisma.user.create({
    data: { email: USER_EMAIL, passwordHash: 'test', role: 'USER', tokenBalance: 1000 },
  });
  adminUserId = admin.id;
  regularUserId = regular.id;
});

afterEach(() => {
  jest.restoreAllMocks();
});

afterAll(async () => {
  await cleanup();
  process.env.UPLOADS_DIR = originalUploads;
  process.env.PUBLIC_API_URL = originalApiUrl;
  _resetProvidersForTests();
  fs.rmSync(tmpDir, { recursive: true, force: true });
  await prisma.$disconnect();
});

describe('/api/admin/scenario-templates', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/admin/scenario-templates');
    expect(res.status).toBe(401);
  });

  it('returns 403 FORBIDDEN_ADMIN_ONLY for a regular user', async () => {
    const res = await request(app)
      .get('/api/admin/scenario-templates')
      .set('Cookie', userCookie(regularUserId));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN_ADMIN_ONLY');
  });

  it('lists templates with filters', async () => {
    await createTemplate({ slug: `list-active-${RUN_ID}`, title: `List Active ${RUN_ID}`, isActive: true, isFeatured: true });
    await createTemplate({ slug: `list-hidden-${RUN_ID}`, title: `List Hidden ${RUN_ID}`, isActive: false, isFeatured: false });

    const res = await request(app)
      .get('/api/admin/scenario-templates')
      .query({ isActive: true, isFeatured: true, category: 'birthday', search: `Active ${RUN_ID}` })
      .set('Cookie', adminCookie(adminUserId));

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].title).toContain('Active');
  });

  it('creates a scenario template with assets', async () => {
    const res = await request(app)
      .post('/api/admin/scenario-templates')
      .set('Cookie', adminCookie(adminUserId))
      .field('slug', `create-template-${RUN_ID}`)
      .field('title', `Create Template ${RUN_ID}`)
      .field('shortDesc', 'Short')
      .field('description', 'Long description')
      .field('category', 'birthday')
      .field('promptTemplate', 'Make {{character_main}} shine')
      .field('characterRoles', rolesJson())
      .field('needsScene', 'false')
      .field('recommendedDuration', '10')
      .field('defaultStyle', 'cinematic')
      .field('aiProvider', 'fal')
      .field('aiModel', 'mock-video')
      .field('aiConfig', '{"temperature":0.4}')
      .field('priceTokens', '120')
      .field('tags', 'family,birthday')
      .field('isActive', 'true')
      .field('isFeatured', 'true')
      .attach('previewVideo', videoBuffer(), { filename: 'preview.mp4', contentType: 'video/mp4' })
      .attach('previewImage', await imageBuffer(), { filename: 'preview.png', contentType: 'image/png' });

    expect(res.status).toBe(201);
    expect(res.body.template.slug).toBe(`create-template-${RUN_ID}`);
    expect(res.body.template.previewVideo).toContain('/static/template-assets/previews/');
    expect(res.body.template.previewImage).toContain('/static/template-assets/images/');
    expect(res.body.template.tags).toEqual(['family', 'birthday']);
    expect(res.body.template.isFeatured).toBe(true);
  });

  it('returns 400 INVALID_AI_CONFIG for invalid aiConfig', async () => {
    const res = await request(app)
      .post('/api/admin/scenario-templates')
      .set('Cookie', adminCookie(adminUserId))
      .field('slug', `bad-ai-${RUN_ID}`)
      .field('title', `Bad AI ${RUN_ID}`)
      .field('shortDesc', 'Short')
      .field('description', 'Description')
      .field('category', 'birthday')
      .field('promptTemplate', 'Prompt {{character_main}}')
      .field('characterRoles', rolesJson())
      .field('aiModel', 'mock-video')
      .field('aiConfig', '{bad')
      .field('priceTokens', '100')
      .attach('previewVideo', videoBuffer(), { filename: 'preview.mp4', contentType: 'video/mp4' })
      .attach('previewImage', await imageBuffer(), { filename: 'preview.png', contentType: 'image/png' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_AI_CONFIG');
  });

  it('returns 400 INVALID_CHARACTER_ROLES for invalid roles', async () => {
    const res = await request(app)
      .post('/api/admin/scenario-templates')
      .set('Cookie', adminCookie(adminUserId))
      .field('slug', `bad-roles-${RUN_ID}`)
      .field('title', `Bad Roles ${RUN_ID}`)
      .field('shortDesc', 'Short')
      .field('description', 'Description')
      .field('category', 'birthday')
      .field('promptTemplate', 'Prompt {{character_main}}')
      .field('characterRoles', '{"role":"main"}')
      .field('aiModel', 'mock-video')
      .field('aiConfig', '{}')
      .field('priceTokens', '100')
      .attach('previewVideo', videoBuffer(), { filename: 'preview.mp4', contentType: 'video/mp4' })
      .attach('previewImage', await imageBuffer(), { filename: 'preview.png', contentType: 'image/png' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_CHARACTER_ROLES');
  });

  it('patches text fields', async () => {
    const template = await createTemplate({ slug: `patch-template-${RUN_ID}`, title: `Patch Template ${RUN_ID}` });

    const res = await request(app)
      .patch(`/api/admin/scenario-templates/${template.id}`)
      .set('Cookie', adminCookie(adminUserId))
      .field('title', `Patched Template ${RUN_ID}`)
      .field('priceTokens', '220')
      .field('isActive', 'false')
      .field('tags', 'patched,admin');

    expect(res.status).toBe(200);
    expect(res.body.template.title).toBe(`Patched Template ${RUN_ID}`);
    expect(res.body.template.priceTokens).toBe(220);
    expect(res.body.template.isActive).toBe(false);
    expect(res.body.template.tags).toEqual(['patched', 'admin']);
  });

  it('replaces files and deletes old assets after update', async () => {
    const created = await request(app)
      .post('/api/admin/scenario-templates')
      .set('Cookie', adminCookie(adminUserId))
      .field('slug', `replace-template-${RUN_ID}`)
      .field('title', `Replace Template ${RUN_ID}`)
      .field('shortDesc', 'Short')
      .field('description', 'Description')
      .field('category', 'birthday')
      .field('promptTemplate', 'Prompt {{character_main}}')
      .field('characterRoles', rolesJson())
      .field('aiModel', 'mock-video')
      .field('aiConfig', '{}')
      .field('priceTokens', '100')
      .attach('previewVideo', videoBuffer(), { filename: 'preview.mp4', contentType: 'video/mp4' })
      .attach('previewImage', await imageBuffer(), { filename: 'preview.png', contentType: 'image/png' });
    expect(created.status).toBe(201);

    const deleteSpy = jest.spyOn(fileService, 'deleteFile').mockResolvedValue(undefined);
    const res = await request(app)
      .patch(`/api/admin/scenario-templates/${created.body.template.id}`)
      .set('Cookie', adminCookie(adminUserId))
      .attach('previewImage', await imageBuffer('#aa4488'), { filename: 'new-preview.png', contentType: 'image/png' });

    expect(res.status).toBe(200);
    expect(deleteSpy).toHaveBeenCalledWith(expect.stringContaining('template-assets/images/'));
  });

  it('returns 409 TEMPLATE_IN_USE for active episodes', async () => {
    const template = await createTemplate({ slug: `in-use-template-${RUN_ID}` });
    await prisma.episode.create({
      data: {
        userId: regularUserId,
        templateId: template.id,
        title: `Template Active Episode ${RUN_ID}`,
        status: EpisodeStatus.PENDING,
        tokensCost: 1,
      },
    });

    const res = await request(app)
      .delete(`/api/admin/scenario-templates/${template.id}`)
      .set('Cookie', adminCookie(adminUserId));

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('TEMPLATE_IN_USE');
  });

  it('hard-deletes a template and deletes assets', async () => {
    const created = await request(app)
      .post('/api/admin/scenario-templates')
      .set('Cookie', adminCookie(adminUserId))
      .field('slug', `delete-template-${RUN_ID}`)
      .field('title', `Delete Template ${RUN_ID}`)
      .field('shortDesc', 'Short')
      .field('description', 'Description')
      .field('category', 'birthday')
      .field('promptTemplate', 'Prompt {{character_main}}')
      .field('characterRoles', rolesJson())
      .field('aiModel', 'mock-video')
      .field('aiConfig', '{}')
      .field('priceTokens', '100')
      .attach('previewVideo', videoBuffer(), { filename: 'preview.mp4', contentType: 'video/mp4' })
      .attach('previewImage', await imageBuffer(), { filename: 'preview.png', contentType: 'image/png' });
    expect(created.status).toBe(201);

    const deleteSpy = jest.spyOn(fileService, 'deleteFile').mockResolvedValue(undefined);
    const res = await request(app)
      .delete(`/api/admin/scenario-templates/${created.body.template.id}`)
      .set('Cookie', adminCookie(adminUserId));

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(deleteSpy).toHaveBeenCalledTimes(2);
    await expect(prisma.scenarioTemplate.findUniqueOrThrow({ where: { id: created.body.template.id } })).rejects.toThrow();
  });

  it('swaps sortOrder with a neighbor', async () => {
    const first = await createTemplate({ slug: `swap-a-${RUN_ID}`, title: `Swap A ${RUN_ID}`, sortOrder: 1000 });
    const second = await createTemplate({ slug: `swap-b-${RUN_ID}`, title: `Swap B ${RUN_ID}`, sortOrder: 1010 });

    const res = await request(app)
      .post(`/api/admin/scenario-templates/${second.id}/reorder`)
      .set('Cookie', adminCookie(adminUserId))
      .send({ direction: 'up' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, moved: true });

    const [updatedFirst, updatedSecond] = await Promise.all([
      prisma.scenarioTemplate.findUniqueOrThrow({ where: { id: first.id } }),
      prisma.scenarioTemplate.findUniqueOrThrow({ where: { id: second.id } }),
    ]);
    expect(updatedFirst.sortOrder).toBe(1010);
    expect(updatedSecond.sortOrder).toBe(1000);
  });
});
