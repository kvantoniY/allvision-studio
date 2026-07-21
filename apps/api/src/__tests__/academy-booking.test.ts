import request from 'supertest';
import { prisma } from '@allvision/database';
import { app } from '../app';

const PARENT_EMAIL = `booking-parent-${Date.now()}@example.com`;
const TEACHER_EMAIL = `booking-teacher-${Date.now()}@example.com`;
const PASSWORD = 'password123';

async function cleanupUser(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return;
  await prisma.tokenTransaction.deleteMany({ where: { userId: user.id } });
  await prisma.user.delete({ where: { id: user.id } });
}

async function registerAndLogin(email: string) {
  const res = await request(app).post('/api/auth/register').send({ email, password: PASSWORD, name: email.split('@')[0] });
  const cookies = res.headers['set-cookie'] as unknown as string[] | string;
  return Array.isArray(cookies) ? cookies : [cookies];
}

async function loginAs(email: string) {
  const res = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
  const cookies = res.headers['set-cookie'] as unknown as string[] | string;
  return Array.isArray(cookies) ? cookies : [cookies];
}

let parentCookies: string[] = [];
let teacherCookies: string[] = [];
let parentId = '';
let childId = '';
let slotId = '';
let lessonId = '';

beforeAll(async () => {
  await cleanupUser(PARENT_EMAIL);
  await cleanupUser(TEACHER_EMAIL);
  parentCookies = await registerAndLogin(PARENT_EMAIL);
  await registerAndLogin(TEACHER_EMAIL);
  await prisma.user.update({ where: { email: TEACHER_EMAIL }, data: { role: 'TEACHER' } });
  teacherCookies = await loginAs(TEACHER_EMAIL);
  parentId = (await prisma.user.findUniqueOrThrow({ where: { email: PARENT_EMAIL } })).id;
  const child = await request(app).post('/api/family/children').set('Cookie', parentCookies).send({ name: 'Ученик' });
  childId = child.body.id;
});

afterAll(async () => {
  await cleanupUser(PARENT_EMAIL);
  await cleanupUser(TEACHER_EMAIL);
  await prisma.$disconnect();
});

describe('lesson packages', () => {
  it('returns the full catalog', async () => {
    const res = await request(app).get('/api/academy/packages').set('Cookie', parentCookies);
    expect(res.status).toBe(200);
    expect(res.body.packages).toHaveLength(8);
  });

  it('balance starts empty', async () => {
    const res = await request(app).get('/api/academy/balance').set('Cookie', parentCookies);
    expect(res.status).toBe(200);
    expect(res.body.balance).toEqual([]);
  });
});

describe('teacher slots + booking', () => {
  it('teacher creates a slot', async () => {
    const startsAt = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
    const res = await request(app).post('/api/academy/teacher/slots').set('Cookie', teacherCookies).send({ startsAt, durationMin: 25 });
    expect(res.status).toBe(201);
    slotId = res.body.slot.id;
  });

  it('parent cannot manage slots', async () => {
    const res = await request(app).post('/api/academy/teacher/slots').set('Cookie', parentCookies).send({ startsAt: new Date(Date.now() + 3600_000).toISOString(), durationMin: 25 });
    expect(res.status).toBe(403);
  });

  it('booking without credits is rejected with 402', async () => {
    const res = await request(app).post('/api/academy/booking').set('Cookie', parentCookies).send({ childId, slotId });
    expect(res.status).toBe(402);
    expect(res.body.error.code).toBe('INSUFFICIENT_CREDITS');
    // Слот должен снова стать свободным после отката транзакции.
    const slot = await prisma.teacherSlot.findUnique({ where: { id: slotId } });
    expect(slot?.isBooked).toBe(false);
  });

  it('booking succeeds once a credit exists; credit consumed + earning created', async () => {
    await prisma.lessonCredit.create({ data: { parentId, durationMin: 25, source: 'manual' } });
    const res = await request(app).post('/api/academy/booking').set('Cookie', parentCookies).send({ childId, slotId });
    expect(res.status).toBe(201);
    lessonId = res.body.lessonId;

    const balance = await request(app).get('/api/academy/balance').set('Cookie', parentCookies);
    expect(balance.body.balance).toEqual([]); // кредит потреблён

    const earning = await prisma.teacherEarning.findUnique({ where: { lessonId } });
    expect(earning?.amountRub).toBe(300); // 30% от 1000
    expect(earning?.status).toBe('PENDING');
  });

  it('double booking the same slot is rejected', async () => {
    await prisma.lessonCredit.create({ data: { parentId, durationMin: 25, source: 'manual' } });
    const res = await request(app).post('/api/academy/booking').set('Cookie', parentCookies).send({ childId, slotId });
    expect(res.status).toBe(409);
  });

  it('parent cancels a far-future lesson → credit refunded, slot freed', async () => {
    const res = await request(app).post(`/api/academy/lessons/${lessonId}/cancel`).set('Cookie', parentCookies).send({});
    expect(res.status).toBe(200);
    expect(res.body.refunded).toBe(true);
    const slot = await prisma.teacherSlot.findUnique({ where: { id: slotId } });
    expect(slot?.isBooked).toBe(false);
    const refund = await prisma.lessonCredit.count({ where: { parentId, source: 'refund', consumedAt: null } });
    expect(refund).toBe(1);
  });
});

describe('teacher lesson status → earning', () => {
  it('completing a lesson makes the earning AVAILABLE', async () => {
    // Новый слот + бронь
    const startsAt = new Date(Date.now() + 72 * 3600 * 1000).toISOString();
    const slot = await request(app).post('/api/academy/teacher/slots').set('Cookie', teacherCookies).send({ startsAt, durationMin: 25 });
    await prisma.lessonCredit.create({ data: { parentId, durationMin: 25, source: 'manual' } });
    const booking = await request(app).post('/api/academy/booking').set('Cookie', parentCookies).send({ childId, slotId: slot.body.slot.id });
    const id = booking.body.lessonId;

    const res = await request(app).post(`/api/academy/teacher/lessons/${id}/status`).set('Cookie', teacherCookies).send({ status: 'COMPLETED' });
    expect(res.status).toBe(200);
    const earning = await prisma.teacherEarning.findUnique({ where: { lessonId: id } });
    expect(earning?.status).toBe('AVAILABLE');
  });
});
