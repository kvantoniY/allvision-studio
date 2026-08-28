import request from 'supertest';
import { prisma } from '@allvision/database';
import { app } from '../app';
import { signAccessToken } from '../utils/jwt';

const RUN_ID = Date.now();
const ADMIN_EMAIL = `style-admin-${RUN_ID}@example.ru`;
const USER_EMAIL = `style-user-${RUN_ID}@example.ru`;

let adminUserId: string;
let regularUserId: string;

function authCookie(userId: string, role: 'USER' | 'ADMIN') {
  return [`accessToken=${signAccessToken(userId, role)}`];
}

async function cleanup() {
  await prisma.stylePreset.deleteMany({ where: { slug: { contains: `test-${RUN_ID}` } } });
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
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe('style presets API', () => {
  it('supports admin CRUD and public active listing', async () => {
    const create = await request(app)
      .post('/api/admin/style-presets')
      .set('Cookie', authCookie(adminUserId, 'ADMIN'))
      .send({
        slug: `test-${RUN_ID}-portrait`,
        kind: 'user-avatar',
        title: 'Test portrait',
        description: 'A test preset',
        promptText: 'Create a clean portrait.',
        sortOrder: 777,
      });
    expect(create.status).toBe(201);
    const id = create.body.preset.id as string;

    const forbidden = await request(app)
      .get('/api/admin/style-presets')
      .set('Cookie', authCookie(regularUserId, 'USER'));
    expect(forbidden.status).toBe(403);

    const publicList = await request(app).get('/api/public/style-presets?kind=user-avatar');
    expect(publicList.status).toBe(200);
    expect(publicList.body.presets.map((preset: { id: string }) => preset.id)).toContain(id);

    const update = await request(app)
      .patch(`/api/admin/style-presets/${id}`)
      .set('Cookie', authCookie(adminUserId, 'ADMIN'))
      .send({ title: 'Updated portrait', isActive: false });
    expect(update.status).toBe(200);
    expect(update.body.preset.title).toBe('Updated portrait');

    const hiddenPublicList = await request(app).get('/api/public/style-presets?kind=user-avatar');
    expect(hiddenPublicList.body.presets.map((preset: { id: string }) => preset.id)).not.toContain(id);

    const remove = await request(app)
      .delete(`/api/admin/style-presets/${id}`)
      .set('Cookie', authCookie(adminUserId, 'ADMIN'));
    expect(remove.status).toBe(200);
  });
});
