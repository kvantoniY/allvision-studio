import request from 'supertest';
import { prisma } from '@allvision/database';
import { app } from '../app';

const METH_EMAIL = `lt-meth-${Date.now()}@example.com`;
const PARENT_EMAIL = `lt-parent-${Date.now()}@example.com`;
const PASSWORD = 'password123';

async function cleanupUser(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return;
  await prisma.lessonTemplate.deleteMany({ where: { createdById: user.id } });
  await prisma.tokenTransaction.deleteMany({ where: { userId: user.id } });
  await prisma.user.delete({ where: { id: user.id } });
}

async function login(email: string) {
  const res = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
  const cookies = res.headers['set-cookie'] as unknown as string[] | string;
  return Array.isArray(cookies) ? cookies : [cookies];
}

let methCookies: string[] = [];
let parentCookies: string[] = [];
let templateId = '';

beforeAll(async () => {
  await cleanupUser(METH_EMAIL);
  await cleanupUser(PARENT_EMAIL);
  await request(app).post('/api/auth/register').send({ email: METH_EMAIL, password: PASSWORD, name: 'Meth' });
  await request(app).post('/api/auth/register').send({ email: PARENT_EMAIL, password: PASSWORD, name: 'Parent' });
  await prisma.user.update({ where: { email: METH_EMAIL }, data: { role: 'METHODIST' } });
  methCookies = await login(METH_EMAIL);
  parentCookies = await login(PARENT_EMAIL);
});

afterAll(async () => {
  await cleanupUser(METH_EMAIL);
  await cleanupUser(PARENT_EMAIL);
  await prisma.$disconnect();
});

describe('lesson templates (scene constructor)', () => {
  it('parent cannot access the constructor', async () => {
    const res = await request(app).get('/api/academy/lesson-templates').set('Cookie', parentCookies);
    expect(res.status).toBe(403);
  });

  it('methodist creates a template with a valid empty scene', async () => {
    const res = await request(app)
      .post('/api/academy/lesson-templates')
      .set('Cookie', methCookies)
      .send({ title: 'Замок чисел' });
    expect(res.status).toBe(201);
    expect(res.body.template.title).toBe('Замок чисел');
    expect(Array.isArray(res.body.template.scene.layers)).toBe(true);
    templateId = res.body.template.id;
  });

  it('lists own templates', async () => {
    const res = await request(app).get('/api/academy/lesson-templates').set('Cookie', methCookies);
    expect(res.status).toBe(200);
    expect(res.body.items.some((t: { id: string }) => t.id === templateId)).toBe(true);
  });

  it('saves a draft scene as-is (loose)', async () => {
    const res = await request(app)
      .patch(`/api/academy/lesson-templates/${templateId}`)
      .set('Cookie', methCookies)
      .send({ scene: { formatVersion: 1, layers: [{ id: 'x', elements: [] }], title: 'wip' } });
    expect(res.status).toBe(200);
    expect(res.body.template.scene.title).toBe('wip');
  });

  it('rejects a scene without layers array', async () => {
    const res = await request(app)
      .patch(`/api/academy/lesson-templates/${templateId}`)
      .set('Cookie', methCookies)
      .send({ scene: { formatVersion: 1 } });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_SCENE_SHAPE');
  });

  it('refuses to publish an invalid scene', async () => {
    const res = await request(app)
      .patch(`/api/academy/lesson-templates/${templateId}`)
      .set('Cookie', methCookies)
      .send({ status: 'published' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('SCENE_INVALID');
  });

  it('deletes the template', async () => {
    const res = await request(app).delete(`/api/academy/lesson-templates/${templateId}`).set('Cookie', methCookies);
    expect(res.status).toBe(200);
    const gone = await request(app).get(`/api/academy/lesson-templates/${templateId}`).set('Cookie', methCookies);
    expect(gone.status).toBe(404);
  });
});
