import request from 'supertest';
import { prisma } from '@allvision/database';
import { CONSENT_TYPES } from '@allvision/shared';
import { app } from '../app';

const PARENT_EMAIL = `family-parent-${Date.now()}@example.com`;
const OTHER_EMAIL = `family-other-${Date.now()}@example.com`;
const PASSWORD = 'password123';

// 1x1 PNG
const PNG_BUFFER = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

async function cleanupUser(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return;
  await prisma.tokenTransaction.deleteMany({ where: { userId: user.id } });
  await prisma.user.delete({ where: { id: user.id } });
}

async function registerAndLogin(email: string) {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ email, password: PASSWORD, name: 'Family Test' });
  expect(res.status).toBe(201);
  const cookies = res.headers['set-cookie'] as unknown as string[] | string;
  return Array.isArray(cookies) ? cookies : [cookies];
}

let parentCookies: string[] = [];
let otherCookies: string[] = [];
let childId = '';

beforeAll(async () => {
  await cleanupUser(PARENT_EMAIL);
  await cleanupUser(OTHER_EMAIL);
  parentCookies = await registerAndLogin(PARENT_EMAIL);
  otherCookies = await registerAndLogin(OTHER_EMAIL);
});

afterAll(async () => {
  await cleanupUser(PARENT_EMAIL);
  await cleanupUser(OTHER_EMAIL);
  await prisma.$disconnect();
});

describe('family: children CRUD', () => {
  it('registration creates PARENT role', async () => {
    const user = await prisma.user.findUnique({ where: { email: PARENT_EMAIL } });
    expect(user?.role).toBe('PARENT');
  });

  it('requires auth', async () => {
    const res = await request(app).get('/api/family/children');
    expect(res.status).toBe(401);
  });

  it('creates a child profile', async () => {
    const res = await request(app)
      .post('/api/family/children')
      .set('Cookie', parentCookies)
      .send({ name: 'Маша', birthDate: '2018-05-10', notes: 'Любит космос' });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Маша');
    expect(res.body.photoConsentsComplete).toBe(false);
    expect(res.body.level).toBe(1);
    childId = res.body.id;
  });

  it('rejects an invalid birth date', async () => {
    const res = await request(app)
      .post('/api/family/children')
      .set('Cookie', parentCookies)
      .send({ name: 'X', birthDate: '1980-01-01' });
    expect(res.status).toBe(400);
  });

  it('lists only own children', async () => {
    const mine = await request(app).get('/api/family/children').set('Cookie', parentCookies);
    expect(mine.status).toBe(200);
    expect(mine.body.items).toHaveLength(1);

    const theirs = await request(app).get('/api/family/children').set('Cookie', otherCookies);
    expect(theirs.status).toBe(200);
    expect(theirs.body.items).toHaveLength(0);
  });

  it('foreign child is 404 (existence is not revealed)', async () => {
    const res = await request(app)
      .patch(`/api/family/children/${childId}`)
      .set('Cookie', otherCookies)
      .send({ name: 'Hacked' });
    expect(res.status).toBe(404);
  });

  it('updates a child profile', async () => {
    const res = await request(app)
      .patch(`/api/family/children/${childId}`)
      .set('Cookie', parentCookies)
      .send({ name: 'Маша П.' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Маша П.');
  });
});

describe('family: consents gate photo uploads', () => {
  it('blocks photo upload until all consents accepted', async () => {
    const res = await request(app)
      .post(`/api/family/children/${childId}/photos`)
      .set('Cookie', parentCookies)
      .attach('photos', PNG_BUFFER, { filename: 'face.png', contentType: 'image/png' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CONSENTS_REQUIRED');
  });

  it('accepts consents', async () => {
    const res = await request(app)
      .post(`/api/family/children/${childId}/consents`)
      .set('Cookie', parentCookies)
      .send({ types: [...CONSENT_TYPES] });
    expect(res.status).toBe(200);
    expect(res.body.photoConsentsComplete).toBe(true);
    expect(res.body.consents).toHaveLength(CONSENT_TYPES.length);
  });

  it('uploads and serves a photo through the authorized endpoint', async () => {
    const upload = await request(app)
      .post(`/api/family/children/${childId}/photos`)
      .set('Cookie', parentCookies)
      .attach('photos', PNG_BUFFER, { filename: 'face.png', contentType: 'image/png' });
    expect(upload.status).toBe(201);
    expect(upload.body.items).toHaveLength(1);
    const photo = upload.body.items[0];
    expect(photo.fileUrl).toContain(`/api/family/children/${childId}/photos/`);

    const file = await request(app).get(photo.fileUrl).set('Cookie', parentCookies);
    expect(file.status).toBe(200);
    expect(file.headers['content-type']).toContain('image/png');

    const foreign = await request(app).get(photo.fileUrl).set('Cookie', otherCookies);
    expect(foreign.status).toBe(404);
  });

  it('revoking a consent blocks further uploads', async () => {
    const revoke = await request(app)
      .delete(`/api/family/children/${childId}/consents/IMAGE_PROCESSING`)
      .set('Cookie', parentCookies);
    expect(revoke.status).toBe(200);
    expect(revoke.body.photoConsentsComplete).toBe(false);

    const res = await request(app)
      .post(`/api/family/children/${childId}/photos`)
      .set('Cookie', parentCookies)
      .attach('photos', PNG_BUFFER, { filename: 'face2.png', contentType: 'image/png' });
    expect(res.status).toBe(403);
  });

  it('deleting the child cascades photos and consents', async () => {
    const res = await request(app)
      .delete(`/api/family/children/${childId}`)
      .set('Cookie', parentCookies);
    expect(res.status).toBe(200);

    expect(await prisma.childPhoto.count({ where: { childId } })).toBe(0);
    expect(await prisma.consent.count({ where: { childId } })).toBe(0);
  });
});

describe('family: AI character profile', () => {
  let charChildId = '';

  it('sets up a child with consents and a photo', async () => {
    const created = await request(app)
      .post('/api/family/children')
      .set('Cookie', parentCookies)
      .send({ name: 'Персонаж-тест', birthDate: '2017-03-03' });
    expect(created.status).toBe(201);
    charChildId = created.body.id;

    await request(app)
      .post(`/api/family/children/${charChildId}/consents`)
      .set('Cookie', parentCookies)
      .send({ types: [...CONSENT_TYPES] });
    const upload = await request(app)
      .post(`/api/family/children/${charChildId}/photos`)
      .set('Cookie', parentCookies)
      .attach('photos', PNG_BUFFER, { filename: 'face.png', contentType: 'image/png' });
    expect(upload.status).toBe(201);
  });

  it('character is null before generation', async () => {
    const res = await request(app)
      .get(`/api/family/children/${charChildId}/character`)
      .set('Cookie', parentCookies);
    expect(res.status).toBe(200);
    expect(res.body.profile).toBeNull();
  });

  it('starts generation and marks profile GENERATING', async () => {
    const res = await request(app)
      .post(`/api/family/children/${charChildId}/character/generate`)
      .set('Cookie', parentCookies);
    expect(res.status).toBe(202);
    expect(res.body.profile.status).toBe('GENERATING');

    // Контейнер-проект для AIUsageLog/SSE создан.
    const project = await prisma.project.findFirst({
      where: { mode: 'character-profile', inputText: res.body.profile.id },
    });
    expect(project).not.toBeNull();
  });

  it('rejects a second generation while one is in progress', async () => {
    const res = await request(app)
      .post(`/api/family/children/${charChildId}/character/generate`)
      .set('Cookie', parentCookies);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('GENERATION_IN_PROGRESS');
  });

  it('foreign parent cannot see or generate the character', async () => {
    const get = await request(app)
      .get(`/api/family/children/${charChildId}/character`)
      .set('Cookie', otherCookies);
    expect(get.status).toBe(404);
  });

  it('approve is rejected until the profile is READY', async () => {
    const res = await request(app)
      .post(`/api/family/children/${charChildId}/character/approve`)
      .set('Cookie', parentCookies);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CHARACTER_NOT_READY');
  });

  it('generation requires photos', async () => {
    const bare = await request(app)
      .post('/api/family/children')
      .set('Cookie', parentCookies)
      .send({ name: 'Без фото' });
    await request(app)
      .post(`/api/family/children/${bare.body.id}/consents`)
      .set('Cookie', parentCookies)
      .send({ types: [...CONSENT_TYPES] });
    const res = await request(app)
      .post(`/api/family/children/${bare.body.id}/character/generate`)
      .set('Cookie', parentCookies);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('PHOTOS_REQUIRED');
    await request(app).delete(`/api/family/children/${bare.body.id}`).set('Cookie', parentCookies);
  });

  afterAll(async () => {
    if (charChildId) {
      await request(app).delete(`/api/family/children/${charChildId}`).set('Cookie', parentCookies);
    }
  });
});

describe('academy curriculum access', () => {
  it('parent cannot manage curriculum', async () => {
    const res = await request(app).get('/api/academy/curriculum').set('Cookie', parentCookies);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN_ROLE');
  });

  it('methodist can read the curriculum tree', async () => {
    await prisma.user.update({ where: { email: OTHER_EMAIL }, data: { role: 'METHODIST' } });
    // Свежий логин: роль зашита в access-токен.
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: OTHER_EMAIL, password: PASSWORD });
    expect(login.status).toBe(200);
    const cookies = login.headers['set-cookie'] as unknown as string[] | string;
    const methodistCookies = Array.isArray(cookies) ? cookies : [cookies];

    const res = await request(app).get('/api/academy/curriculum').set('Cookie', methodistCookies);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.subjects)).toBe(true);
    expect(Array.isArray(res.body.skills)).toBe(true);
  });

  it('methodist can create subject -> course -> module -> topic with skills', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: OTHER_EMAIL, password: PASSWORD });
    const cookies = login.headers['set-cookie'] as unknown as string[] | string;
    const methodistCookies = Array.isArray(cookies) ? cookies : [cookies];
    const suffix = Date.now();

    const subject = await request(app)
      .post('/api/academy/curriculum/subjects')
      .set('Cookie', methodistCookies)
      .send({ slug: `english-test-${suffix}`, title: 'Английский язык' });
    expect(subject.status).toBe(201);

    const skill = await request(app)
      .post('/api/academy/curriculum/skills')
      .set('Cookie', methodistCookies)
      .send({ subjectId: subject.body.id, slug: `numbers-1-10-${suffix}`, title: 'Знает числа 1–10' });
    expect(skill.status).toBe(201);

    const course = await request(app)
      .post('/api/academy/curriculum/courses')
      .set('Cookie', methodistCookies)
      .send({ subjectId: subject.body.id, slug: `english-a0-${suffix}`, title: 'Английский A0', level: 'A0', ageMin: 5, ageMax: 8 });
    expect(course.status).toBe(201);

    const module = await request(app)
      .post('/api/academy/curriculum/modules')
      .set('Cookie', methodistCookies)
      .send({ courseId: course.body.id, title: 'Числа и счёт' });
    expect(module.status).toBe(201);

    const topic = await request(app)
      .post('/api/academy/curriculum/topics')
      .set('Cookie', methodistCookies)
      .send({
        moduleId: module.body.id,
        title: 'Замок чисел',
        durationMin: 25,
        goal: 'Числа от 1 до 10',
        skillIds: [skill.body.id],
      });
    expect(topic.status).toBe(201);
    expect(topic.body.skills).toHaveLength(1);

    const badDuration = await request(app)
      .post('/api/academy/curriculum/topics')
      .set('Cookie', methodistCookies)
      .send({ moduleId: module.body.id, title: 'X', durationMin: 30 });
    expect(badDuration.status).toBe(400);

    // Каскадное удаление направления зачищает всё дерево.
    const del = await request(app)
      .delete(`/api/academy/curriculum/subjects/${subject.body.id}`)
      .set('Cookie', methodistCookies);
    expect(del.status).toBe(200);
    expect(await prisma.course.findUnique({ where: { id: course.body.id } })).toBeNull();
    expect(await prisma.topic.findUnique({ where: { id: topic.body.id } })).toBeNull();
  });
});
