import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import sharp from 'sharp';
import {
  prisma,
  ProcessingType,
  ProjectStatus,
  type Service,
  type Trend,
} from '@allvision/database';
import { app } from '../app';
import { _resetProvidersForTests } from '../providers';
import { signAccessToken } from '../utils/jwt';
import * as fileService from '../services/file-service';

const RUN_ID = Date.now();
const ADMIN_EMAIL = `admin-trends-${RUN_ID}@example.ru`;
const USER_EMAIL = `admin-trends-user-${RUN_ID}@example.ru`;
const OTHER_SERVICE_SLUG = `admin-other-${RUN_ID}`;

let tmpDir: string;
let originalUploads: string | undefined;
let originalApiUrl: string | undefined;
let trendsService: Service;
let otherService: Service;
let adminUserId: string;
let regularUserId: string;

function authCookie(userId: string) {
  return [`accessToken=${signAccessToken(userId, 'ADMIN')}`];
}

function userCookie(userId: string) {
  return [`accessToken=${signAccessToken(userId, 'USER')}`];
}

async function imageBuffer() {
  return sharp({
    create: { width: 32, height: 32, channels: 3, background: '#44aa88' },
  })
    .png()
    .toBuffer();
}

function videoBuffer() {
  return Buffer.from(`fake-video-${RUN_ID}`);
}

async function cleanup() {
  const users = await prisma.user.findMany({
    where: { email: { in: [ADMIN_EMAIL, USER_EMAIL] } },
    select: { id: true },
  });
  const userIds = users.map((user) => user.id);
  if (userIds.length > 0) {
    await prisma.tokenTransaction.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.project.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }

  await prisma.project.deleteMany({ where: { title: { contains: String(RUN_ID) } } });
  await prisma.trend.deleteMany({ where: { title: { contains: String(RUN_ID) } } });
  await prisma.service.deleteMany({ where: { slug: OTHER_SERVICE_SLUG } });
}

async function createTrend(data: Partial<Trend> = {}) {
  return prisma.trend.create({
    data: {
      title: data.title ?? `Admin Trend ${RUN_ID}`,
      description: data.description ?? 'Admin trend description',
      previewVideo: data.previewVideo ?? `http://example.com/${RUN_ID}.mp4`,
      referenceImg: data.referenceImg ?? `http://example.com/${RUN_ID}.png`,
      prompt: data.prompt ?? 'Make an admin trend',
      aiProvider: data.aiProvider ?? 'mock',
      aiModel: data.aiModel ?? 'mock-trend',
      aiConfig: (data.aiConfig as object | undefined) ?? {},
      tags: data.tags ?? ['admin'],
      priceTokens: data.priceTokens ?? null,
      isActive: data.isActive ?? true,
      sortOrder: data.sortOrder ?? 100,
      usedCount: data.usedCount ?? 0,
      serviceId: data.serviceId ?? trendsService.id,
    },
  });
}

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'admin-trends-test-'));
  originalUploads = process.env.UPLOADS_DIR;
  originalApiUrl = process.env.PUBLIC_API_URL;
  process.env.UPLOADS_DIR = tmpDir;
  process.env.PUBLIC_API_URL = 'http://test.local:4000';
  _resetProvidersForTests();

  await cleanup();

  trendsService = await prisma.service.upsert({
    where: { slug: 'trends' },
    update: { priceTokens: 150, isActive: true },
    create: {
      slug: 'trends',
      title: 'Trends',
      shortDesc: 'Trend video',
      description: 'Trend video',
      category: "TREND",
      priceTokens: 150,
      costUsd: 0.3,
      galleryImages: [],
      isActive: true,
      processingType: ProcessingType.AUTO,
      aiProvider: 'mock',
      aiModel: 'mock-trend',
      aiConfig: {},
      sortOrder: 30,
    },
  });

  otherService = await prisma.service.create({
    data: {
      slug: OTHER_SERVICE_SLUG,
      title: 'Other Admin Service',
      shortDesc: 'Other',
      description: 'Other',
      category: "PHOTO_RESTORE",
      priceTokens: 20,
      costUsd: 0.1,
      galleryImages: [],
      isActive: true,
      processingType: ProcessingType.AUTO,
      aiProvider: 'mock',
      aiModel: 'mock',
      aiConfig: {},
      sortOrder: 999,
    },
  });

  const admin = await prisma.user.create({
    data: {
      email: ADMIN_EMAIL,
      passwordHash: 'test',
      role: 'ADMIN',
      tokenBalance: 1000,
    },
  });
  adminUserId = admin.id;

  const regular = await prisma.user.create({
    data: {
      email: USER_EMAIL,
      passwordHash: 'test',
      role: 'USER',
      tokenBalance: 1000,
    },
  });
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

describe('/api/admin/trends', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/admin/trends');
    expect(res.status).toBe(401);
  });

  it('returns 403 FORBIDDEN_ADMIN_ONLY for a regular user', async () => {
    const res = await request(app)
      .get('/api/admin/trends')
      .set('Cookie', userCookie(regularUserId));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN_ADMIN_ONLY');
  });

  it('lists trends with filters and search', async () => {
    await createTrend({ title: `Admin List Active ${RUN_ID}`, isActive: true, sortOrder: 10 });
    await createTrend({ title: `Admin List Hidden ${RUN_ID}`, isActive: false, sortOrder: 20 });
    await createTrend({
      title: `Admin List Other ${RUN_ID}`,
      serviceId: otherService.id,
      isActive: true,
      sortOrder: 30,
    });

    const hidden = await request(app)
      .get('/api/admin/trends')
      .query({ isActive: false, search: `Hidden ${RUN_ID}` })
      .set('Cookie', authCookie(adminUserId));
    expect(hidden.status).toBe(200);
    expect(hidden.body.items).toHaveLength(1);
    expect(hidden.body.items[0].title).toContain('Hidden');

    const trendsOnly = await request(app)
      .get('/api/admin/trends')
      .query({ serviceSlug: 'trends', search: `Admin List ${RUN_ID}` })
      .set('Cookie', authCookie(adminUserId));
    expect(trendsOnly.status).toBe(200);
    expect(trendsOnly.body.items.every((trend: { service: { slug: string } }) => trend.service.slug === 'trends')).toBe(true);
  });

  it('creates a trend with assets and increments sortOrder', async () => {
    await createTrend({ title: `Admin Create Base ${RUN_ID}`, sortOrder: 500 });

    const res = await request(app)
      .post('/api/admin/trends')
      .set('Cookie', authCookie(adminUserId))
      .field('title', `Admin Create ${RUN_ID}`)
      .field('description', 'Created from admin')
      .field('prompt', 'Create a vivid trend')
      .field('serviceSlug', 'trends')
      .field('aiModel', 'mock-trend-v1')
      .field('aiConfig', '{"temperature":0.3}')
      .field('priceTokens', '250')
      .field('isActive', 'true')
      .attach('previewVideo', videoBuffer(), { filename: 'preview.mp4', contentType: 'video/mp4' })
      .attach('thumbnail', await imageBuffer(), { filename: 'thumb.png', contentType: 'image/png' });

    expect(res.status).toBe(201);
    expect(res.body.trend.title).toBe(`Admin Create ${RUN_ID}`);
    expect(res.body.trend.priceTokens).toBe(250);
    expect(res.body.trend.sortOrder).toBeGreaterThan(500);
    expect(res.body.trend.previewVideo).toContain('/static/trend-assets/previews/');
    expect(res.body.trend.referenceImg).toContain('/static/trend-assets/thumbnails/');
  });

  it('returns 400 without required files', async () => {
    const res = await request(app)
      .post('/api/admin/trends')
      .set('Cookie', authCookie(adminUserId))
      .field('title', `Admin Missing Files ${RUN_ID}`)
      .field('description', 'Missing files')
      .field('prompt', 'Prompt')
      .field('serviceSlug', 'trends')
      .field('aiModel', 'mock-trend-v1');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('FILE_REQUIRED');
  });

  it('returns 400 INVALID_AI_CONFIG for invalid JSON', async () => {
    const res = await request(app)
      .post('/api/admin/trends')
      .set('Cookie', authCookie(adminUserId))
      .field('title', `Admin Bad Json ${RUN_ID}`)
      .field('description', 'Bad json')
      .field('prompt', 'Prompt')
      .field('serviceSlug', 'trends')
      .field('aiModel', 'mock-trend-v1')
      .field('aiConfig', '{bad')
      .attach('previewVideo', videoBuffer(), { filename: 'preview.mp4', contentType: 'video/mp4' })
      .attach('thumbnail', await imageBuffer(), { filename: 'thumb.png', contentType: 'image/png' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_AI_CONFIG');
  });

  it('updates text fields', async () => {
    const trend = await createTrend({ title: `Admin Patch Text ${RUN_ID}` });

    const res = await request(app)
      .patch(`/api/admin/trends/${trend.id}`)
      .set('Cookie', authCookie(adminUserId))
      .field('title', `Admin Patched ${RUN_ID}`)
      .field('description', 'Updated description')
      .field('prompt', 'Updated prompt')
      .field('priceTokens', '')
      .field('isActive', 'false');

    expect(res.status).toBe(200);
    expect(res.body.trend.title).toBe(`Admin Patched ${RUN_ID}`);
    expect(res.body.trend.priceTokens).toBeNull();
    expect(res.body.trend.isActive).toBe(false);
  });

  it('replaces a file and deletes the old asset after update', async () => {
    const created = await request(app)
      .post('/api/admin/trends')
      .set('Cookie', authCookie(adminUserId))
      .field('title', `Admin Replace ${RUN_ID}`)
      .field('description', 'Replace file')
      .field('prompt', 'Prompt')
      .field('serviceSlug', 'trends')
      .field('aiModel', 'mock-trend-v1')
      .attach('previewVideo', videoBuffer(), { filename: 'preview.mp4', contentType: 'video/mp4' })
      .attach('thumbnail', await imageBuffer(), { filename: 'thumb.png', contentType: 'image/png' });
    expect(created.status).toBe(201);

    const deleteSpy = jest.spyOn(fileService, 'deleteFile').mockResolvedValue(undefined);
    const res = await request(app)
      .patch(`/api/admin/trends/${created.body.trend.id}`)
      .set('Cookie', authCookie(adminUserId))
      .attach('thumbnail', await imageBuffer(), { filename: 'new-thumb.png', contentType: 'image/png' });

    expect(res.status).toBe(200);
    expect(deleteSpy).toHaveBeenCalledWith(expect.stringContaining('trend-assets/thumbnails/'));
  });

  it('returns 404 when deleting a missing trend', async () => {
    const res = await request(app)
      .delete('/api/admin/trends/missing-trend')
      .set('Cookie', authCookie(adminUserId));
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('TREND_NOT_FOUND');
  });

  it('returns 409 TREND_IN_USE for active projects', async () => {
    const trend = await createTrend({ title: `Admin In Use ${RUN_ID}` });
    await prisma.project.create({
      data: {
        userId: regularUserId,
        serviceId: trendsService.id,
        trendId: trend.id,
        title: `Active project ${RUN_ID}`,
        status: ProjectStatus.PENDING,
        inputImages: ['http://example.com/input.png'],
        tokensCost: 150,
      },
    });

    const res = await request(app)
      .delete(`/api/admin/trends/${trend.id}`)
      .set('Cookie', authCookie(adminUserId));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('TREND_IN_USE');
  });

  it('hard-deletes a trend and deletes assets', async () => {
    const created = await request(app)
      .post('/api/admin/trends')
      .set('Cookie', authCookie(adminUserId))
      .field('title', `Admin Delete ${RUN_ID}`)
      .field('description', 'Delete file')
      .field('prompt', 'Prompt')
      .field('serviceSlug', 'trends')
      .field('aiModel', 'mock-trend-v1')
      .attach('previewVideo', videoBuffer(), { filename: 'preview.mp4', contentType: 'video/mp4' })
      .attach('thumbnail', await imageBuffer(), { filename: 'thumb.png', contentType: 'image/png' });
    expect(created.status).toBe(201);

    const deleteSpy = jest.spyOn(fileService, 'deleteFile').mockResolvedValue(undefined);
    const res = await request(app)
      .delete(`/api/admin/trends/${created.body.trend.id}`)
      .set('Cookie', authCookie(adminUserId));

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(deleteSpy).toHaveBeenCalledTimes(2);
    await expect(prisma.trend.findUniqueOrThrow({ where: { id: created.body.trend.id } })).rejects.toThrow();
  });

  it('returns moved false when reordering the top trend up', async () => {
    const top = await createTrend({ title: `Admin Top ${RUN_ID}`, sortOrder: -100 });

    const res = await request(app)
      .post(`/api/admin/trends/${top.id}/reorder`)
      .set('Cookie', authCookie(adminUserId))
      .send({ direction: 'up' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, moved: false });
  });

  it('swaps sortOrder with a neighbor', async () => {
    const first = await createTrend({ title: `Admin Swap A ${RUN_ID}`, sortOrder: 700 });
    const second = await createTrend({ title: `Admin Swap B ${RUN_ID}`, sortOrder: 710 });

    const res = await request(app)
      .post(`/api/admin/trends/${second.id}/reorder`)
      .set('Cookie', authCookie(adminUserId))
      .send({ direction: 'up' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, moved: true });

    const [updatedFirst, updatedSecond] = await Promise.all([
      prisma.trend.findUniqueOrThrow({ where: { id: first.id } }),
      prisma.trend.findUniqueOrThrow({ where: { id: second.id } }),
    ]);
    expect(updatedFirst.sortOrder).toBe(710);
    expect(updatedSecond.sortOrder).toBe(700);
  });
});
