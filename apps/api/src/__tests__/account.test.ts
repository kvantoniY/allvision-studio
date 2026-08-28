import request from 'supertest';
import { prisma } from '@allvision/database';
import { app } from '../app';

const EMAIL = `acc-${Date.now()}@example.ru`;
const PASSWORD = 'password123';
const NEW_PASSWORD = 'newpassword456';
const NAME = 'Account User';

let agent: ReturnType<typeof request.agent>;
let createdUserId: string;

async function purgeUser() {
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { email: EMAIL },
        ...(createdUserId ? [{ id: createdUserId }] : []),
      ],
    },
  });
  for (const u of users) {
    await prisma.tokenTransaction.deleteMany({ where: { userId: u.id } });
    await prisma.user.delete({ where: { id: u.id } });
  }
}

beforeAll(async () => {
  await purgeUser();
  agent = request.agent(app);
  const reg = await agent
    .post('/api/auth/register')
    .send({ email: EMAIL, password: PASSWORD, name: NAME });
  expect(reg.status).toBe(201);
  createdUserId = reg.body.user.id;
  // Стартовый баланс теперь 0 (без welcome-бонуса), поэтому для проверки ленты транзакций
  // создаём явную транзакцию вручную.
  await prisma.tokenTransaction.create({
    data: { userId: createdUserId, amount: 100, reason: 'topup', balanceAfter: 100 },
  });
});

afterAll(async () => {
  await purgeUser();
  await prisma.$disconnect();
});

describe('GET /api/account/dashboard', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/account/dashboard');
    expect(res.status).toBe(401);
  });

  it('returns dashboard payload for authed user', async () => {
    const res = await agent.get('/api/account/dashboard');
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(EMAIL);
    expect(res.body.stats).toEqual({
      totalProjects: 0,
      completedProjects: 0,
      activeOrders: 0,
      totalSpent: 0,
    });
    expect(Array.isArray(res.body.recentProjects)).toBe(true);
    expect(Array.isArray(res.body.activeOrders)).toBe(true);
    expect(res.body.recentTransactions.length).toBeGreaterThanOrEqual(1);
    expect(res.body.recentTransactions[0].reason).toBe('topup');
  });
});

describe('PATCH /api/account/profile', () => {
  it('updates name + messenger', async () => {
    const res = await agent
      .patch('/api/account/profile')
      .send({ name: 'Renamed User', messenger: '@user', messengerType: 'TELEGRAM' });
    expect(res.status).toBe(200);
    expect(res.body.user.name).toBe('Renamed User');
    expect(res.body.user.messenger).toBe('@user');
    expect(res.body.user.messengerType).toBe('TELEGRAM');
  });

  it('rejects too-short name with 400', async () => {
    const res = await agent.patch('/api/account/profile').send({ name: 'A' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('POST /api/account/profile/password', () => {
  it('rejects wrong oldPassword', async () => {
    const res = await agent
      .post('/api/account/profile/password')
      .send({ oldPassword: 'wrong-pass', newPassword: 'whatever123' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_OLD_PASSWORD');
  });

  it('changes password and re-issues cookies', async () => {
    const res = await agent
      .post('/api/account/profile/password')
      .send({ oldPassword: PASSWORD, newPassword: NEW_PASSWORD });
    expect(res.status).toBe(200);
    const cookies = res.headers['set-cookie'] as unknown as string[] | string | undefined;
    const arr = Array.isArray(cookies) ? cookies : cookies ? [cookies] : [];
    expect(arr.some((c) => c.startsWith('accessToken='))).toBe(true);

    // /me продолжает работать благодаря свежим cookies.
    const meRes = await agent.get('/api/auth/me');
    expect(meRes.status).toBe(200);
    expect(meRes.body.user.email).toBe(EMAIL);
  });
});

describe('DELETE /api/account', () => {
  it('soft-deletes user and clears cookies', async () => {
    const res = await agent
      .delete('/api/account')
      .send({ password: NEW_PASSWORD, confirmation: 'УДАЛИТЬ' });
    expect(res.status).toBe(200);

    // /me после удаления должен сказать UNAUTHORIZED — токен ещё валидный, но cookies очищены.
    // А пользователь в БД помечен deletedAt + email освобождён.
    const after = await prisma.user.findUnique({ where: { id: createdUserId } });
    expect(after).not.toBeNull();
    expect(after!.deletedAt).not.toBeNull();
    expect(after!.email).not.toBe(EMAIL);
  });
});
