import request from 'supertest';
import { prisma } from '@allvision/database';
import { signAccessToken } from '../utils/jwt';

const { app } = require('../app') as typeof import('../app');

const RUN_ID = Date.now();
const ADMIN_EMAIL = `admin-settings-${RUN_ID}@example.com`;
const USER_EMAIL = `admin-settings-user-${RUN_ID}@example.com`;

let adminUserId: string;
let regularUserId: string;

function authCookie(userId: string, role: 'USER' | 'ADMIN') {
  return [`accessToken=${signAccessToken(userId, role)}`];
}

beforeAll(async () => {
  await prisma.setting.deleteMany({ where: { key: 'USD_TO_RUB' } });
  const [admin, user] = await Promise.all([
    prisma.user.create({ data: { email: ADMIN_EMAIL, passwordHash: 'hash', role: 'ADMIN', tokenBalance: 0 } }),
    prisma.user.create({ data: { email: USER_EMAIL, passwordHash: 'hash', role: 'USER', tokenBalance: 0 } }),
  ]);
  adminUserId = admin.id;
  regularUserId = user.id;
});

afterAll(async () => {
  await prisma.setting.deleteMany({ where: { key: 'USD_TO_RUB' } });
  await prisma.user.deleteMany({ where: { email: { in: [ADMIN_EMAIL, USER_EMAIL] } } });
  await prisma.$disconnect();
});

describe('/api/admin/settings', () => {
  it('returns default rate and requires admin for updates', async () => {
    const forbidden = await request(app)
      .patch('/api/admin/settings')
      .set('Cookie', authCookie(regularUserId, 'USER'))
      .send({ usdToRub: 91 });
    expect(forbidden.status).toBe(403);

    const res = await request(app)
      .get('/api/admin/settings')
      .set('Cookie', authCookie(adminUserId, 'ADMIN'));
    expect(res.status).toBe(200);
    expect(res.body.settings.usdToRub).toBe(80);
  });

  it('updates USD_TO_RUB rate', async () => {
    const res = await request(app)
      .patch('/api/admin/settings')
      .set('Cookie', authCookie(adminUserId, 'ADMIN'))
      .send({ usdToRub: 92.5 });

    expect(res.status).toBe(200);
    expect(res.body.settings.usdToRub).toBe(92.5);

    const row = await prisma.setting.findUnique({ where: { key: 'USD_TO_RUB' } });
    expect(row?.value).toBe('92.5');
  });
});
