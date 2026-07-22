import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { prisma } from '@allvision/database';
import { app } from '../app';
import { addAcademyDeletionJob } from '../queues';

jest.mock('../queues', () => ({
  addAcademyDeletionJob: jest.fn().mockResolvedValue({ id: 'academy-deletion-job-test' }),
  addAcademyGenerationJob: jest.fn(),
  addCharacterProfileJob: jest.fn(),
  addProjectJob: jest.fn(),
  addFairyTaleScriptJob: jest.fn(),
  addCharacterJob: jest.fn(),
  addEpisodeJob: jest.fn(),
  addServicePipelineJob: jest.fn(),
}));

const RUN = Date.now();
const PASSWORD = 'password123';
const EMAILS = {
  parent: `a10-parent-${RUN}@example.com`,
  teacher: `a10-teacher-${RUN}@example.com`,
  outsider: `a10-outsider-${RUN}@example.com`,
  admin: `a10-admin-${RUN}@example.com`,
};
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
const STORAGE_ENV = [
  'CHILD_PHOTOS_DIR',
  'CHARACTER_REFS_DIR',
  'CHILD_ASSETS_DIR',
  'ACADEMY_MESSAGES_DIR',
  'PAYOUT_PROOFS_DIR',
] as const;

let tempRoot = '';
const originalEnv = new Map<string, string | undefined>();
let parentCookies: string[] = [];
let teacherCookies: string[] = [];
let outsiderCookies: string[] = [];
let adminCookies: string[] = [];
let parentId = '';
let teacherId = '';
let teacherProfileId = '';
let childId = '';
let threadId = '';
let lessonId = '';
let secondLessonId = '';
let reportId = '';
let reportAssetId = '';
let referenceId = '';
let projectId = '';
let serviceId = '';
let firstStartsAt = new Date();
let secondStartsAt = new Date();

async function register(email: string) {
  const response = await request(app)
    .post('/api/auth/register')
    .send({ email, password: PASSWORD, name: email.split('@')[0] });
  expect(response.status).toBe(201);
}

async function login(email: string): Promise<string[]> {
  const response = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
  expect(response.status).toBe(200);
  const cookies = response.headers['set-cookie'] as unknown as string[] | string;
  return Array.isArray(cookies) ? cookies : [cookies];
}

async function setRoleAndLogin(email: string, role: 'TEACHER' | 'ADMIN') {
  await prisma.user.update({ where: { email }, data: { role } });
  return login(email);
}

async function writePrivate(rootEnv: typeof STORAGE_ENV[number], storageKey: string, contents = PNG) {
  const target = path.join(process.env[rootEnv]!, ...storageKey.split('/'));
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, contents);
}

async function createBookedLesson(startsAt: Date) {
  const slot = await request(app)
    .post('/api/academy/teacher/slots')
    .set('Cookie', teacherCookies)
    .send({ startsAt: startsAt.toISOString(), durationMin: 25 });
  expect(slot.status).toBe(201);
  await prisma.lessonCredit.create({
    data: { parentId, durationMin: 25, source: 'manual' },
  });
  const booking = await request(app)
    .post('/api/academy/booking')
    .set('Cookie', parentCookies)
    .send({ childId, slotId: slot.body.slot.id });
  expect(booking.status).toBe(201);
  return booking.body.lessonId as string;
}

function day(value: Date) {
  return value.toISOString().slice(0, 10);
}

beforeAll(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'allvision-a10-api-'));
  for (const key of STORAGE_ENV) {
    originalEnv.set(key, process.env[key]);
    process.env[key] = path.join(tempRoot, key.toLowerCase());
  }

  for (const email of Object.values(EMAILS)) await register(email);
  parentCookies = await login(EMAILS.parent);
  outsiderCookies = await login(EMAILS.outsider);
  teacherCookies = await setRoleAndLogin(EMAILS.teacher, 'TEACHER');
  adminCookies = await setRoleAndLogin(EMAILS.admin, 'ADMIN');
  const parent = await prisma.user.findUniqueOrThrow({ where: { email: EMAILS.parent } });
  const teacher = await prisma.user.findUniqueOrThrow({ where: { email: EMAILS.teacher } });
  parentId = parent.id;
  teacherId = teacher.id;

  const child = await request(app)
    .post('/api/family/children')
    .set('Cookie', parentCookies)
    .send({ name: 'Ученик A10', birthDate: '2018-05-10', notes: 'Персональная заметка' });
  expect(child.status).toBe(201);
  childId = child.body.id;

  const profile = await prisma.characterProfile.create({
    data: { childId, status: 'APPROVED', progress: 100, approvedAt: new Date() },
  });
  const referenceKey = `${parentId}/${childId}/reference.jpg`;
  const reference = await prisma.characterReference.create({
    data: { profileId: profile.id, kind: 'full_body', storageKey: referenceKey, mimeType: 'image/jpeg' },
  });
  referenceId = reference.id;
  await writePrivate('CHARACTER_REFS_DIR', referenceKey);

  const service = await prisma.service.create({
    data: {
      slug: `a10-private-project-${RUN}`,
      title: 'A10 private project',
      shortDesc: 'A10 cleanup fixture',
      description: 'A10 cleanup fixture for a child-owned generation project.',
      category: 'TRENDS_MEMES',
      priceTokens: 1,
      costUsd: 0,
      processingType: 'AUTO',
      aiProvider: 'mock',
      aiModel: 'mock',
    },
  });
  serviceId = service.id;
  const project = await prisma.project.create({
    data: {
      userId: parentId,
      serviceId,
      title: 'Персональная генерация ребёнка',
      status: 'COMPLETED',
      progress: 100,
      inputImages: ['/static/user-inputs/a10/child-source.jpg'],
      resultImage: `/static/results/a10-${RUN}.jpg`,
      tokensCost: 1,
      completedAt: new Date(),
    },
  });
  projectId = project.id;
  const assetKey = `${parentId}/${childId}/report-result.jpg`;
  const asset = await prisma.childAsset.create({
    data: {
      childId,
      createdById: teacherId,
      kind: 'project',
      title: 'Результат занятия',
      tags: ['academy', 'a10-test'],
      storageKey: assetKey,
      mimeType: 'image/jpeg',
      fileSize: PNG.length,
      sourceRefIds: [referenceId],
      generationProjectId: projectId,
    },
  });
  reportAssetId = asset.id;
  await writePrivate('CHILD_ASSETS_DIR', assetKey);

  firstStartsAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
  secondStartsAt = new Date(Date.now() + 9 * 24 * 60 * 60 * 1000);
  lessonId = await createBookedLesson(firstStartsAt);
  teacherProfileId = (await prisma.teacherProfile.findUniqueOrThrow({ where: { userId: teacherId } })).id;
});

afterAll(async () => {
  await prisma.accessLog.deleteMany({ where: { OR: [{ actorId: parentId }, { childId }] } });
  await prisma.deletionLog.deleteMany({ where: { requestedById: parentId } });
  await prisma.aIUsageLog.deleteMany({ where: { projectId } });
  await prisma.project.deleteMany({ where: { id: projectId } });
  for (const email of [EMAILS.parent, EMAILS.teacher, EMAILS.outsider, EMAILS.admin]) {
    await prisma.user.delete({ where: { email } }).catch(() => undefined);
  }
  if (serviceId) await prisma.service.delete({ where: { id: serviceId } }).catch(() => undefined);
  for (const key of STORAGE_ENV) {
    const value = originalEnv.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  await fs.rm(tempRoot, { recursive: true, force: true });
  await prisma.$disconnect();
});

describe('A10 messenger permissions', () => {
  it('creates one thread on the first booking and lets parent, teacher and admin participate', async () => {
    const parentList = await request(app)
      .get('/api/academy/operations/threads')
      .set('Cookie', parentCookies);
    expect(parentList.status).toBe(200);
    expect(parentList.body.threads).toHaveLength(1);
    threadId = parentList.body.threads[0].id;

    const parentMessage = await request(app)
      .post(`/api/academy/operations/threads/${threadId}/messages`)
      .set('Cookie', parentCookies)
      .field('body', 'Добрый день! Прикладываю изображение.')
      .attach('image', PNG, { filename: 'question.png', contentType: 'image/png' });
    expect(parentMessage.status).toBe(201);
    expect(parentMessage.body.message.role).toBe('PARENT');
    expect(parentMessage.body.message.attachment.fileUrl).toContain(threadId);

    const teacherRead = await request(app)
      .get(`/api/academy/operations/threads/${threadId}/messages`)
      .set('Cookie', teacherCookies);
    expect(teacherRead.status).toBe(200);
    expect(teacherRead.body.messages.some((item: { role: string }) => item.role === 'SYSTEM')).toBe(true);
    expect(teacherRead.body.messages.some((item: { role: string }) => item.role === 'PARENT')).toBe(true);

    const adminMessage = await request(app)
      .post(`/api/academy/operations/threads/${threadId}/messages`)
      .set('Cookie', adminCookies)
      .send({ body: 'Администратор подключился к диалогу.' });
    expect(adminMessage.status).toBe(201);
    expect(adminMessage.body.message.role).toBe('ADMIN');
  });

  it('does not reveal a foreign thread', async () => {
    const foreign = await request(app)
      .get(`/api/academy/operations/threads/${threadId}/messages`)
      .set('Cookie', outsiderCookies);
    expect(foreign.status).toBe(404);
    expect(foreign.body.error.code).toBe('THREAD_NOT_FOUND');
  });
});

describe('A10 lesson report and access audit', () => {
  it('moves a completed lesson to REPORT_SENT and lets the parent read the report result', async () => {
    const completed = await request(app)
      .post(`/api/academy/teacher/lessons/${lessonId}/status`)
      .set('Cookie', teacherCookies)
      .send({ status: 'COMPLETED' });
    expect(completed.status).toBe(200);

    const sent = await request(app)
      .post(`/api/academy/operations/teacher/lessons/${lessonId}/report`)
      .set('Cookie', teacherCookies)
      .send({
        summary: 'Повторили тему занятия и завершили проект.',
        successes: 'Самостоятельно выполнил основную часть задания.',
        recommendation: 'Повторить новые слова перед следующим уроком.',
        resultAssetIds: [reportAssetId],
      });
    expect(sent.status).toBe(200);
    expect(sent.body.report.resultAssets).toHaveLength(1);
    reportId = sent.body.report.id;
    expect((await prisma.lesson.findUniqueOrThrow({ where: { id: lessonId } })).status).toBe('REPORT_SENT');

    const reports = await request(app)
      .get(`/api/academy/operations/reports?childId=${childId}`)
      .set('Cookie', parentCookies);
    expect(reports.status).toBe(200);
    expect(reports.body.reports[0].parentReadAt).toBeNull();
    const file = await request(app)
      .get(`/api/academy/operations/reports/${reportId}/assets/${reportAssetId}/file`)
      .set('Cookie', parentCookies);
    expect(file.status).toBe(200);
    expect(file.headers['cache-control']).toContain('private');
    const read = await request(app)
      .post(`/api/academy/operations/reports/${reportId}/read`)
      .set('Cookie', parentCookies);
    expect(read.status).toBe(200);
    expect((await prisma.lessonReport.findUniqueOrThrow({ where: { id: reportId } })).parentReadAt).not.toBeNull();
  });

  it('logs who viewed a private character reference', async () => {
    const file = await request(app)
      .get(`/api/family/children/${childId}/character/references/${referenceId}/file`)
      .set('Cookie', parentCookies);
    expect(file.status).toBe(200);
    const audit = await prisma.accessLog.findFirst({
      where: { actorId: parentId, childId, resourceType: 'CHARACTER_REFERENCE', resourceId: referenceId },
    });
    expect(audit?.action).toBe('VIEW');
    expect(audit?.actorRole).toBe('PARENT');
  });
});

describe('A10 payout statuses', () => {
  it('prepares and marks a payout paid with a private proof', async () => {
    const forbidden = await request(app)
      .get(`/api/admin/payouts?periodStart=${day(firstStartsAt)}&periodEnd=${day(firstStartsAt)}`)
      .set('Cookie', parentCookies);
    expect(forbidden.status).toBe(403);

    const prepared = await request(app)
      .post(`/api/admin/payouts/teachers/${teacherProfileId}/prepare`)
      .set('Cookie', adminCookies)
      .send({ periodStart: day(firstStartsAt), periodEnd: day(firstStartsAt) });
    expect(prepared.status).toBe(201);
    expect(prepared.body.payout.status).toBe('AVAILABLE');
    expect(prepared.body.payout.amountRub).toBe(300);

    const paid = await request(app)
      .post(`/api/admin/payouts/${prepared.body.payout.id}/pay`)
      .set('Cookie', adminCookies)
      .attach('proof', Buffer.from('%PDF-1.4 A10 payment proof'), {
        filename: 'payment.pdf',
        contentType: 'application/pdf',
      });
    expect(paid.status).toBe(200);
    expect(paid.body.payout.status).toBe('PAID');
    expect(paid.body.payout.confirmationFileUrl).toContain('/api/admin/payouts/');
    expect((await prisma.teacherEarning.findUniqueOrThrow({ where: { lessonId } })).status).toBe('PAID');

    const proof = await request(app)
      .get(paid.body.payout.confirmationFileUrl)
      .set('Cookie', adminCookies);
    expect(proof.status).toBe(200);
    expect(proof.headers['content-type']).toContain('application/pdf');
  });

  it('keeps a second booking in the same thread and supports rejected corrections', async () => {
    secondLessonId = await createBookedLesson(secondStartsAt);
    expect(await prisma.thread.count({ where: { parentId, teacherId: teacherProfileId, childId } })).toBe(1);
    const completed = await request(app)
      .post(`/api/academy/teacher/lessons/${secondLessonId}/status`)
      .set('Cookie', teacherCookies)
      .send({ status: 'COMPLETED' });
    expect(completed.status).toBe(200);
    const prepared = await request(app)
      .post(`/api/admin/payouts/teachers/${teacherProfileId}/prepare`)
      .set('Cookie', adminCookies)
      .send({ periodStart: day(secondStartsAt), periodEnd: day(secondStartsAt) });
    expect(prepared.status).toBe(201);
    const rejected = await request(app)
      .post(`/api/admin/payouts/${prepared.body.payout.id}/reject`)
      .set('Cookie', adminCookies)
      .send({ reason: 'Требуется корректировка суммы.' });
    expect(rejected.status).toBe(200);
    expect(rejected.body.payout.status).toBe('REJECTED');
    expect((await prisma.teacherEarning.findUniqueOrThrow({ where: { lessonId: secondLessonId } })).status)
      .toBe('REJECTED');
  });
});

describe('A10 child data deletion', () => {
  it('anonymizes learning data, removes personal rows, preserves finance and queues every file root', async () => {
    const response = await request(app)
      .delete(`/api/family/children/${childId}`)
      .set('Cookie', parentCookies);
    expect(response.status).toBe(202);
    expect(response.body.deletion.scope).toBe('CHILD');

    const child = await prisma.childProfile.findUniqueOrThrow({ where: { id: childId } });
    expect(child.deletedAt).not.toBeNull();
    expect(child.anonymizedKey).toHaveLength(64);
    expect(child.name).not.toBe('Ученик A10');
    expect(child.birthDate).toBeNull();
    expect(child.notes).toBeNull();
    expect(await prisma.thread.count({ where: { childId } })).toBe(0);
    expect(await prisma.lessonReport.count({ where: { lesson: { childId } } })).toBe(0);
    expect(await prisma.characterProfile.count({ where: { childId } })).toBe(0);
    expect(await prisma.childAsset.count({ where: { childId } })).toBe(0);
    expect(await prisma.lesson.count({ where: { childId } })).toBe(2);
    expect(await prisma.teacherEarning.count({ where: { lesson: { childId } } })).toBe(2);

    const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    expect(project.status).toBe('FAILED');
    expect(project.inputImages).toEqual([]);
    expect(project.resultImage).toBeNull();
    const access = await prisma.accessLog.findFirstOrThrow({ where: { childId } });
    expect(access.resourceId).toMatch(/^deleted:[a-f0-9]{64}$/);

    expect(addAcademyDeletionJob).toHaveBeenCalled();
    const job = jest.mocked(addAcademyDeletionJob).mock.calls.at(-1)![0];
    expect(job).toMatchObject({ scope: 'CHILD', parentId, childIds: [childId] });
    expect(job.publicStorageKeys).toContain(`results/a10-${RUN}.jpg`);

    const status = await request(app)
      .get(`/api/family/deletions/${response.body.deletion.id}`)
      .set('Cookie', parentCookies);
    expect(status.status).toBe(200);
    expect(status.body.deletion.status).toBe('PENDING');
  });
});
