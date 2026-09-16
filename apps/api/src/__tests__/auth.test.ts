import request from 'supertest';
import jwt from 'jsonwebtoken';
import { prisma } from '@allvision/database';
import { app } from '../app';
import { WELCOME_BONUS_TOKENS } from '../services/auth-service';

const EMAIL = `test-${Date.now()}@example.ru`;
const PASSWORD = 'password123';
const NAME = 'Test User';

async function cleanup() {
  const user = await prisma.user.findUnique({ where: { email: EMAIL } });
  if (user) {
    await prisma.tokenTransaction.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
}

beforeAll(async () => {
  await cleanup();
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe('POST /api/auth/register', () => {
  // Продуктовый контракт: стартовый баланс задан в коде (WELCOME_BONUS_TOKENS) и не зависит
  // от env — раньше прод-.env молча перебивал его нулём.
  it('creates user, sets cookies and credits the welcome bonus', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: EMAIL, password: PASSWORD, name: NAME });

    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe(EMAIL);
    expect(res.body.user.tokenBalance).toBe(WELCOME_BONUS_TOKENS);
    expect(res.body.user.passwordHash).toBeUndefined();

    const cookies = res.headers['set-cookie'] as unknown as string[] | string | undefined;
    const cookieArr = Array.isArray(cookies) ? cookies : cookies ? [cookies] : [];
    expect(cookieArr.some((c) => c.startsWith('accessToken='))).toBe(true);
    expect(cookieArr.some((c) => c.startsWith('refreshToken='))).toBe(true);

    // Бонус виден в истории операций пользователя.
    const txns = await prisma.tokenTransaction.findMany({
      where: { user: { email: EMAIL } },
    });
    expect(txns).toEqual([
      expect.objectContaining({
        amount: WELCOME_BONUS_TOKENS,
        reason: 'welcome_bonus',
        balanceAfter: WELCOME_BONUS_TOKENS,
      }),
    ]);
  });

  it('rejects duplicate email with 409', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: EMAIL, password: PASSWORD, name: NAME });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });
});

describe('POST /api/auth/login', () => {
  it('returns 200 for correct password', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: EMAIL, password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(EMAIL);
  });

  it('returns 401 for wrong password', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: EMAIL, password: 'wrong-pass' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });
});

describe('GET /api/auth/me', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns current user after login', async () => {
    const agent = request.agent(app);
    const loginRes = await agent.post('/api/auth/login').send({ email: EMAIL, password: PASSWORD });
    expect(loginRes.status).toBe(200);
    const meRes = await agent.get('/api/auth/me');
    expect(meRes.status).toBe(200);
    expect(meRes.body.user.email).toBe(EMAIL);
  });

  it('renews the session with refresh after access token expiry', async () => {
    const loginRes = await request(app).post('/api/auth/login').send({ email: EMAIL, password: PASSWORD });
    expect(loginRes.status).toBe(200);
    const cookies = loginRes.headers['set-cookie'] as unknown as string[] | string | undefined;
    const cookieArr = Array.isArray(cookies) ? cookies : cookies ? [cookies] : [];
    const refreshCookie = cookieArr.find((cookie) => cookie.startsWith('refreshToken='));
    expect(refreshCookie).toBeTruthy();

    const expiredAccess = jwt.sign(
      { sub: loginRes.body.user.id, role: 'USER', exp: Math.floor(Date.now() / 1000) - 60 },
      process.env.JWT_ACCESS_SECRET ?? process.env.JWT_SECRET ?? 'dev_jwt_secret_change_in_prod_32_chars_min',
      { algorithm: 'HS256' },
    );

    const expiredMe = await request(app)
      .get('/api/auth/me')
      .set('Cookie', [`accessToken=${expiredAccess}`, refreshCookie!]);
    expect(expiredMe.status).toBe(401);

    const refreshRes = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', [refreshCookie!]);
    expect(refreshRes.status).toBe(200);
    const refreshedCookies = refreshRes.headers['set-cookie'] as unknown as string[];

    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Cookie', refreshedCookies);
    expect(meRes.status).toBe(200);
    expect(meRes.body.user.email).toBe(EMAIL);
  });
});
