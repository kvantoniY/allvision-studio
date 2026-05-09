import request from 'supertest';
import {
  prisma,
  ProcessingType,
  ProjectStatus,
  ServiceCategory,
} from '@allvision/database';
import { signAccessToken } from '../utils/jwt';

const mockGetAccountInfo = jest.fn();

jest.mock('../services/piapi-client', () => ({
  PiAPIAccountClient: jest.fn().mockImplementation(() => ({
    getAccountInfo: mockGetAccountInfo,
  })),
}));

const { app } = require('../app') as typeof import('../app');

const RUN_ID = Date.now();
const ADMIN_EMAIL = `admin-usage-${RUN_ID}@example.com`;
const USER_EMAIL = `admin-usage-user-${RUN_ID}@example.com`;
const SERVICE_SLUG = `usage-service-${RUN_ID}`;

let adminUserId: string;
let regularUserId: string;
let projectId: string;

function authCookie(userId: string, role: 'USER' | 'ADMIN') {
  return [`accessToken=${signAccessToken(userId, role)}`];
}

async function cleanup() {
  await prisma.aIUsageLog.deleteMany({
    where: {
      OR: [
        { model: { contains: `usage-model-${RUN_ID}` } },
        { blockSlug: { contains: `usage-block-${RUN_ID}` } },
      ],
    },
  });
  await prisma.project.deleteMany({ where: { title: { contains: `Usage ${RUN_ID}` } } });
  await prisma.service.deleteMany({ where: { slug: SERVICE_SLUG } });
  await prisma.user.deleteMany({ where: { email: { in: [ADMIN_EMAIL, USER_EMAIL] } } });
}

beforeAll(async () => {
  await cleanup();
  const [admin, user] = await Promise.all([
    prisma.user.create({ data: { email: ADMIN_EMAIL, passwordHash: 'hash', role: 'ADMIN', tokenBalance: 0 } }),
    prisma.user.create({ data: { email: USER_EMAIL, passwordHash: 'hash', role: 'USER', tokenBalance: 0 } }),
  ]);
  adminUserId = admin.id;
  regularUserId = user.id;

  const service = await prisma.service.create({
    data: {
      slug: SERVICE_SLUG,
      title: `Usage ${RUN_ID} Service`,
      shortDesc: 'Usage test service',
      description: 'Usage test service',
      category: ServiceCategory.NOSTALGIA,
      priceTokens: 10,
      costUsd: 0,
      galleryImages: [],
      isActive: true,
      isFeatured: false,
      aiProvider: 'mock',
      aiModel: 'mock',
      aiConfig: {},
      processingType: ProcessingType.AUTO,
      priceCoinsStandard: 10,
      priceCoinsPro: 20,
      previewImage: 'http://test.local/preview.png',
    },
  });

  const project = await prisma.project.create({
    data: {
      userId: regularUserId,
      serviceId: service.id,
      title: `Usage ${RUN_ID} Project`,
      status: ProjectStatus.COMPLETED,
      progress: 100,
      inputImages: [],
      tokensCost: 10,
      selectedTier: 'standard',
    },
  });
  projectId = project.id;

  await prisma.aIUsageLog.createMany({
    data: [
      {
        projectId,
        userId: regularUserId,
        blockSlug: `usage-block-${RUN_ID}-image`,
        provider: 'piapi',
        model: `usage-model-${RUN_ID}-nano`,
        taskId: `task-${RUN_ID}-1`,
        status: 'success',
        costUsd: 0.06,
        durationMs: 1200,
      },
      {
        projectId,
        userId: regularUserId,
        blockSlug: `usage-block-${RUN_ID}-video`,
        provider: 'piapi',
        model: `usage-model-${RUN_ID}-kling`,
        taskId: `task-${RUN_ID}-2`,
        status: 'failed',
        costUsd: 0,
        durationMs: 3000,
        errorCode: 'PIAPI_HTTP_500',
        errorMessage: 'provider failed',
      },
      {
        projectId,
        userId: regularUserId,
        blockSlug: `usage-block-${RUN_ID}-video`,
        provider: 'piapi',
        model: `usage-model-${RUN_ID}-kling`,
        taskId: `task-${RUN_ID}-3`,
        status: 'timeout',
        costUsd: 0,
        durationMs: 900000,
        errorCode: 'PIAPI_TIMEOUT',
        errorMessage: 'timeout',
      },
    ],
  });
});

afterEach(() => {
  mockGetAccountInfo.mockReset();
});

afterAll(async () => {
  jest.restoreAllMocks();
  await cleanup();
  await prisma.$disconnect();
});

describe('/api/admin/usage', () => {
  it('requires admin role', async () => {
    expect((await request(app).get('/api/admin/usage')).status).toBe(401);
    expect((await request(app).get('/api/admin/usage').set('Cookie', authCookie(regularUserId, 'USER'))).status).toBe(403);
  });

  it('returns filtered logs and aggregates', async () => {
    const dateFrom = new Date(Date.now() - 60_000).toISOString();
    const res = await request(app)
      .get(`/api/admin/usage?provider=piapi&projectId=${projectId}&dateFrom=${encodeURIComponent(dateFrom)}`)
      .set('Cookie', authCookie(adminUserId, 'ADMIN'));

    expect(res.status).toBe(200);
    expect(res.body.summary.totalRequests).toBe(3);
    expect(res.body.summary.successCount).toBe(1);
    expect(res.body.summary.failedCount).toBe(1);
    expect(res.body.summary.timeoutCount).toBe(1);
    expect(res.body.summary.totalCostUsd).toBeCloseTo(0.06);
    expect(res.body.logs).toHaveLength(3);
    expect(res.body.logs[0].project.service.slug).toBe(SERVICE_SLUG);
    expect(res.body.byModel).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ model: `usage-model-${RUN_ID}-kling`, requestCount: 2 }),
        expect.objectContaining({ model: `usage-model-${RUN_ID}-nano`, requestCount: 1 }),
      ]),
    );
    expect(res.body.byBlock).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ blockSlug: `usage-block-${RUN_ID}-video`, requestCount: 2, successRate: 0 }),
      ]),
    );
  });

  it('returns and caches PiAPI account balance', async () => {
    process.env.PIAPI_API_KEY = 'test-piapi-key';
    process.env.PIAPI_BALANCE_MIN_USD = '2';
    mockGetAccountInfo.mockResolvedValueOnce({ equivalentUsd: 12.5, raw: { equivalent_in_usd: 12.5 } });

    const first = await request(app)
      .get('/api/admin/piapi/account?refresh=true')
      .set('Cookie', authCookie(adminUserId, 'ADMIN'));
    expect(first.status).toBe(200);
    expect(first.body.balanceUsd).toBe(12.5);
    expect(first.body.lowBalance).toBe(false);

    const second = await request(app)
      .get('/api/admin/piapi/account')
      .set('Cookie', authCookie(adminUserId, 'ADMIN'));
    expect(second.status).toBe(200);
    expect(second.body.balanceUsd).toBe(12.5);
    expect(mockGetAccountInfo).toHaveBeenCalledTimes(1);
  });

  it('reports missing PiAPI API key on forced refresh', async () => {
    const previous = process.env.PIAPI_API_KEY;
    delete process.env.PIAPI_API_KEY;

    const res = await request(app)
      .get('/api/admin/piapi/account?refresh=true')
      .set('Cookie', authCookie(adminUserId, 'ADMIN'));

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('PIAPI_API_KEY_MISSING');
    if (previous) process.env.PIAPI_API_KEY = previous;
  });
});
