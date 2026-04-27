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
} from '@allvision/database';
import { app } from '../app';
import { _resetProvidersForTests } from '../providers';
import * as queuesModule from '../queues';

const RUN_ID = Date.now();
const PASSWORD = 'password123';
const emails = {
  main: `projects-main-${RUN_ID}@example.com`,
  other: `projects-other-${RUN_ID}@example.com`,
  low: `projects-low-${RUN_ID}@example.com`,
  list: `projects-list-${RUN_ID}@example.com`,
};

let tmpDir: string;
let originalUploads: string | undefined;
let originalApiUrl: string | undefined;

async function cleanup() {
  const users = await prisma.user.findMany({
    where: { email: { contains: String(RUN_ID) } },
    select: { id: true },
  });
  const userIds = users.map((user) => user.id);
  if (userIds.length === 0) return;

  await prisma.tokenTransaction.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.project.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.order.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.payment.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

async function ensureService() {
  return prisma.service.upsert({
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
}

async function registerAgent(email: string, balance = 100) {
  const agent = request.agent(app);
  const res = await agent
    .post('/api/auth/register')
    .send({ email, password: PASSWORD, name: 'Projects User' });
  expect(res.status).toBe(201);
  const userId = res.body.user.id as string;
  await prisma.user.update({ where: { id: userId }, data: { tokenBalance: balance } });
  return { agent, userId };
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
  await ensureService();
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
    const { agent } = await registerAgent(emails.main);
    const res = await agent.post('/api/projects').field('serviceSlug', 'photo-restore');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('FILE_REQUIRED');
  });

  it('returns 400 for invalid MIME', async () => {
    const { agent } = await registerAgent(`projects-mime-${RUN_ID}@example.com`);
    const res = await agent
      .post('/api/projects')
      .field('serviceSlug', 'photo-restore')
      .attach('image', Buffer.from('text-buffer'), { filename: 'photo.txt', contentType: 'text/plain' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('UNSUPPORTED_FORMAT');
  });

  it('returns 404 for unknown service slug', async () => {
    const { agent } = await registerAgent(`projects-unknown-${RUN_ID}@example.com`);
    const res = await agent
      .post('/api/projects')
      .field('serviceSlug', 'unknown')
      .attach('image', await imageBuffer(), { filename: 'photo.png', contentType: 'image/png' });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('SERVICE_NOT_FOUND');
  });

  it('returns 400 for photo-animate while it is not implemented', async () => {
    const { agent } = await registerAgent(`projects-animate-${RUN_ID}@example.com`);
    const res = await agent
      .post('/api/projects')
      .field('serviceSlug', 'photo-animate')
      .attach('image', await imageBuffer(), { filename: 'photo.png', contentType: 'image/png' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('SERVICE_NOT_SUPPORTED_YET');
  });

  it('returns 402 when user has insufficient tokens', async () => {
    const { agent } = await registerAgent(emails.low, 10);
    const res = await agent
      .post('/api/projects')
      .field('serviceSlug', 'photo-restore')
      .attach('image', await imageBuffer(), { filename: 'photo.png', contentType: 'image/png' });
    expect(res.status).toBe(402);
    expect(res.body.error.code).toBe('INSUFFICIENT_TOKENS');
  });

  it('creates a pending project, charges tokens and enqueues a job', async () => {
    const { agent, userId } = await registerAgent(`projects-happy-${RUN_ID}@example.com`, 100);
    const addJobSpy = jest.spyOn(queuesModule, 'addProjectJob').mockResolvedValue({ id: 'job-1' } as any);

    const res = await agent
      .post('/api/projects')
      .field('serviceSlug', 'photo-restore')
      .attach('image', await imageBuffer(), { filename: 'photo.png', contentType: 'image/png' });

    expect(res.status).toBe(201);
    expect(res.body.project.status).toBe(ProjectStatus.PENDING);
    expect(res.body.project.progress).toBe(0);
    expect(res.body.project.tokensCost).toBe(20);

    const project = await prisma.project.findUniqueOrThrow({ where: { id: res.body.project.id } });
    expect(project.userId).toBe(userId);
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
    expect(addJobSpy.mock.calls[0][1]).toMatchObject({
      projectId: project.id,
      userId,
      inputImageUrl: project.inputImages[0],
    });
  });
});

describe('GET /api/projects', () => {
  it('returns 404 for another user project', async () => {
    const service = await ensureService();
    const owner = await registerAgent(`projects-owner-${RUN_ID}@example.com`);
    const other = await registerAgent(emails.other);
    const project = await prisma.project.create({
      data: {
        userId: owner.userId,
        serviceId: service.id,
        title: 'Private project',
        inputImages: ['http://example.com/photo.png'],
        tokensCost: 20,
      },
    });

    const res = await other.agent.get(`/api/projects/${project.id}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('PROJECT_NOT_FOUND');
  });

  it('paginates user projects', async () => {
    const service = await ensureService();
    const { agent, userId } = await registerAgent(emails.list);

    await prisma.project.createMany({
      data: Array.from({ length: 25 }).map((_, index) => ({
        userId,
        serviceId: service.id,
        title: `List project ${String(index + 1).padStart(2, '0')}`,
        inputImages: [`http://example.com/${index}.png`],
        tokensCost: 20,
        createdAt: new Date(Date.now() + index * 1000),
      })),
    });

    const res = await agent.get('/api/projects?page=2&limit=10');
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(10);
    expect(res.body.total).toBe(25);
    expect(res.body.page).toBe(2);
    expect(res.body.limit).toBe(10);
  });
});
