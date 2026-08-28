import request from 'supertest';
import { prisma } from '@allvision/database';
import { signAccessToken } from '../utils/jwt';
import { closeQueues } from '../queues';

const mockGetAccountInfo = jest.fn();

jest.mock('../services/piapi-client', () => ({
  PiAPIAccountClient: jest.fn().mockImplementation(() => ({
    getAccountInfo: mockGetAccountInfo,
  })),
}));

const { app } = require('../app') as typeof import('../app');

const RUN_ID = Date.now();
const ADMIN_EMAIL = `admin-diagnostics-${RUN_ID}@example.ru`;
const USER_EMAIL = `admin-diagnostics-user-${RUN_ID}@example.ru`;

let adminUserId: string;
let userId: string;

function authCookie(id: string, role: 'USER' | 'ADMIN') {
  return [`accessToken=${signAccessToken(id, role)}`];
}

beforeAll(async () => {
  const [admin, user] = await Promise.all([
    prisma.user.create({ data: { email: ADMIN_EMAIL, passwordHash: 'hash', role: 'ADMIN', tokenBalance: 0 } }),
    prisma.user.create({ data: { email: USER_EMAIL, passwordHash: 'hash', role: 'USER', tokenBalance: 0 } }),
  ]);
  adminUserId = admin.id;
  userId = user.id;
});

beforeEach(() => {
  process.env.PIAPI_API_KEY = 'diagnostics-key-abcdef';
  mockGetAccountInfo.mockResolvedValue({ equivalentUsd: 9.5, raw: { equivalent_in_usd: 9.5 } });
});

afterEach(() => {
  mockGetAccountInfo.mockReset();
});

afterAll(async () => {
  jest.restoreAllMocks();
  await prisma.user.deleteMany({ where: { email: { in: [ADMIN_EMAIL, USER_EMAIL] } } });
  await closeQueues().catch(() => undefined);
  await prisma.$disconnect();
});

describe('/api/admin/diagnostics', () => {
  it('requires ADMIN and returns sanitized state', async () => {
    expect((await request(app).get('/api/admin/diagnostics/state')).status).toBe(401);
    expect((await request(app).get('/api/admin/diagnostics/state').set('Cookie', authCookie(userId, 'USER'))).status).toBe(403);

    const res = await request(app)
      .get('/api/admin/diagnostics/state')
      .set('Cookie', authCookie(adminUserId, 'ADMIN'));

    expect(res.status).toBe(200);
    expect(res.body.build.version).toBeDefined();
    expect(res.body.uptime.apiSeconds).toEqual(expect.any(Number));
    expect(res.body.queues).toEqual(expect.any(Array));
    expect(res.body.env.PIAPI_API_KEY).toBe('***abcdef');
    expect(JSON.stringify(res.body)).not.toContain('diagnostics-key-abcdef');
  });

  // Баланс теперь читается у fal (провайдер сменился в P11), а не у PiAPI.
  it('refreshes the provider balance through the action endpoint', async () => {
    const originalKey = process.env.FAL_KEY;
    process.env.FAL_KEY = 'fal-test-key';
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ username: 'allvision', credits: { current_balance: 9.5, currency: 'USD' } }),
    } as never);

    const res = await request(app)
      .post('/api/admin/diagnostics/refresh-balance')
      .set('Cookie', authCookie(adminUserId, 'ADMIN'));

    expect(res.status).toBe(200);
    expect(res.body.balanceUsd).toBe(9.5);

    fetchSpy.mockRestore();
    if (originalKey === undefined) delete process.env.FAL_KEY;
    else process.env.FAL_KEY = originalKey;
  });

  it('says plainly that the balance cannot be read without a key', async () => {
    const originalKey = process.env.FAL_KEY;
    const originalBilling = process.env.FAL_BILLING_KEY;
    delete process.env.FAL_KEY;
    delete process.env.FAL_BILLING_KEY;

    const res = await request(app)
      .post('/api/admin/diagnostics/refresh-balance')
      .set('Cookie', authCookie(adminUserId, 'ADMIN'));

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('FAL_KEY_MISSING');

    if (originalKey !== undefined) process.env.FAL_KEY = originalKey;
    if (originalBilling !== undefined) process.env.FAL_BILLING_KEY = originalBilling;
  });
});
