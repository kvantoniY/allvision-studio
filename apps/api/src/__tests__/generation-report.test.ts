import request from 'supertest';
import { prisma, ProcessingType } from '@allvision/database';
import { app } from '../app';
import { signAccessToken } from '../utils/jwt';

const RUN_ID = Date.now();
const USER_EMAIL = `generation-report-user-${RUN_ID}@example.ru`;
const OTHER_EMAIL = `generation-report-other-${RUN_ID}@example.ru`;
const ADMIN_EMAIL = `generation-report-admin-${RUN_ID}@example.ru`;
const SERVICE_SLUG = `generation-report-service-${RUN_ID}`;

let userId: string;
let otherUserId: string;
let adminId: string;
let projectId: string;

function authCookie(id: string, role: 'USER' | 'ADMIN') {
  return [`accessToken=${signAccessToken(id, role)}`];
}

async function cleanup() {
  const users = await prisma.user.findMany({
    where: { email: { in: [USER_EMAIL, OTHER_EMAIL, ADMIN_EMAIL] } },
    select: { id: true },
  });
  const ids = users.map((user) => user.id);
  if (ids.length > 0) {
    await prisma.supportTicket.deleteMany({ where: { userId: { in: ids } } });
    await prisma.project.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.service.deleteMany({ where: { slug: SERVICE_SLUG } });
}

beforeAll(async () => {
  await cleanup();
  const [user, other, admin] = await Promise.all([
    prisma.user.create({ data: { email: USER_EMAIL, passwordHash: 'hash', role: 'USER', tokenBalance: 0 } }),
    prisma.user.create({ data: { email: OTHER_EMAIL, passwordHash: 'hash', role: 'USER', tokenBalance: 0 } }),
    prisma.user.create({ data: { email: ADMIN_EMAIL, passwordHash: 'hash', role: 'ADMIN', tokenBalance: 0 } }),
  ]);
  userId = user.id;
  otherUserId = other.id;
  adminId = admin.id;

  const service = await prisma.service.create({
    data: {
      slug: SERVICE_SLUG,
      title: 'Report Test Service',
      description: 'service for generation report tests',
      shortDesc: 'report test',
      category: 'TRENDS_MEMES',
      priceTokens: 1,
      costUsd: 0,
      processingType: ProcessingType.AUTO,
      aiProvider: 'mock',
      aiModel: 'mock',
    },
  });
  const project = await prisma.project.create({
    data: {
      userId,
      serviceId: service.id,
      title: `Report Project ${RUN_ID}`,
      status: 'COMPLETED',
      progress: 100,
      inputImages: ['https://cdn.test/input.jpg'],
      resultImage: 'https://cdn.test/result.jpg',
      tokensCost: 1,
      completedAt: new Date(),
    },
  });
  projectId = project.id;
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe('POST /api/projects/:id/report', () => {
  it('creates a support ticket visible to admins', async () => {
    const res = await request(app)
      .post(`/api/projects/${projectId}/report`)
      .set('Cookie', authCookie(userId, 'USER'))
      .send({ reason: 'Плохой результат', message: 'Лицо сильно искажено' });

    expect(res.status).toBe(201);
    expect(res.body.ticket.subject).toContain('Жалоба на генерацию');
    expect(res.body.ticket.messages[0].body).toContain(projectId);
    expect(res.body.ticket.messages[0].body).toContain('Плохой результат');

    const adminList = await request(app)
      .get(`/api/admin/support/tickets?search=${projectId.slice(0, 8)}`)
      .set('Cookie', authCookie(adminId, 'ADMIN'));

    expect(adminList.status).toBe(200);
    expect(adminList.body.items.map((ticket: { id: string }) => ticket.id)).toContain(res.body.ticket.id);
  });

  it('does not allow reporting someone else project', async () => {
    const res = await request(app)
      .post(`/api/projects/${projectId}/report`)
      .set('Cookie', authCookie(otherUserId, 'USER'))
      .send({ reason: 'Другое' });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('PROJECT_NOT_FOUND');
  });
});
