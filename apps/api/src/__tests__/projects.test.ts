import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import sharp from 'sharp';
import {
  prisma,
  ProcessingType,
  ProjectStatus,
  ServiceCategory,
  type Service,
  type Trend,
} from '@allvision/database';
import { QUEUE_NAMES } from '@allvision/shared';
import { app } from '../app';
import { _resetProvidersForTests } from '../providers';
import { signAccessToken } from '../utils/jwt';
import * as queuesModule from '../queues';

const RUN_ID = Date.now();
const TEST_SERVICE_SLUG = `trend-mismatch-${RUN_ID}`;
const TEST_TREND_TITLE = `Project trend ${RUN_ID}`;
const MISMATCH_TREND_TITLE = `Project mismatch trend ${RUN_ID}`;

let tmpDir: string;
let originalUploads: string | undefined;
let originalApiUrl: string | undefined;
let photoRestore: Service;
let photoAnimate: Service;
let trendsService: Service;
let mismatchService: Service;
let testTrend: Trend;
let mismatchTrend: Trend;

function authCookie(userId: string) {
  return [`accessToken=${signAccessToken(userId, 'USER')}`];
}

async function cleanup() {
  const users = await prisma.user.findMany({
    where: { email: { contains: String(RUN_ID) } },
    select: { id: true },
  });
  const userIds = users.map((user) => user.id);

  if (userIds.length > 0) {
    await prisma.tokenTransaction.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.project.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.order.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.payment.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }

  await prisma.trend.deleteMany({ where: { title: { in: [TEST_TREND_TITLE, MISMATCH_TREND_TITLE] } } });
  await prisma.service.deleteMany({ where: { slug: TEST_SERVICE_SLUG } });
}

async function ensureServices() {
  photoRestore = await prisma.service.upsert({
    where: { slug: 'photo-restore' },
    update: { priceTokens: 20, isActive: true },
    create: {
      slug: 'photo-restore',
      title: 'Photo restore',
      shortDesc: 'Restore photo',
      description: 'Restore photo',
      category: ServiceCategory.PHOTO_RESTORE,
      priceTokens: 20,
      costUsd: 0.05,
      galleryImages: [],
      isActive: true,
      processingType: ProcessingType.AUTO,
      aiProvider: 'mock',
      aiModel: 'mock-photo-restore',
      aiConfig: {},
      sortOrder: 10,
    },
  });

  photoAnimate = await prisma.service.upsert({
    where: { slug: 'photo-animate' },
    update: { priceTokens: 80, isActive: true },
    create: {
      slug: 'photo-animate',
      title: 'Photo animate',
      shortDesc: 'Animate photo',
      description: 'Animate photo',
      category: ServiceCategory.PHOTO_ANIMATE,
      priceTokens: 80,
      costUsd: 0.16,
      galleryImages: [],
      isActive: true,
      processingType: ProcessingType.AUTO,
      aiProvider: 'mock',
      aiModel: 'mock-photo-animate',
      aiConfig: {},
      sortOrder: 20,
    },
  });

  trendsService = await prisma.service.upsert({
    where: { slug: 'trends' },
    update: { priceTokens: 150, isActive: true },
    create: {
      slug: 'trends',
      title: 'Trends',
      shortDesc: 'Trend video',
      description: 'Trend video',
      category: ServiceCategory.TREND,
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

  mismatchService = await prisma.service.create({
    data: {
      slug: TEST_SERVICE_SLUG,
      title: 'Mismatch service',
      shortDesc: 'Mismatch',
      description: 'Mismatch',
      category: ServiceCategory.PHOTO_RESTORE,
      priceTokens: 1,
      costUsd: 0,
      galleryImages: [],
      isActive: true,
      processingType: ProcessingType.AUTO,
      aiProvider: 'mock',
      aiModel: 'mock',
      aiConfig: {},
      sortOrder: 999,
    },
  });

  testTrend = await prisma.trend.create({
    data: {
      title: TEST_TREND_TITLE,
      description: 'Trend for project tests',
      previewVideo: 'http://example.com/preview.mp4',
      referenceImg: 'http://example.com/reference.jpg',
      prompt: 'Make a vertical test trend video',
      aiProvider: 'mock',
      aiModel: 'mock-trend',
      aiConfig: {},
      tags: ['test'],
      priceTokens: 150,
      isActive: true,
      sortOrder: 999,
      serviceId: trendsService.id,
    },
  });

  mismatchTrend = await prisma.trend.create({
    data: {
      title: MISMATCH_TREND_TITLE,
      description: 'Trend for mismatch tests',
      previewVideo: 'http://example.com/mismatch.mp4',
      referenceImg: 'http://example.com/mismatch.jpg',
      prompt: 'Mismatch prompt',
      aiProvider: 'mock',
      aiModel: 'mock-trend',
      aiConfig: {},
      tags: ['test'],
      priceTokens: 150,
      isActive: true,
      sortOrder: 1000,
      serviceId: mismatchService.id,
    },
  });
}

async function createAuthedUser(email: string, balance = 100) {
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: 'test-password-hash',
      name: 'Projects User',
      tokenBalance: balance,
    },
  });
  return { userId: user.id, cookie: authCookie(user.id) };
}

async function imageBuffer() {
  return sharp({
    create: { width: 32, height: 32, channels: 3, background: '#7755ff' },
  })
    .png()
    .toBuffer();
}

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-test-'));
  originalUploads = process.env.UPLOADS_DIR;
  originalApiUrl = process.env.PUBLIC_API_URL;
  process.env.UPLOADS_DIR = tmpDir;
  process.env.PUBLIC_API_URL = 'http://test.local:4000';
  _resetProvidersForTests();

  await cleanup();
  await ensureServices();
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

describe('POST /api/projects', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app)
      .post('/api/projects')
      .field('serviceSlug', 'photo-restore')
      .attach('image', await imageBuffer(), { filename: 'photo.png', contentType: 'image/png' });
    expect(res.status).toBe(401);
  });

  it('returns 400 without file', async () => {
    const { cookie } = await createAuthedUser(`projects-main-${RUN_ID}@example.com`);
    const res = await request(app)
      .post('/api/projects')
      .set('Cookie', cookie)
      .field('serviceSlug', 'photo-restore');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('FILE_REQUIRED');
  });

  it('returns 400 for invalid MIME', async () => {
    const { cookie } = await createAuthedUser(`projects-mime-${RUN_ID}@example.com`);
    const res = await request(app)
      .post('/api/projects')
      .set('Cookie', cookie)
      .field('serviceSlug', 'photo-restore')
      .attach('image', Buffer.from('text-buffer'), { filename: 'photo.txt', contentType: 'text/plain' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('UNSUPPORTED_FORMAT');
  });

  it('returns 404 for unknown service slug', async () => {
    const { cookie } = await createAuthedUser(`projects-unknown-${RUN_ID}@example.com`);
    const res = await request(app)
      .post('/api/projects')
      .set('Cookie', cookie)
      .field('serviceSlug', 'unknown')
      .attach('image', await imageBuffer(), { filename: 'photo.png', contentType: 'image/png' });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('SERVICE_NOT_FOUND');
  });

  it('returns 402 when user has insufficient tokens', async () => {
    const { cookie } = await createAuthedUser(`projects-low-${RUN_ID}@example.com`, 10);
    const res = await request(app)
      .post('/api/projects')
      .set('Cookie', cookie)
      .field('serviceSlug', 'photo-restore')
      .attach('image', await imageBuffer(), { filename: 'photo.png', contentType: 'image/png' });
    expect(res.status).toBe(402);
    expect(res.body.error.code).toBe('INSUFFICIENT_TOKENS');
  });

  it('returns 402 when photo-animate balance is below 80 tokens', async () => {
    const { cookie } = await createAuthedUser(`projects-animate-low-${RUN_ID}@example.com`, 79);
    const res = await request(app)
      .post('/api/projects')
      .set('Cookie', cookie)
      .field('serviceSlug', 'photo-animate')
      .attach('image', await imageBuffer(), { filename: 'photo.png', contentType: 'image/png' });
    expect(res.status).toBe(402);
    expect(res.body.error.code).toBe('INSUFFICIENT_TOKENS');
  });

  it('creates a photo-restore project, charges tokens and enqueues a job', async () => {
    const { cookie, userId } = await createAuthedUser(`projects-restore-${RUN_ID}@example.com`, 100);
    const addJobSpy = jest.spyOn(queuesModule, 'addProjectJob').mockResolvedValue({ id: 'job-1' } as any);

    const res = await request(app)
      .post('/api/projects')
      .set('Cookie', cookie)
      .field('serviceSlug', 'photo-restore')
      .attach('image', await imageBuffer(), { filename: 'photo.png', contentType: 'image/png' });

    expect(res.status).toBe(201);
    expect(res.body.project.status).toBe(ProjectStatus.PENDING);
    expect(res.body.project.progress).toBe(0);
    expect(res.body.project.tokensCost).toBe(20);

    const project = await prisma.project.findUniqueOrThrow({ where: { id: res.body.project.id } });
    expect(project.userId).toBe(userId);
    expect(project.serviceId).toBe(photoRestore.id);
    expect(project.status).toBe(ProjectStatus.PENDING);
    expect(project.inputImages).toHaveLength(1);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.tokenBalance).toBe(80);

    const tx = await prisma.tokenTransaction.findFirstOrThrow({
      where: { userId, refId: project.id, reason: 'spending' },
    });
    expect(tx.amount).toBe(-20);
    expect(tx.balanceAfter).toBe(80);

    expect(addJobSpy).toHaveBeenCalledTimes(1);
    expect(addJobSpy.mock.calls[0][0]).toBe(QUEUE_NAMES.PHOTO_RESTORE);
    expect(addJobSpy.mock.calls[0][1]).toMatchObject({
      projectId: project.id,
      userId,
      serviceId: photoRestore.id,
      inputImages: [project.inputImages[0]],
    });
    expect(addJobSpy.mock.calls[0][1]).not.toHaveProperty('inputImageUrl');
  });

  it('creates a photo-animate project, charges 80 tokens and enqueues a job', async () => {
    const { cookie, userId } = await createAuthedUser(`projects-animate-${RUN_ID}@example.com`, 200);
    const addJobSpy = jest.spyOn(queuesModule, 'addProjectJob').mockResolvedValue({ id: 'job-2' } as any);

    const res = await request(app)
      .post('/api/projects')
      .set('Cookie', cookie)
      .field('serviceSlug', 'photo-animate')
      .attach('image', await imageBuffer(), { filename: 'photo.png', contentType: 'image/png' });

    expect(res.status).toBe(201);
    expect(res.body.project.tokensCost).toBe(80);

    const project = await prisma.project.findUniqueOrThrow({ where: { id: res.body.project.id } });
    expect(project.serviceId).toBe(photoAnimate.id);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.tokenBalance).toBe(120);

    expect(addJobSpy).toHaveBeenCalledWith(
      QUEUE_NAMES.PHOTO_ANIMATE,
      expect.objectContaining({
        projectId: project.id,
        userId,
        serviceId: photoAnimate.id,
        inputImages: [project.inputImages[0]],
      }),
    );
  });

  it('returns 400 TREND_REQUIRED for trends without trendId', async () => {
    const { cookie } = await createAuthedUser(`projects-trend-required-${RUN_ID}@example.com`, 200);
    const res = await request(app)
      .post('/api/projects')
      .set('Cookie', cookie)
      .field('serviceSlug', 'trends')
      .attach('image', await imageBuffer(), { filename: 'photo.png', contentType: 'image/png' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('TREND_REQUIRED');
  });

  it('returns 404 TREND_NOT_FOUND for missing trendId', async () => {
    const { cookie } = await createAuthedUser(`projects-trend-missing-${RUN_ID}@example.com`, 200);
    const res = await request(app)
      .post('/api/projects')
      .set('Cookie', cookie)
      .field('serviceSlug', 'trends')
      .field('trendId', 'missing-trend-id')
      .attach('image', await imageBuffer(), { filename: 'photo.png', contentType: 'image/png' });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('TREND_NOT_FOUND');
  });

  it('returns 400 TREND_SERVICE_MISMATCH for a trend from another service', async () => {
    const { cookie } = await createAuthedUser(`projects-trend-mismatch-${RUN_ID}@example.com`, 200);
    const res = await request(app)
      .post('/api/projects')
      .set('Cookie', cookie)
      .field('serviceSlug', 'trends')
      .field('trendId', mismatchTrend.id)
      .attach('image', await imageBuffer(), { filename: 'photo.png', contentType: 'image/png' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('TREND_SERVICE_MISMATCH');
  });

  it('creates a trends project, charges 150 tokens and enqueues a trend job', async () => {
    const { cookie, userId } = await createAuthedUser(`projects-trend-happy-${RUN_ID}@example.com`, 300);
    const addJobSpy = jest.spyOn(queuesModule, 'addProjectJob').mockResolvedValue({ id: 'job-3' } as any);

    const res = await request(app)
      .post('/api/projects')
      .set('Cookie', cookie)
      .field('serviceSlug', 'trends')
      .field('trendId', testTrend.id)
      .attach('image', await imageBuffer(), { filename: 'photo.png', contentType: 'image/png' });

    expect(res.status).toBe(201);
    expect(res.body.project.tokensCost).toBe(150);

    const project = await prisma.project.findUniqueOrThrow({ where: { id: res.body.project.id } });
    expect(project.serviceId).toBe(trendsService.id);
    expect(project.trendId).toBe(testTrend.id);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.tokenBalance).toBe(150);

    expect(addJobSpy).toHaveBeenCalledWith(
      QUEUE_NAMES.TREND,
      expect.objectContaining({
        projectId: project.id,
        userId,
        serviceId: trendsService.id,
        trendId: testTrend.id,
        inputImages: [project.inputImages[0]],
      }),
    );
  });
});

describe('GET /api/projects', () => {
  it('returns 404 for another user project', async () => {
    const owner = await createAuthedUser(`projects-owner-${RUN_ID}@example.com`);
    const other = await createAuthedUser(`projects-other-${RUN_ID}@example.com`);
    const project = await prisma.project.create({
      data: {
        userId: owner.userId,
        serviceId: photoRestore.id,
        title: 'Private project',
        inputImages: ['http://example.com/photo.png'],
        tokensCost: 20,
      },
    });

    const res = await request(app)
      .get(`/api/projects/${project.id}`)
      .set('Cookie', other.cookie);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('PROJECT_NOT_FOUND');
  });

  it('paginates user projects', async () => {
    const { cookie, userId } = await createAuthedUser(`projects-list-${RUN_ID}@example.com`);

    await prisma.project.createMany({
      data: Array.from({ length: 25 }).map((_, index) => ({
        userId,
        serviceId: photoRestore.id,
        title: `List project ${String(index + 1).padStart(2, '0')}`,
        inputImages: [`http://example.com/${index}.png`],
        tokensCost: 20,
        createdAt: new Date(Date.now() + index * 1000),
      })),
    });

    const res = await request(app)
      .get('/api/projects?page=2&limit=10')
      .set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(10);
    expect(res.body.total).toBe(25);
    expect(res.body.page).toBe(2);
    expect(res.body.limit).toBe(10);
  });
});
