import request from 'supertest';
import {
  prisma,
  ProcessingType,
  ProjectStatus,
} from '@allvision/database';
import { signAccessToken } from '../utils/jwt';

const mockGetAccountInfo = jest.fn();
const mockGetTask = jest.fn();

jest.mock('../services/piapi-client', () => ({
  PiAPIAccountClient: jest.fn().mockImplementation(() => ({
    getAccountInfo: mockGetAccountInfo,
    getTask: mockGetTask,
  })),
}));

const { app } = require('../app') as typeof import('../app');

const RUN_ID = Date.now();
const READONLY_EMAIL = `readonly-${RUN_ID}@example.com`;
const USER_EMAIL = `readonly-user-${RUN_ID}@example.com`;
const SERVICE_SLUG = `readonly-service-${RUN_ID}`;
const MEDIA_TITLE = `Readonly ${RUN_ID} Trend Video`;

let readonlyUserId: string;
let regularUserId: string;
let projectId: string;

function bearer(userId: string, role: 'USER' | 'ADMIN' | 'READONLY_ADMIN') {
  return `Bearer ${signAccessToken(userId, role)}`;
}

async function cleanup() {
  await prisma.aIUsageLog.deleteMany({ where: { model: { contains: `readonly-model-${RUN_ID}` } } });
  await prisma.project.deleteMany({ where: { title: { contains: `Readonly ${RUN_ID}` } } });
  await prisma.mediaAsset.deleteMany({ where: { title: MEDIA_TITLE } });
  await prisma.service.deleteMany({ where: { slug: SERVICE_SLUG } });
  await prisma.user.deleteMany({ where: { email: { in: [READONLY_EMAIL, USER_EMAIL] } } });
}

beforeAll(async () => {
  await cleanup();
  const [readonly, user] = await Promise.all([
    prisma.user.create({ data: { email: READONLY_EMAIL, passwordHash: 'hash', role: 'READONLY_ADMIN', tokenBalance: 0 } }),
    prisma.user.create({ data: { email: USER_EMAIL, passwordHash: 'hash', role: 'USER', tokenBalance: 0 } }),
  ]);
  readonlyUserId = readonly.id;
  regularUserId = user.id;

  const service = await prisma.service.create({
    data: {
      slug: SERVICE_SLUG,
      title: `Readonly ${RUN_ID} Service`,
      shortDesc: 'Readonly test service',
      description: 'Readonly test service',
      category: "NOSTALGIA",
      priceTokens: 10,
      costUsd: 0,
      galleryImages: [],
      isActive: true,
      isFeatured: true,
      aiProvider: 'mock',
      aiModel: 'mock',
      aiConfig: {},
      processingType: ProcessingType.AUTO,
      priceCoinsStandard: 10,
      priceCoinsPro: 20,
      previewImage: 'http://test.local/preview.png',
      pipelineConfig: [{ id: 'step_1', blockSlug: 'image-edit', params: { model: 'nano-banana', prompt: 'restore' } }],
      userInputForm: [{ id: 'tier', type: 'tier', label: 'Tier', required: true }],
    },
  });

  const project = await prisma.project.create({
    data: {
      userId: regularUserId,
      serviceId: service.id,
      title: `Readonly ${RUN_ID} Project`,
      status: ProjectStatus.FAILED,
      progress: 42,
      inputImages: [],
      tokensCost: 10,
      selectedTier: 'standard',
      errorCode: 'TEST_ERROR',
      errorMessage: 'test error',
      userInputs: { photo: 'data:image/png;base64,secret' },
      pipelineSnapshot: [{ id: 'step_1', blockSlug: 'image-edit' }],
      stepProgress: [{ stepId: 'step_1', status: 'failed' }],
    },
  });
  projectId = project.id;

  await prisma.aIUsageLog.create({
    data: {
      projectId,
      userId: regularUserId,
      blockSlug: 'image-edit',
      provider: 'piapi',
      model: `readonly-model-${RUN_ID}`,
      taskId: `readonly-task-${RUN_ID}`,
      status: 'success',
      costUsd: 0.12,
      durationMs: 1000,
      recoverableOutputUrl: null,
    },
  });

  await prisma.mediaAsset.create({
    data: {
      kind: 'trend-video',
      title: MEDIA_TITLE,
      description: 'Readonly media asset',
      tags: ['readonly-test'],
      storageKey: `readonly/${RUN_ID}.mp4`,
      publicUrl: `https://cdn.test/readonly-${RUN_ID}.mp4`,
      fileSize: 1234,
      mimeType: 'video/mp4',
      isActive: true,
      sortOrder: 1,
    },
  });
});

beforeEach(() => {
  process.env.PIAPI_API_KEY = 'test-piapi-key';
  mockGetAccountInfo.mockResolvedValue({ equivalentUsd: 7.77, raw: { equivalent_in_usd: 7.77 } });
  mockGetTask.mockResolvedValue({ data: { task_id: `readonly-task-${RUN_ID}`, status: 'completed' } });
});

afterEach(() => {
  mockGetAccountInfo.mockReset();
  mockGetTask.mockReset();
});

afterAll(async () => {
  jest.restoreAllMocks();
  await cleanup();
  await prisma.$disconnect();
});

describe('/api/admin-readonly', () => {
  it('returns diagnostics for READONLY_ADMIN without exposing emails or password fields', async () => {
    const res = await request(app)
      .get('/api/admin-readonly/diagnostics')
      .set('Authorization', bearer(readonlyUserId, 'READONLY_ADMIN'));

    expect(res.status).toBe(200);
    expect(res.body.piapiBalance.equivalentUsd).toBe(7.77);
    expect(res.body.providerMode).toBeDefined();
    expect(res.body.recentUsageLogs).toEqual(
      expect.arrayContaining([expect.objectContaining({ taskId: `readonly-task-${RUN_ID}` })]),
    );
    expect(res.body.activeServices).toEqual(
      expect.arrayContaining([expect.objectContaining({ slug: SERVICE_SLUG, isFeatured: true })]),
    );
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain(READONLY_EMAIL);
    expect(serialized).not.toContain(USER_EMAIL);
    expect(serialized).not.toContain('passwordHash');
  });

  it('redacts data URLs from full project dumps', async () => {
    const res = await request(app)
      .get(`/api/admin-readonly/project/${projectId}/full`)
      .set('Authorization', bearer(readonlyUserId, 'READONLY_ADMIN'));

    expect(res.status).toBe(200);
    expect(res.body.project.userInputs.photo).toBe('[redacted:data-url]');
    expect(res.body.project.aiUsageLogs[0].taskId).toBe(`readonly-task-${RUN_ID}`);
  });

  it('blocks mutating requests for READONLY_ADMIN', async () => {
    await request(app)
      .post('/api/admin-readonly/diagnostics')
      .set('Authorization', bearer(readonlyUserId, 'READONLY_ADMIN'))
      .expect(403);
    await request(app)
      .patch('/api/admin-readonly/diagnostics')
      .set('Authorization', bearer(readonlyUserId, 'READONLY_ADMIN'))
      .expect(403);
    await request(app)
      .delete('/api/admin-readonly/diagnostics')
      .set('Authorization', bearer(readonlyUserId, 'READONLY_ADMIN'))
      .expect(403);
    await request(app)
      .post('/api/projects')
      .set('Authorization', bearer(readonlyUserId, 'READONLY_ADMIN'))
      .expect(403);
  });

  it('returns services with margin snapshots', async () => {
    const res = await request(app)
      .get('/api/admin-readonly/services')
      .set('Authorization', bearer(readonlyUserId, 'READONLY_ADMIN'));

    expect(res.status).toBe(200);
    expect(res.body.services).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          slug: SERVICE_SLUG,
          pipelineSnapshot: expect.anything(),
          margin: expect.objectContaining({ standard: expect.any(Object) }),
        }),
      ]),
    );
    expect(JSON.stringify(res.body)).not.toContain(USER_EMAIL);
  });

  it('returns media assets and block catalog', async () => {
    const media = await request(app)
      .get('/api/admin-readonly/media-assets?kind=trend-video')
      .set('Authorization', bearer(readonlyUserId, 'READONLY_ADMIN'));
    expect(media.status).toBe(200);
    expect(media.body.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ title: MEDIA_TITLE, publicUrl: expect.stringContaining('readonly') })]),
    );

    const catalog = await request(app)
      .get('/api/admin-readonly/block-catalog')
      .set('Authorization', bearer(readonlyUserId, 'READONLY_ADMIN'));
    expect(catalog.status).toBe(200);
    expect(catalog.body.blocks).toEqual(
      expect.arrayContaining([expect.objectContaining({ slug: 'motion-transfer' })]),
    );
  });
});
