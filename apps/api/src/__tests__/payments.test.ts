import request from 'supertest';
import { prisma } from '@allvision/database';
import { app } from '../app';

const RUN_ID = Date.now();
const EMAIL = `payments-${RUN_ID}@example.ru`;
const OTHER_EMAIL = `payments-other-${RUN_ID}@example.ru`;
const PASSWORD = 'password123';
const ACTIVE_PACKAGE_TITLE = `Payments Active ${RUN_ID}`;
const INACTIVE_PACKAGE_TITLE = `Payments Inactive ${RUN_ID}`;

let agent: ReturnType<typeof request.agent>;
let otherAgent: ReturnType<typeof request.agent>;
let userId: string;
let activePackageId: string;
let inactivePackageId: string;

async function purge() {
  const users = await prisma.user.findMany({
    where: { email: { in: [EMAIL, OTHER_EMAIL] } },
    select: { id: true },
  });
  const userIds = users.map((user) => user.id);

  if (userIds.length > 0) {
    await prisma.tokenTransaction.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.order.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.payment.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }

  await prisma.tokenPackage.deleteMany({
    where: { title: { in: [ACTIVE_PACKAGE_TITLE, INACTIVE_PACKAGE_TITLE] } },
  });
}

async function registerAgent(email: string) {
  const testAgent = request.agent(app);
  const res = await testAgent
    .post('/api/auth/register')
    .send({ email, password: PASSWORD, name: 'Payments User' });
  expect(res.status).toBe(201);
  return { testAgent, registeredUserId: res.body.user.id as string };
}

async function createPendingTopup() {
  const res = await agent.post('/api/payments/topup').send({ tokenPackageId: activePackageId });
  expect(res.status).toBe(200);
  return res.body.payment.id as string;
}

async function getUserBalance() {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  return user.tokenBalance;
}

beforeAll(async () => {
  process.env.PAYMENT_PROVIDER = 'mock';
  process.env.PUBLIC_WEB_URL = 'http://localhost:3000';
  process.env.PAYMENT_EXPIRES_IN_MS = '900000';

  await purge();

  const activePackage = await prisma.tokenPackage.create({
    data: {
      title: ACTIVE_PACKAGE_TITLE,
      tokens: 500,
      bonus: 50,
      priceRub: 499,
      isActive: true,
      sortOrder: 999,
    },
  });
  const inactivePackage = await prisma.tokenPackage.create({
    data: {
      title: INACTIVE_PACKAGE_TITLE,
      tokens: 100,
      bonus: 0,
      priceRub: 99,
      isActive: false,
      sortOrder: 1000,
    },
  });
  activePackageId = activePackage.id;
  inactivePackageId = inactivePackage.id;

  const registered = await registerAgent(EMAIL);
  agent = registered.testAgent;
  userId = registered.registeredUserId;
  otherAgent = (await registerAgent(OTHER_EMAIL)).testAgent;
});

afterAll(async () => {
  await purge();
  await prisma.$disconnect();
});

describe('POST /api/payments/topup', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).post('/api/payments/topup').send({ tokenPackageId: activePackageId });
    expect(res.status).toBe(401);
  });

  it('creates payment and returns mock confirmationUrl', async () => {
    const res = await agent.post('/api/payments/topup').send({ tokenPackageId: activePackageId });
    expect(res.status).toBe(200);
    expect(res.body.payment.amountRub).toBe(49900);
    expect(res.body.payment.tokensAdded).toBe(550);
    expect(res.body.payment.expiresAt).toBeTruthy();
    expect(res.body.confirmationUrl).toContain('/mock-payment/');

    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: res.body.payment.id } });
    expect(payment.userId).toBe(userId);
    expect(payment.status).toBe('PENDING');
    expect(payment.provider).toBe('mock');
    expect(payment.providerPaymentId).toBe(payment.id);
    expect(payment.expiresAt).not.toBeNull();
    expect(payment.expiresAt!.getTime()).toBeGreaterThan(payment.createdAt.getTime());
    expect(res.body.confirmationUrl).toContain(payment.id);
  });

  it('returns 404 for missing tokenPackageId', async () => {
    const res = await agent.post('/api/payments/topup').send({ tokenPackageId: 'missing-package-id' });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('TOKEN_PACKAGE_NOT_FOUND');
  });

  it('returns 400 for inactive token package', async () => {
    const res = await agent.post('/api/payments/topup').send({ tokenPackageId: inactivePackageId });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('TOKEN_PACKAGE_INACTIVE');
  });
});

describe('POST /api/payments/webhook', () => {
  it('returns 404 for missing provider payment id', async () => {
    const res = await request(app)
      .post('/api/payments/webhook')
      .send({ paymentId: 'missing-provider-payment-id', event: 'succeeded' });
    expect(res.status).toBe(404);
  });

  it('marks TOPUP payment succeeded, credits tokens and creates token transaction', async () => {
    const paymentId = await createPendingTopup();
    const balanceBefore = await getUserBalance();

    const res = await request(app)
      .post('/api/payments/webhook')
      .send({ paymentId, event: 'succeeded' });
    expect(res.status).toBe(200);

    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    expect(payment.status).toBe('SUCCEEDED');
    expect(payment.paidAt).not.toBeNull();

    const balanceAfter = await getUserBalance();
    expect(balanceAfter).toBe(balanceBefore + 550);

    const tx = await prisma.tokenTransaction.findFirst({
      where: { userId, refId: paymentId, reason: 'topup' },
    });
    expect(tx).not.toBeNull();
    expect(tx!.amount).toBe(550);
    expect(tx!.balanceAfter).toBe(balanceAfter);
  });

  it('keeps succeeded webhook idempotent', async () => {
    const paymentId = await createPendingTopup();

    const first = await request(app)
      .post('/api/payments/webhook')
      .send({ paymentId, event: 'succeeded' });
    expect(first.status).toBe(200);
    const balanceAfterFirst = await getUserBalance();

    const second = await request(app)
      .post('/api/payments/webhook')
      .send({ paymentId, event: 'succeeded' });
    expect(second.status).toBe(200);
    const balanceAfterSecond = await getUserBalance();

    const txCount = await prisma.tokenTransaction.count({
      where: { userId, refId: paymentId, reason: 'topup' },
    });
    expect(balanceAfterSecond).toBe(balanceAfterFirst);
    expect(txCount).toBe(1);
  });

  it('does not downgrade succeeded payment after a late failed webhook', async () => {
    const paymentId = await createPendingTopup();

    const success = await request(app)
      .post('/api/payments/webhook')
      .send({ paymentId, event: 'succeeded' });
    expect(success.status).toBe(200);
    const balanceAfterSuccess = await getUserBalance();

    const failed = await request(app)
      .post('/api/payments/webhook')
      .send({ paymentId, event: 'failed' });
    expect(failed.status).toBe(200);

    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    expect(payment.status).toBe('SUCCEEDED');
    expect(await getUserBalance()).toBe(balanceAfterSuccess);
  });

  it('marks canceled payment without changing balance', async () => {
    const paymentId = await createPendingTopup();
    const balanceBefore = await getUserBalance();

    const res = await request(app)
      .post('/api/payments/webhook')
      .send({ paymentId, event: 'canceled' });
    expect(res.status).toBe(200);

    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    expect(payment.status).toBe('CANCELLED');
    expect(await getUserBalance()).toBe(balanceBefore);
  });

  it('marks failed payment without changing balance', async () => {
    const paymentId = await createPendingTopup();
    const balanceBefore = await getUserBalance();

    const res = await request(app)
      .post('/api/payments/webhook')
      .send({ paymentId, event: 'failed' });
    expect(res.status).toBe(200);

    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    expect(payment.status).toBe('FAILED');
    expect(await getUserBalance()).toBe(balanceBefore);
  });
});

describe('GET /api/payments/:id/status', () => {
  it('returns payment status and tokensAdded for owner', async () => {
    const paymentId = await createPendingTopup();

    const res = await agent.get(`/api/payments/${paymentId}/status`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('PENDING');
    expect(res.body.tokensAdded).toBe(550);
  });

  it('returns SUCCEEDED with tokensAdded after webhook', async () => {
    const paymentId = await createPendingTopup();

    await request(app)
      .post('/api/payments/webhook')
      .send({ paymentId, event: 'succeeded' });

    const res = await agent.get(`/api/payments/${paymentId}/status`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('SUCCEEDED');
    expect(res.body.tokensAdded).toBe(550);
  });

  it('returns CANCELLED after payment expiration', async () => {
    const paymentId = await createPendingTopup();
    await prisma.payment.update({
      where: { id: paymentId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const res = await agent.get(`/api/payments/${paymentId}/status`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('CANCELLED');

    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    expect(payment.status).toBe('CANCELLED');
  });

  it('returns 403 for another user', async () => {
    const paymentId = await createPendingTopup();

    const res = await otherAgent.get(`/api/payments/${paymentId}/status`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});

describe('webhook concurrency and idempotency', () => {
  it('credits tokens once even when two succeeded webhooks fire in parallel', async () => {
    const paymentId = await createPendingTopup();
    const balanceBefore = await getUserBalance();

    const [a, b] = await Promise.all([
      request(app).post('/api/payments/webhook').send({ paymentId, event: 'succeeded' }),
      request(app).post('/api/payments/webhook').send({ paymentId, event: 'succeeded' }),
    ]);

    expect([a.status, b.status].sort()).toEqual([200, 200]);

    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    expect(payment.status).toBe('SUCCEEDED');

    const balanceAfter = await getUserBalance();
    expect(balanceAfter).toBe(balanceBefore + 550);

    const txCount = await prisma.tokenTransaction.count({
      where: { userId, refId: paymentId, reason: 'topup' },
    });
    expect(txCount).toBe(1);
  });

  it('upgrades CANCELLED payment to SUCCEEDED if late success webhook arrives', async () => {
    const paymentId = await createPendingTopup();
    const balanceBefore = await getUserBalance();

    const cancelRes = await request(app)
      .post('/api/payments/webhook')
      .send({ paymentId, event: 'cancelled' });
    expect(cancelRes.status).toBe(200);

    const successRes = await request(app)
      .post('/api/payments/webhook')
      .send({ paymentId, event: 'succeeded' });
    expect(successRes.status).toBe(200);

    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    expect(payment.status).toBe('SUCCEEDED');
    expect(payment.paidAt).not.toBeNull();

    const balanceAfter = await getUserBalance();
    expect(balanceAfter).toBe(balanceBefore + 550);

    const txCount = await prisma.tokenTransaction.count({
      where: { userId, refId: paymentId, reason: 'topup' },
    });
    expect(txCount).toBe(1);
  });
});
