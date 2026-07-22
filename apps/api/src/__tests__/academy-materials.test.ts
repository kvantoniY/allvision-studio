import request from 'supertest';
import { prisma } from '@allvision/database';
import { CONSENT_CURRENT_VERSION, CONSENT_TYPES, consentTextSnapshot } from '@allvision/shared';
import { app } from '../app';
import { getStorageProvider } from '../providers';
import { addAcademyGenerationJob } from '../queues';

jest.mock('../queues', () => ({
  addAcademyGenerationJob: jest.fn().mockResolvedValue({ id: 'academy-job-test' }),
  addCharacterProfileJob: jest.fn().mockResolvedValue({ id: 'character-job-test' }),
  addProjectJob: jest.fn(),
  addFairyTaleScriptJob: jest.fn(),
  addCharacterJob: jest.fn(),
  addEpisodeJob: jest.fn(),
  addServicePipelineJob: jest.fn(),
}));

const RUN = Date.now();
const PASSWORD = 'password123';
const EMAILS = {
  parent: `a5-parent-${RUN}@example.com`,
  teacher: `a5-teacher-${RUN}@example.com`,
  otherTeacher: `a5-other-teacher-${RUN}@example.com`,
  methodist: `a5-methodist-${RUN}@example.com`,
  admin: `a5-admin-${RUN}@example.com`,
};

async function register(email: string) {
  await request(app).post('/api/auth/register').send({ email, password: PASSWORD, name: email.split('@')[0] });
}

async function login(email: string): Promise<string[]> {
  const response = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
  const cookies = response.headers['set-cookie'] as unknown as string[] | string;
  return Array.isArray(cookies) ? cookies : [cookies];
}

async function setRoleAndLogin(email: string, role: 'TEACHER' | 'METHODIST' | 'ADMIN') {
  await prisma.user.update({ where: { email }, data: { role } });
  return login(email);
}

const storageKeys: string[] = [];
const looseMediaIds: string[] = [];
let teacherCookies: string[] = [];
let otherTeacherCookies: string[] = [];
let methodistCookies: string[] = [];
let adminCookies: string[] = [];
let childId = '';
let referenceId = '';
let teacherAssetId = '';
let otherTeacherAssetId = '';
let sharedAssetId = '';

async function createMedia(ownerUserId: string | null, title: string) {
  const key = `academy/test/${RUN}/${title}.jpg`;
  const uploaded = await getStorageProvider().upload({ key, body: Buffer.from(`asset:${title}`), contentType: 'image/jpeg' });
  storageKeys.push(key);
  const asset = await prisma.mediaAsset.create({
    data: {
      kind: 'academy-background',
      groupCode: 'academy',
      title,
      tags: ['academy', `run:${RUN}`],
      ownerUserId,
      storageKey: uploaded.key,
      publicUrl: uploaded.url,
      fileSize: Buffer.byteLength(`asset:${title}`),
      mimeType: 'image/jpeg',
    },
  });
  looseMediaIds.push(asset.id);
  return asset.id;
}

beforeAll(async () => {
  for (const email of Object.values(EMAILS)) await register(email);
  teacherCookies = await setRoleAndLogin(EMAILS.teacher, 'TEACHER');
  otherTeacherCookies = await setRoleAndLogin(EMAILS.otherTeacher, 'TEACHER');
  methodistCookies = await setRoleAndLogin(EMAILS.methodist, 'METHODIST');
  adminCookies = await setRoleAndLogin(EMAILS.admin, 'ADMIN');

  const parent = await prisma.user.findUniqueOrThrow({ where: { email: EMAILS.parent } });
  const teacher = await prisma.user.findUniqueOrThrow({ where: { email: EMAILS.teacher } });
  const otherTeacher = await prisma.user.findUniqueOrThrow({ where: { email: EMAILS.otherTeacher } });
  const child = await prisma.childProfile.create({ data: { parentId: parent.id, name: 'Ученик A5' } });
  childId = child.id;
  await prisma.consent.createMany({
    data: CONSENT_TYPES.map((type) => ({
      parentId: parent.id,
      childId,
      type,
      version: CONSENT_CURRENT_VERSION,
      textSnapshot: consentTextSnapshot(type),
    })),
  });
  const profile = await prisma.characterProfile.create({ data: { childId, status: 'APPROVED', progress: 100 } });
  const ref = await prisma.characterReference.create({
    data: { profileId: profile.id, kind: 'full_body', storageKey: `${parent.id}/${childId}/test.jpg` },
  });
  referenceId = ref.id;

  const teacherProfile = await prisma.teacherProfile.create({ data: { userId: teacher.id, subjects: [] } });
  const slot = await prisma.teacherSlot.create({
    data: { teacherId: teacherProfile.id, startsAt: new Date(Date.now() + 86400_000), durationMin: 25, isBooked: true },
  });
  await prisma.lesson.create({
    data: { childId, teacherId: teacherProfile.id, slotId: slot.id, durationMin: 25, startsAt: slot.startsAt, priceRub: 1000 },
  });

  teacherAssetId = await createMedia(teacher.id, 'teacher-own');
  otherTeacherAssetId = await createMedia(otherTeacher.id, 'teacher-other');
  sharedAssetId = await createMedia(null, 'shared');
  await prisma.childAsset.create({
    data: {
      childId,
      createdById: teacher.id,
      kind: 'pose',
      title: 'Поза A5',
      tags: ['academy'],
      storageKey: `${parent.id}/${childId}/pose-test.jpg`,
      mimeType: 'image/jpeg',
      fileSize: 1,
      sourceRefIds: [referenceId],
    },
  });
});

afterAll(async () => {
  const testMedia = await prisma.mediaAsset.findMany({
    where: { OR: [{ id: { in: looseMediaIds } }, { tags: { has: `run:${RUN}` } }] },
    select: { id: true, storageKey: true },
  });
  for (const asset of testMedia) {
    storageKeys.push(asset.storageKey);
    await prisma.mediaAsset.delete({ where: { id: asset.id } }).catch(() => undefined);
  }
  const users = await prisma.user.findMany({ where: { email: { in: Object.values(EMAILS) } } });
  for (const user of users) {
    await prisma.aIUsageLog.deleteMany({ where: { userId: user.id } });
    await prisma.project.deleteMany({ where: { userId: user.id } });
    await prisma.tokenTransaction.deleteMany({ where: { userId: user.id } });
  }
  // Сначала parent: каскадно удалит child/lesson; затем преподавателей.
  for (const email of [EMAILS.parent, EMAILS.teacher, EMAILS.otherTeacher, EMAILS.methodist, EMAILS.admin]) {
    await prisma.user.delete({ where: { email } }).catch(() => undefined);
  }
  for (const key of unique(storageKeys)) await getStorageProvider().delete(key).catch(() => undefined);
  await prisma.$disconnect();
});

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

describe('academy A5 library visibility', () => {
  it('teacher sees shared, own teacher assets and assigned child assets only', async () => {
    const shared = await request(app).get('/api/academy/materials/library/shared').set('Cookie', teacherCookies);
    expect(shared.status).toBe(200);
    expect(shared.body.items.some((item: { id: string }) => item.id === sharedAssetId)).toBe(true);

    const personal = await request(app).get('/api/academy/materials/library/teacher').set('Cookie', teacherCookies);
    expect(personal.body.items.some((item: { id: string }) => item.id === teacherAssetId)).toBe(true);
    expect(personal.body.items.some((item: { id: string }) => item.id === otherTeacherAssetId)).toBe(false);

    const child = await request(app).get(`/api/academy/materials/library/child?childId=${childId}`).set('Cookie', teacherCookies);
    expect(child.status).toBe(200);
    expect(child.body.items[0].scope).toBe('child');
    expect(child.body.items[0].fileUrl).toContain('/api/academy/materials/library/child/');
    expect(child.body.items[0].dragData.type).toBe('academy-asset');
  });

  it('unassigned teacher and methodist cannot read a child library', async () => {
    const other = await request(app).get(`/api/academy/materials/library/child?childId=${childId}`).set('Cookie', otherTeacherCookies);
    expect(other.status).toBe(403);
    const methodist = await request(app).get(`/api/academy/materials/library/child?childId=${childId}`).set('Cookie', methodistCookies);
    expect(methodist.status).toBe(403);
  });

  it('admin sees all teacher assets', async () => {
    const response = await request(app).get('/api/academy/materials/library/teacher').set('Cookie', adminCookies);
    const ids = response.body.items.map((item: { id: string }) => item.id);
    expect(ids).toEqual(expect.arrayContaining([teacherAssetId, otherTeacherAssetId]));
  });
});

describe('academy A5 generation and promotion', () => {
  it('teacher launches a background into their library with a preflight estimate', async () => {
    const response = await request(app).post('/api/academy/materials/generate').set('Cookie', teacherCookies).send({
      kind: 'background',
      title: 'Замок чисел',
      prompt: 'Старинный зал замка с пятью дверями',
      model: 'nano-banana',
      maxCostUsd: 0.2,
    });
    expect(response.status).toBe(202);
    expect(response.body.generation.estimatedCostUsd).toBe(0.12);
    expect(addAcademyGenerationJob).toHaveBeenCalledWith(expect.objectContaining({
      input: expect.objectContaining({ kind: 'background' }),
    }));
  });

  it('teacher launches a pose for an assigned approved child', async () => {
    const response = await request(app).post('/api/academy/materials/generate').set('Cookie', teacherCookies).send({
      kind: 'pose',
      title: 'Поза исследователя',
      prompt: 'Ребёнок показывает на карту правой рукой',
      childId,
      characterReferenceIds: [referenceId],
      model: 'nano-banana',
      aspectRatio: '3:4',
      maxCostUsd: 0.2,
    });
    expect(response.status).toBe(202);
    expect(addAcademyGenerationJob).toHaveBeenCalledWith(expect.objectContaining({
      input: expect.objectContaining({ kind: 'pose', childId }),
    }));
  });

  it('rejects child references for a public/teacher asset', async () => {
    const response = await request(app).post('/api/academy/materials/generate').set('Cookie', teacherCookies).send({
      kind: 'background',
      title: 'Небезопасный фон',
      prompt: 'Фон с внешностью конкретного ребёнка',
      childId,
      characterReferenceIds: [referenceId],
      maxCostUsd: 1,
    });
    expect(response.status).toBe(400);
  });

  it('forbids child promotion even for admin', async () => {
    const response = await request(app).post('/api/academy/materials/promote').set('Cookie', adminCookies).send({
      sourceScope: 'child',
      assetId: 'any-child-asset',
    });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('CHILD_ASSET_PROMOTION_FORBIDDEN');
  });

  it('allows only admin to copy teacher media into the shared library', async () => {
    const denied = await request(app).post('/api/academy/materials/promote').set('Cookie', teacherCookies).send({
      sourceScope: 'teacher',
      assetId: teacherAssetId,
    });
    expect(denied.status).toBe(403);

    const promoted = await request(app).post('/api/academy/materials/promote').set('Cookie', adminCookies).send({
      sourceScope: 'teacher',
      assetId: teacherAssetId,
    });
    expect(promoted.status).toBe(201);
    expect(promoted.body.asset.scope).toBe('shared');
    expect(promoted.body.asset.ownerUserId).toBeNull();
    looseMediaIds.push(promoted.body.asset.id);
  });
});
