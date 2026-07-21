import request from 'supertest';
import { prisma } from '@allvision/database';
import { app } from '../app';

const PARENT_EMAIL = `progress-parent-${Date.now()}@example.com`;
const METHODIST_EMAIL = `progress-meth-${Date.now()}@example.com`;
const PASSWORD = 'password123';

async function cleanupUser(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return;
  await prisma.tokenTransaction.deleteMany({ where: { userId: user.id } });
  await prisma.user.delete({ where: { id: user.id } });
}

async function registerAndLogin(email: string) {
  const res = await request(app).post('/api/auth/register').send({ email, password: PASSWORD, name: 'Progress Test' });
  const cookies = res.headers['set-cookie'] as unknown as string[] | string;
  return Array.isArray(cookies) ? cookies : [cookies];
}

let parentCookies: string[] = [];
let methodistCookies: string[] = [];
let childId = '';
let courseId = '';
let topic1 = '';
let topic2 = '';
let skillId = '';
let enrollmentId = '';
const createdSubjectIds: string[] = [];

beforeAll(async () => {
  await cleanupUser(PARENT_EMAIL);
  await cleanupUser(METHODIST_EMAIL);
  parentCookies = await registerAndLogin(PARENT_EMAIL);
  await registerAndLogin(METHODIST_EMAIL);
  await prisma.user.update({ where: { email: METHODIST_EMAIL }, data: { role: 'METHODIST' } });
  const login = await request(app).post('/api/auth/login').send({ email: METHODIST_EMAIL, password: PASSWORD });
  const cookies = login.headers['set-cookie'] as unknown as string[] | string;
  methodistCookies = Array.isArray(cookies) ? cookies : [cookies];

  // Дерево программы через методиста
  const suffix = Date.now();
  const subject = await request(app).post('/api/academy/curriculum/subjects').set('Cookie', methodistCookies).send({ slug: `prog-eng-${suffix}`, title: 'Английский' });
  createdSubjectIds.push(subject.body.id);
  const skill = await request(app).post('/api/academy/curriculum/skills').set('Cookie', methodistCookies).send({ subjectId: subject.body.id, slug: `prog-num-${suffix}`, title: 'Числа 1–10' });
  skillId = skill.body.id;
  const course = await request(app).post('/api/academy/curriculum/courses').set('Cookie', methodistCookies).send({ subjectId: subject.body.id, slug: `prog-a0-${suffix}`, title: 'Английский A0' });
  courseId = course.body.id;
  const module = await request(app).post('/api/academy/curriculum/modules').set('Cookie', methodistCookies).send({ courseId, title: 'Модуль 1' });
  const t1 = await request(app).post('/api/academy/curriculum/topics').set('Cookie', methodistCookies).send({ moduleId: module.body.id, title: 'Замок чисел', durationMin: 25, skillIds: [skillId] });
  topic1 = t1.body.id;
  const t2 = await request(app).post('/api/academy/curriculum/topics').set('Cookie', methodistCookies).send({ moduleId: module.body.id, title: 'Космическое кафе', durationMin: 45, sortOrder: 1 });
  topic2 = t2.body.id;

  const childRes = await request(app).post('/api/family/children').set('Cookie', parentCookies).send({ name: 'Прогресс-тест' });
  childId = childRes.body.id;
});

afterAll(async () => {
  for (const id of createdSubjectIds) {
    await prisma.subject.delete({ where: { id } }).catch(() => undefined);
  }
  await cleanupUser(PARENT_EMAIL);
  await cleanupUser(METHODIST_EMAIL);
  await prisma.$disconnect();
});

describe('family enrollment + progress', () => {
  it('parent sees available courses', async () => {
    const res = await request(app).get('/api/family/courses').set('Cookie', parentCookies);
    expect(res.status).toBe(200);
    expect(res.body.subjects.some((s: { courses: unknown[] }) => s.courses.length > 0)).toBe(true);
  });

  it('parent enrolls child into a course', async () => {
    const res = await request(app).post(`/api/family/children/${childId}/enrollments`).set('Cookie', parentCookies).send({ courseId });
    expect(res.status).toBe(201);
    enrollmentId = res.body.enrollmentId;
  });

  it('rejects duplicate enrollment', async () => {
    const res = await request(app).post(`/api/family/children/${childId}/enrollments`).set('Cookie', parentCookies).send({ courseId });
    expect(res.status).toBe(409);
  });

  it('progress recommends the first topic and counts totals', async () => {
    const res = await request(app).get(`/api/family/children/${childId}/progress`).set('Cookie', parentCookies);
    expect(res.status).toBe(200);
    const enrollment = res.body.progress.enrollments[0];
    expect(enrollment.totalTopics).toBe(2);
    expect(enrollment.completedTopics).toBe(0);
    expect(enrollment.nextTopicId).toBe(topic1);
    expect(enrollment.topics.find((t: { topicId: string }) => t.topicId === topic1).isNextRecommended).toBe(true);
  });
});

describe('teacher/methodist progress mutations', () => {
  it('parent cannot mark topic progress', async () => {
    const res = await request(app).post('/api/academy/progress/topic').set('Cookie', parentCookies).send({ enrollmentId, topicId: topic1, status: 'COMPLETED' });
    expect(res.status).toBe(403);
  });

  it('methodist marks topic completed → next moves to topic2', async () => {
    const res = await request(app).post('/api/academy/progress/topic').set('Cookie', methodistCookies).send({ enrollmentId, topicId: topic1, status: 'COMPLETED' });
    expect(res.status).toBe(200);
    expect(res.body.progress.completedTopics).toBe(1);
    expect(res.body.progress.nextTopicId).toBe(topic2);
  });

  it('methodist sets a skill level', async () => {
    const res = await request(app).post('/api/academy/progress/skill').set('Cookie', methodistCookies).send({ childId, skillId, level: 2 });
    expect(res.status).toBe(200);
    expect(res.body.skill.level).toBe(2);
  });

  it('override changes recommended topic with a reason and logs it', async () => {
    const res = await request(app).post(`/api/academy/progress/enrollments/${enrollmentId}/override`).set('Cookie', methodistCookies).send({ toTopicId: topic1, reason: 'REPEAT', note: 'повторить числа' });
    expect(res.status).toBe(200);
    expect(res.body.progress.nextTopicId).toBe(topic1);
    const logs = await prisma.topicChangeLog.count({ where: { enrollmentId, reason: 'REPEAT' } });
    expect(logs).toBe(1);
  });

  it('completing all topics marks enrollment COMPLETED', async () => {
    await request(app).post('/api/academy/progress/topic').set('Cookie', methodistCookies).send({ enrollmentId, topicId: topic2, status: 'COMPLETED' });
    const enrollment = await prisma.enrollment.findUnique({ where: { id: enrollmentId } });
    expect(enrollment?.status).toBe('COMPLETED');
  });
});
