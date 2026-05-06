import request from 'supertest';
import { prisma } from '@allvision/database';
import { app } from '../app';
import { signAccessToken } from '../utils/jwt';

const RUN_ID = Date.now();
const ADMIN_EMAIL = `admin-blocks-${RUN_ID}@example.com`;
const USER_EMAIL = `admin-blocks-user-${RUN_ID}@example.com`;

let adminUserId: string;
let regularUserId: string;

function authCookie(userId: string, role: 'USER' | 'ADMIN') {
  return [`accessToken=${signAccessToken(userId, role)}`];
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
}

beforeAll(async () => {
  await cleanup();
  const [admin, user] = await Promise.all([
    prisma.user.create({
      data: {
        email: ADMIN_EMAIL,
        passwordHash: 'hash',
        role: 'ADMIN',
        tokenBalance: 0,
      },
    }),
    prisma.user.create({
      data: {
        email: USER_EMAIL,
        passwordHash: 'hash',
        role: 'USER',
        tokenBalance: 0,
      },
    }),
  ]);
  adminUserId = admin.id;
  regularUserId = user.id;
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe('GET /api/admin/blocks', () => {
  it('returns block catalog for admin users', async () => {
    const res = await request(app)
      .get('/api/admin/blocks')
      .set('Cookie', authCookie(adminUserId, 'ADMIN'));

    expect(res.status).toBe(200);
    expect(res.body.blocks).toHaveLength(6);
    expect(res.body.blocks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          slug: 'image-restore',
          paramsSchema: expect.any(Object),
          supportedModels: expect.any(Array),
        }),
      ]),
    );
  });

  it('returns 403 for non-admin users', async () => {
    const res = await request(app)
      .get('/api/admin/blocks')
      .set('Cookie', authCookie(regularUserId, 'USER'));

    expect(res.status).toBe(403);
  });
});
