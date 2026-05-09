import request from 'supertest';
import sharp from 'sharp';
import { prisma } from '@allvision/database';
import { app } from '../app';
import { signAccessToken } from '../utils/jwt';

const RUN_ID = Date.now();
const ADMIN_EMAIL = `admin-media-${RUN_ID}@example.com`;
const USER_EMAIL = `admin-media-user-${RUN_ID}@example.com`;

let adminUserId: string;
let regularUserId: string;

function authCookie(userId: string, role: 'USER' | 'ADMIN') {
  return [`accessToken=${signAccessToken(userId, role)}`];
}

async function pngBuffer() {
  return sharp({
    create: { width: 24, height: 24, channels: 3, background: '#884422' },
  }).png().toBuffer();
}

async function cleanup() {
  await prisma.mediaAsset.deleteMany({ where: { title: { contains: `Media ${RUN_ID}` } } });
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

describe('/api/admin/media-assets', () => {
  it('requires admin role', async () => {
    expect((await request(app).get('/api/admin/media-assets')).status).toBe(401);
    expect((await request(app).get('/api/admin/media-assets').set('Cookie', authCookie(regularUserId, 'USER'))).status).toBe(403);
  });

  it('creates, lists, updates, reorders and deletes an image asset', async () => {
    const create = await request(app)
      .post('/api/admin/media-assets')
      .set('Cookie', authCookie(adminUserId, 'ADMIN'))
      .field('data', JSON.stringify({
        kind: 'preview-image',
        title: `Media ${RUN_ID} image`,
        description: 'test image',
        tags: 'test,preview',
      }))
      .attach('file', await pngBuffer(), { filename: 'asset.png', contentType: 'image/png' });

    expect(create.status).toBe(201);
    expect(create.body.asset.kind).toBe('preview-image');
    expect(create.body.asset.publicUrl).toContain('/static/media-assets/preview-image/');

    const id = create.body.asset.id as string;
    const list = await request(app)
      .get(`/api/admin/media-assets?kind=preview-image&search=${RUN_ID}`)
      .set('Cookie', authCookie(adminUserId, 'ADMIN'));
    expect(list.status).toBe(200);
    expect(list.body.items.map((asset: { id: string }) => asset.id)).toContain(id);

    const update = await request(app)
      .patch(`/api/admin/media-assets/${id}`)
      .set('Cookie', authCookie(adminUserId, 'ADMIN'))
      .send({ isActive: false, tags: ['updated'] });
    expect(update.status).toBe(200);
    expect(update.body.asset.isActive).toBe(false);

    const reorder = await request(app)
      .post(`/api/admin/media-assets/${id}/reorder`)
      .set('Cookie', authCookie(adminUserId, 'ADMIN'))
      .send({ sortOrder: 99 });
    expect(reorder.status).toBe(200);

    const remove = await request(app)
      .delete(`/api/admin/media-assets/${id}`)
      .set('Cookie', authCookie(adminUserId, 'ADMIN'));
    expect(remove.status).toBe(200);
  });

  it('rejects unsupported formats', async () => {
    const res = await request(app)
      .post('/api/admin/media-assets')
      .set('Cookie', authCookie(adminUserId, 'ADMIN'))
      .field('data', JSON.stringify({ kind: 'preview-image', title: `Media ${RUN_ID} invalid` }))
      .attach('file', Buffer.from('plain text'), { filename: 'asset.txt', contentType: 'text/plain' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('UNSUPPORTED_FORMAT');
  });
});
