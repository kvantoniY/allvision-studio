import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import sharp from 'sharp';
import {
  prisma,
  ProcessingType,
  type Service,
} from '@allvision/database';
import { app } from '../app';
import { _resetProvidersForTests } from '../providers';
import { signAccessToken } from '../utils/jwt';
import * as queuesModule from '../queues';

const RUN_ID = Date.now();

let tmpDir: string;
let originalUploads: string | undefined;
let originalApiUrl: string | undefined;
let userId: string;
let lowBalanceUserId: string;

function authCookie(id: string) {
  return [`accessToken=${signAccessToken(id, 'USER')}`];
}

async function imageBuffer() {
  return sharp({
    create: { width: 40, height: 40, channels: 3, background: '#aa44dd' },
  })
    .png()
    .toBuffer();
}

function serviceData(slug = `launch-service-${RUN_ID}-${Math.random().toString(16).slice(2)}`) {
  return {
    slug,
    title: `Launch service ${RUN_ID}`,
    shortDesc: 'Short launch description',
    description: 'Long launch description',
    category: "NOSTALGIA",
    priceTokens: 100,
    priceCoinsStandard: 100,
    priceCoinsPro: 250,
    costUsd: 0,
    galleryImages: [],
    isActive: true,
    isFeatured: false,
    sortOrder: 1000,
    aiProvider: 'mock',
    aiModel: 'mock-data-driven-pipeline',
    aiConfig: {},
    processingType: ProcessingType.AUTO,
    pipelineConfig: [
      {
        id: 'step_1',
        blockSlug: 'image-restore',
        input: '{{user.photo}}',
        params: { model: { standard: 'mock-restore', pro: 'mock-restore' } },
      },
      {
        id: 'step_2',
        blockSlug: 'image-to-video',
        input: '{{step_1.output}}',
        params: { duration: 5, model: { standard: 'kling-std', pro: 'kling-pro' } },
      },
    ],
    userInputForm: [
      { id: 'photo', type: 'photo', label: 'Photo', required: true },
      {
        id: 'mood',
        type: 'select',
        label: 'Mood',
        required: true,
        options: [
          { label: 'Warm', value: 'warm' },
          { label: 'Funny', value: 'funny' },
        ],
      },
      { id: 'caption', type: 'text', label: 'Caption', required: false, maxLength: 80 },
      { id: 'tier', type: 'tier', label: 'Quality', required: true },
    ],
  };
}

async function createService(data = serviceData()): Promise<Service> {
  return prisma.service.create({ data });
}

async function cleanup() {
  const users = await prisma.user.findMany({
    where: { email: { contains: `launch-${RUN_ID}` } },
    select: { id: true },
  });
  const userIds = users.map((user) => user.id);
  if (userIds.length > 0) {
    await prisma.tokenTransaction.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.project.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
  await prisma.service.deleteMany({ where: { slug: { contains: `launch-service-${RUN_ID}` } } });
}

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'services-launch-test-'));
  originalUploads = process.env.UPLOADS_DIR;
  originalApiUrl = process.env.PUBLIC_API_URL;
  process.env.UPLOADS_DIR = tmpDir;
  process.env.PUBLIC_API_URL = 'http://test.local:4000';
  _resetProvidersForTests();
  await cleanup();
  const [user, lowBalanceUser] = await Promise.all([
    prisma.user.create({
      data: {
        email: `launch-user-${RUN_ID}@example.ru`,
        passwordHash: 'hash',
        tokenBalance: 1000,
      },
    }),
    prisma.user.create({
      data: {
        email: `launch-low-${RUN_ID}@example.ru`,
        passwordHash: 'hash',
        tokenBalance: 10,
      },
    }),
  ]);
  userId = user.id;
  lowBalanceUserId = lowBalanceUser.id;
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

describe('POST /api/services/:slug/launch', () => {
  it('requires auth', async () => {
    const service = await createService();
    const res = await request(app).post(`/api/services/${service.slug}/launch`);

    expect(res.status).toBe(401);
  });

  it('returns 404 for unknown service', async () => {
    const res = await request(app)
      .post('/api/services/missing-service/launch')
      .set('Cookie', authCookie(userId))
      .field('data', JSON.stringify({ tier: 'standard' }));

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('SERVICE_NOT_FOUND');
  });

  it('returns 400 when a required photo is missing', async () => {
    const service = await createService();
    const res = await request(app)
      .post(`/api/services/${service.slug}/launch`)
      .set('Cookie', authCookie(userId))
      .field('data', JSON.stringify({ tier: 'standard', mood: 'warm' }));

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('REQUIRED_FIELD_MISSING');
  });

  it('returns 400 for invalid tier', async () => {
    const service = await createService();
    const res = await request(app)
      .post(`/api/services/${service.slug}/launch`)
      .set('Cookie', authCookie(userId))
      .field('data', JSON.stringify({ tier: 'gold', mood: 'warm' }))
      .attach('photo', await imageBuffer(), { filename: 'photo.png', contentType: 'image/png' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_TIER');
  });

  it('returns 400 for invalid select value', async () => {
    const service = await createService();
    const res = await request(app)
      .post(`/api/services/${service.slug}/launch`)
      .set('Cookie', authCookie(userId))
      .field('data', JSON.stringify({ tier: 'standard', mood: 'unknown' }))
      .attach('photo', await imageBuffer(), { filename: 'photo.png', contentType: 'image/png' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_SELECT_VALUE');
  });

  it('returns 402 when balance is too low', async () => {
    const service = await createService();
    const res = await request(app)
      .post(`/api/services/${service.slug}/launch`)
      .set('Cookie', authCookie(lowBalanceUserId))
      .field('data', JSON.stringify({ tier: 'standard', mood: 'warm' }))
      .attach('photo', await imageBuffer(), { filename: 'photo.png', contentType: 'image/png' });

    expect(res.status).toBe(402);
    expect(res.body.error.code).toBe('INSUFFICIENT_TOKENS');
  });

  it('creates a project, snapshots pipeline, stores inputs, charges standard price and enqueues job', async () => {
    const service = await createService();
    const addJob = jest.spyOn(queuesModule, 'addServicePipelineJob').mockResolvedValue({} as never);
    const before = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

    const res = await request(app)
      .post(`/api/services/${service.slug}/launch`)
      .set('Cookie', authCookie(userId))
      .field('data', JSON.stringify({ tier: 'standard', mood: 'warm', caption: 'Hello' }))
      .attach('photo', await imageBuffer(), { filename: 'photo.png', contentType: 'image/png' });

    expect(res.status).toBe(201);
    expect(res.body.project.tokensCost).toBe(100);
    expect(addJob).toHaveBeenCalledWith({ projectId: res.body.project.id, userId });

    const project = await prisma.project.findUniqueOrThrow({ where: { id: res.body.project.id } });
    expect(project.pipelineSnapshot).toEqual(service.pipelineConfig);
    expect(project.selectedTier).toBe('standard');
    expect(project.userInputs).toEqual(expect.objectContaining({
      tier: 'standard',
      mood: 'warm',
      caption: 'Hello',
      photo: expect.stringContaining('/static/user-inputs/'),
    }));
    expect(project.stepProgress).toEqual(expect.arrayContaining([
      expect.objectContaining({ stepId: 'step_1', status: 'pending' }),
    ]));

    const after = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(after.tokenBalance).toBe(before.tokenBalance - 100);
    const transaction = await prisma.tokenTransaction.findFirstOrThrow({ where: { refId: project.id } });
    expect(transaction.reason).toBe('service_launch');
    expect(transaction.amount).toBe(-100);
  });

  it('launches with a Studio avatar asset without re-uploading the file', async () => {
    const service = await createService({
      ...serviceData(),
      userInputForm: [
        { id: 'photo', type: 'photo', label: 'Photo', required: true, allowStudioAvatars: true, allowSystemLibrary: false },
        {
          id: 'mood',
          type: 'select',
          label: 'Mood',
          required: true,
          options: [{ label: 'Warm', value: 'warm' }],
        },
        { id: 'tier', type: 'tier', label: 'Quality', required: true },
      ],
    });
    const asset = await prisma.mediaAsset.create({
      data: {
        ownerUserId: userId,
        kind: 'user-avatar',
        title: `Launch ${RUN_ID} avatar`,
        tags: [],
        storageKey: `media-assets/user-avatar/${RUN_ID}.jpg`,
        publicUrl: `http://test.local:4000/static/media-assets/user-avatar/${RUN_ID}.jpg`,
        fileSize: 100,
        mimeType: 'image/jpeg',
        isActive: true,
      },
    });
    const addJob = jest.spyOn(queuesModule, 'addServicePipelineJob').mockResolvedValue({} as never);

    const res = await request(app)
      .post(`/api/services/${service.slug}/launch`)
      .set('Cookie', authCookie(userId))
      .field('data', JSON.stringify({ tier: 'standard', mood: 'warm', photo: `asset:${asset.id}` }));

    expect(res.status).toBe(201);
    expect(addJob).toHaveBeenCalledWith({ projectId: res.body.project.id, userId });
    const project = await prisma.project.findUniqueOrThrow({ where: { id: res.body.project.id } });
    expect(project.userInputs).toEqual(expect.objectContaining({ photo: `asset:${asset.id}` }));
    expect(project.inputImages).toEqual([asset.publicUrl]);
  });

  it('rejects a foreign Studio avatar asset before launch', async () => {
    const service = await createService({
      ...serviceData(),
      userInputForm: [
        { id: 'photo', type: 'photo', label: 'Photo', required: true, allowStudioAvatars: true, allowSystemLibrary: false },
        {
          id: 'mood',
          type: 'select',
          label: 'Mood',
          required: true,
          options: [{ label: 'Warm', value: 'warm' }],
        },
        { id: 'tier', type: 'tier', label: 'Quality', required: true },
      ],
    });
    const asset = await prisma.mediaAsset.create({
      data: {
        ownerUserId: lowBalanceUserId,
        kind: 'user-avatar',
        title: `Launch ${RUN_ID} foreign avatar`,
        tags: [],
        storageKey: `media-assets/user-avatar/${RUN_ID}-foreign.jpg`,
        publicUrl: `http://test.local:4000/static/media-assets/user-avatar/${RUN_ID}-foreign.jpg`,
        fileSize: 100,
        mimeType: 'image/jpeg',
        isActive: true,
      },
    });

    const res = await request(app)
      .post(`/api/services/${service.slug}/launch`)
      .set('Cookie', authCookie(userId))
      .field('data', JSON.stringify({ tier: 'standard', mood: 'warm', photo: `asset:${asset.id}` }));

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('MEDIA_ASSET_NOT_FOUND');
  });

  it('charges pro price when pro tier is selected', async () => {
    const service = await createService();
    jest.spyOn(queuesModule, 'addServicePipelineJob').mockResolvedValue({} as never);
    const before = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

    const res = await request(app)
      .post(`/api/services/${service.slug}/launch`)
      .set('Cookie', authCookie(userId))
      .field('data', JSON.stringify({ tier: 'pro', mood: 'funny' }))
      .attach('photo', await imageBuffer(), { filename: 'photo.png', contentType: 'image/png' });

    expect(res.status).toBe(201);
    expect(res.body.project.tokensCost).toBe(250);
    const after = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(after.tokenBalance).toBe(before.tokenBalance - 250);
  });

  it('charges the selected duration price when a duration field defines prices', async () => {
    const service = await createService({
      ...serviceData(),
      priceCoinsStandard: 100,
      priceCoinsPro: 250,
      userInputForm: [
        { id: 'photo', type: 'photo', label: 'Photo', required: true },
        {
          id: 'mood',
          type: 'select',
          label: 'Mood',
          required: true,
          options: [{ label: 'Warm', value: 'warm' }],
        },
        {
          id: 'duration',
          type: 'duration',
          label: 'Duration',
          required: false,
          durationOptions: [5, 10, 15],
          defaultDuration: 5,
          durationPrices: [
            { duration: 5, priceCoins: 30 },
            { duration: 10, priceCoins: 60 },
            { duration: 15, priceCoins: 90 },
          ],
        },
        { id: 'tier', type: 'tier', label: 'Quality', required: true },
      ],
    });
    jest.spyOn(queuesModule, 'addServicePipelineJob').mockResolvedValue({} as never);
    const before = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

    const res = await request(app)
      .post(`/api/services/${service.slug}/launch`)
      .set('Cookie', authCookie(userId))
      .field('data', JSON.stringify({ tier: 'pro', mood: 'warm', duration: 15 }))
      .attach('photo', await imageBuffer(), { filename: 'photo.png', contentType: 'image/png' });

    expect(res.status).toBe(201);
    expect(res.body.project.tokensCost).toBe(90);
    const after = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(after.tokenBalance).toBe(before.tokenBalance - 90);
  });
});
