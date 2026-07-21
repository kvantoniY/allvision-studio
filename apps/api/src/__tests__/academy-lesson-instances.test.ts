import request from 'supertest';
import { prisma } from '@allvision/database';
import { app } from '../app';

const METH_EMAIL = `li-meth-${Date.now()}@example.com`;
const TEACHER_EMAIL = `li-teacher-${Date.now()}@example.com`;
const PARENT_EMAIL = `li-parent-${Date.now()}@example.com`;
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
let teacherCookies: string[] = [];
let parentCookies: string[] = [];
let templateId = '';

beforeAll(async () => {
  for (const email of [METH_EMAIL, TEACHER_EMAIL, PARENT_EMAIL]) await cleanupUser(email);
  await request(app).post('/api/auth/register').send({ email: METH_EMAIL, password: PASSWORD, name: 'M' });
  await request(app).post('/api/auth/register').send({ email: TEACHER_EMAIL, password: PASSWORD, name: 'T' });
  await request(app).post('/api/auth/register').send({ email: PARENT_EMAIL, password: PASSWORD, name: 'P' });
  await prisma.user.update({ where: { email: METH_EMAIL }, data: { role: 'METHODIST' } });
  await prisma.user.update({ where: { email: TEACHER_EMAIL }, data: { role: 'TEACHER' } });
  methCookies = await login(METH_EMAIL);
  teacherCookies = await login(TEACHER_EMAIL);
  parentCookies = await login(PARENT_EMAIL);
});

afterAll(async () => {
  for (const email of [METH_EMAIL, TEACHER_EMAIL, PARENT_EMAIL]) await cleanupUser(email);
  await prisma.$disconnect();
});

describe('lesson template versions', () => {
  it('methodist creates and publishes a template → version 1', async () => {
    const create = await request(app).post('/api/academy/lesson-templates').set('Cookie', methCookies).send({ title: 'Замок чисел' });
    templateId = create.body.template.id;

    const publish = await request(app).post(`/api/academy/lesson-templates/${templateId}/publish`).set('Cookie', methCookies);
    expect(publish.status).toBe(201);
    expect(publish.body.version.version).toBe(1);

    const versions = await request(app).get(`/api/academy/lesson-templates/${templateId}/versions`).set('Cookie', methCookies);
    expect(versions.body.items).toHaveLength(1);
  });

  it('publishing again bumps the version', async () => {
    const publish = await request(app).post(`/api/academy/lesson-templates/${templateId}/publish`).set('Cookie', methCookies);
    expect(publish.body.version.version).toBe(2);
  });
});

describe('lesson instances access', () => {
  it('teacher sees the published template in the picker', async () => {
    const res = await request(app).get('/api/academy/lesson-instances/published-templates').set('Cookie', teacherCookies);
    expect(res.status).toBe(200);
    expect(res.body.items.some((t: { templateId: string }) => t.templateId === templateId)).toBe(true);
  });

  it('parent cannot list published templates', async () => {
    const res = await request(app).get('/api/academy/lesson-instances/published-templates').set('Cookie', parentCookies);
    expect(res.status).toBe(403);
  });

  it('creating an instance for a non-existent lesson is 404', async () => {
    const version = await prisma.lessonTemplateVersion.findFirst({ where: { templateId } });
    const res = await request(app)
      .post('/api/academy/lesson-instances')
      .set('Cookie', teacherCookies)
      .send({ lessonId: 'nope', templateVersionId: version!.id });
    expect(res.status).toBe(404);
  });
});
