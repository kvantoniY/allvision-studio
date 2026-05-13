import request from 'supertest';
import { prisma, ProjectStatus, ServiceCategory, ProcessingType } from '@allvision/database';
import { signAccessToken } from '../utils/jwt';

const { app } = require('../app') as typeof import('../app');

const RUN_ID = Date.now();
const ADMIN_EMAIL = `admin-users-${RUN_ID}@example.com`;
const USER_EMAIL = `admin-users-user-${RUN_ID}@example.com`;
const DELETED_EMAIL = `admin-users-deleted-${RUN_ID}@example.com`;
const SERVICE_SLUG = `admin-users-service-${RUN_ID}`;

let adminUserId: string;
let userId: string;
let deletedUserId: string;

function authCookie(id: string, role: 'USER' | 'ADMIN') {
  return [`accessToken=${signAccessToken(id, role)}`];
}

beforeAll(async () => {
  await cleanup();
  const [admin, user, deleted] = await Promise.all([
    prisma.user.create({ data: { email: ADMIN_EMAIL, passwordHash: 'secret-hash', role: 'ADMIN', tokenBalance: 0 } }),
    prisma.user.create({ data: { email: USER_EMAIL, passwordHash: 'secret-hash', role: 'USER', tokenBalance: 25 } }),
    prisma.user.create({ data: { email: DELETED_EMAIL, passwordHash: 'secret-hash', role: 'USER', tokenBalance: 0, deletedAt: new Date() } }),
  ]);
  adminUserId = admin.id;
  userId = user.id;
  deletedUserId = deleted.id;
  const service = await prisma.service.create({
    data: {
      slug: SERVICE_SLUG,
      title: `Users ${RUN_ID} Service`,
      shortDesc: 'Users test service',
      description: 'Users test service',
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
    },
  });
  await prisma.project.create({
    data: {
      userId,
      serviceId: service.id,
      title: `Users ${RUN_ID} Project`,
      status: ProjectStatus.COMPLETED,
      progress: 100,
      inputImages: [],
      tokensCost: 10,
    },
  });
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

async function cleanup() {
  await prisma.tokenTransaction.deleteMany({ where: { user: { email: { in: [ADMIN_EMAIL, USER_EMAIL, DELETED_EMAIL] } } } });
  await prisma.project.deleteMany({ where: { title: { contains: `Users ${RUN_ID}` } } });
  await prisma.service.deleteMany({ where: { slug: SERVICE_SLUG } });
  await prisma.user.deleteMany({ where: { email: { in: [ADMIN_EMAIL, USER_EMAIL, DELETED_EMAIL] } } });
}

describe('/api/admin/users', () => {
  it('filters users and never returns passwordHash', async () => {
    const res = await request(app)
      .get(`/api/admin/users?role=USER&status=active&search=${encodeURIComponent(USER_EMAIL)}`)
      .set('Cookie', authCookie(adminUserId, 'ADMIN'));

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].email).toBe(USER_EMAIL);
    expect(res.body.items[0]._count.projects).toBe(1);
    expect(res.body.items[0].lastActivityAt).toBeDefined();
    expect(JSON.stringify(res.body)).not.toContain('secret-hash');
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
  });

  it('filters deleted users and updates balance only', async () => {
    const deleted = await request(app)
      .get('/api/admin/users?status=deleted')
      .set('Cookie', authCookie(adminUserId, 'ADMIN'));
    expect(deleted.status).toBe(200);
    expect(deleted.body.items.map((item: { id: string }) => item.id)).toContain(deletedUserId);

    const patch = await request(app)
      .patch(`/api/admin/users/${userId}`)
      .set('Cookie', authCookie(adminUserId, 'ADMIN'))
      .send({ tokenBalance: 77 });

    expect(patch.status).toBe(200);
    expect(patch.body.user.tokenBalance).toBe(77);
    expect(JSON.stringify(patch.body)).not.toContain('passwordHash');
  });
});
