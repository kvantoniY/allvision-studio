import request from 'supertest';
import { prisma, ProcessingType, ProjectStatus } from '@allvision/database';
import { signAccessToken } from '../utils/jwt';

const { app } = require('../app') as typeof import('../app');

const RUN_ID = Date.now();
const ADMIN_EMAIL = `admin-projects-${RUN_ID}@example.ru`;
const USER_EMAIL = `admin-projects-user-${RUN_ID}@example.ru`;
const SERVICE_SLUG = `admin-projects-service-${RUN_ID}`;

let adminUserId: string;
let userId: string;
let projectId: string;

function authCookie(id: string, role: 'USER' | 'ADMIN') {
  return [`accessToken=${signAccessToken(id, role)}`];
}

beforeAll(async () => {
  await cleanup();
  const [admin, user] = await Promise.all([
    prisma.user.create({ data: { email: ADMIN_EMAIL, passwordHash: 'hash', role: 'ADMIN', tokenBalance: 0 } }),
    prisma.user.create({ data: { email: USER_EMAIL, passwordHash: 'hash', role: 'USER', tokenBalance: 0 } }),
  ]);
  adminUserId = admin.id;
  userId = user.id;
  const service = await prisma.service.create({
    data: {
      slug: SERVICE_SLUG,
      title: `Projects ${RUN_ID} Service`,
      shortDesc: 'Projects test service',
      description: 'Projects test service',
      category: "TRENDS_MEMES",
      priceTokens: 40,
      priceCoinsStandard: 40,
      priceCoinsPro: 90,
      costUsd: 0,
      galleryImages: [],
      isActive: true,
      isFeatured: true,
      aiProvider: 'mock',
      aiModel: 'mock',
      aiConfig: {},
      processingType: ProcessingType.AUTO,
    },
  });
  const project = await prisma.project.create({
    data: {
      userId,
      serviceId: service.id,
      title: `Projects ${RUN_ID} Target`,
      status: ProjectStatus.FAILED,
      progress: 45,
      inputImages: [],
      tokensCost: 40,
      selectedTier: 'standard',
      errorCode: 'TEST_FAILED',
    },
  });
  projectId = project.id;
  await prisma.aIUsageLog.create({
    data: {
      projectId,
      userId,
      blockSlug: `projects-block-${RUN_ID}`,
      provider: 'piapi',
      model: `projects-model-${RUN_ID}`,
      taskId: `projects-task-${RUN_ID}`,
      status: 'failed',
      costUsd: 2.33,
      durationMs: 1000,
      errorCode: 'PIAPI_TEST',
      errorMessage: 'test',
    },
  });
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

async function cleanup() {
  await prisma.aIUsageLog.deleteMany({ where: { model: { contains: `projects-model-${RUN_ID}` } } });
  await prisma.project.deleteMany({ where: { title: { contains: `Projects ${RUN_ID}` } } });
  await prisma.service.deleteMany({ where: { slug: SERVICE_SLUG } });
  await prisma.user.deleteMany({ where: { email: { in: [ADMIN_EMAIL, USER_EMAIL] } } });
}

describe('/api/admin/projects', () => {
  it('filters projects by status, service, date and user', async () => {
    const dateFrom = new Date(Date.now() - 60_000).toISOString();
    const res = await request(app)
      .get(`/api/admin/projects?status=FAILED&serviceSlug=${SERVICE_SLUG}&dateFrom=${encodeURIComponent(dateFrom)}&user=${encodeURIComponent(USER_EMAIL)}`)
      .set('Cookie', authCookie(adminUserId, 'ADMIN'));

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].id).toBe(projectId);
    expect(res.body.items[0].user.email).toBe(USER_EMAIL);
    expect(res.body.items[0].costUsd).toBe(2.33);
    expect(res.body.items[0].userPriceCoins).toBe(40);
  });

  it('returns project details and rejects non-admins', async () => {
    const forbidden = await request(app)
      .get('/api/admin/projects')
      .set('Cookie', authCookie(userId, 'USER'));
    expect(forbidden.status).toBe(403);

    const detail = await request(app)
      .get(`/api/admin/projects/${projectId}`)
      .set('Cookie', authCookie(adminUserId, 'ADMIN'));
    expect(detail.status).toBe(200);
    expect(detail.body.project.aiUsageLogs).toHaveLength(1);
    expect(detail.body.project.errorCode).toBe('TEST_FAILED');
  });
});
