import request from 'supertest';
import { prisma } from '@allvision/database';
import { getChatModel } from '@allvision/shared';
import { app } from '../app';
import { signAccessToken } from '../utils/jwt';
import * as queuesModule from '../queues';

const RUN_ID = Date.now();
const USER_EMAIL = `chats-user-${RUN_ID}@example.com`;
const OTHER_EMAIL = `chats-other-${RUN_ID}@example.com`;

let userId: string;
let otherUserId: string;

function authCookie(id: string) {
  return [`accessToken=${signAccessToken(id, 'USER')}`];
}

async function cleanup() {
  const users = await prisma.user.findMany({
    where: { email: { in: [USER_EMAIL, OTHER_EMAIL] } },
    select: { id: true },
  });
  const ids = users.map((user) => user.id);
  if (ids.length > 0) {
    await prisma.tokenTransaction.deleteMany({ where: { userId: { in: ids } } });
    await prisma.chatMessage.deleteMany({ where: { chat: { userId: { in: ids } } } });
    await prisma.chat.deleteMany({ where: { userId: { in: ids } } });
    await prisma.project.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }
}

beforeAll(async () => {
  await cleanup();
  const [user, other] = await Promise.all([
    prisma.user.create({ data: { email: USER_EMAIL, passwordHash: 'hash', tokenBalance: 1000 } }),
    prisma.user.create({ data: { email: OTHER_EMAIL, passwordHash: 'hash', tokenBalance: 1000 } }),
  ]);
  userId = user.id;
  otherUserId = other.id;
});

afterEach(() => {
  jest.restoreAllMocks();
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe('/api/user/chats', () => {
  it('creates, lists, renames and soft deletes only owned chats', async () => {
    const created = await request(app)
      .post('/api/user/chats')
      .set('Cookie', authCookie(userId))
      .send({ title: `Chat ${RUN_ID}` });
    expect(created.status).toBe(201);

    const chatId = created.body.chat.id as string;
    const list = await request(app)
      .get('/api/user/chats')
      .set('Cookie', authCookie(userId));
    expect(list.status).toBe(200);
    expect(list.body.items.map((chat: { id: string }) => chat.id)).toContain(chatId);

    const forbiddenRename = await request(app)
      .patch(`/api/user/chats/${chatId}`)
      .set('Cookie', authCookie(otherUserId))
      .send({ title: 'Nope' });
    expect(forbiddenRename.status).toBe(404);

    const renamed = await request(app)
      .patch(`/api/user/chats/${chatId}`)
      .set('Cookie', authCookie(userId))
      .send({ title: `Renamed ${RUN_ID}` });
    expect(renamed.status).toBe(200);
    expect(renamed.body.chat.title).toBe(`Renamed ${RUN_ID}`);

    const deleted = await request(app)
      .delete(`/api/user/chats/${chatId}`)
      .set('Cookie', authCookie(userId));
    expect(deleted.status).toBe(200);

    const after = await request(app)
      .get('/api/user/chats')
      .set('Cookie', authCookie(userId));
    expect(after.body.items.map((chat: { id: string }) => chat.id)).not.toContain(chatId);
    expect(await prisma.chat.findFirst({ where: { id: chatId, deletedAt: { not: null } } })).toBeTruthy();
  });

  it('adds a message, creates a free-chat project, updates chat timestamp and auto-title', async () => {
    jest.spyOn(queuesModule, 'addServicePipelineJob').mockResolvedValue({} as never);
    const cost = getChatModel('nano-banana')?.estimatedCostCoins ?? 10;
    const beforeUser = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const chat = await prisma.chat.create({ data: { userId, title: 'Новый чат' } });
    const beforeUpdatedAt = chat.updatedAt;
    const prompt = 'A cinematic portrait of a designer in a neon studio with crisp details';

    const res = await request(app)
      .post(`/api/user/chats/${chat.id}/messages`)
      .set('Cookie', authCookie(userId))
      .send({ modelSlug: 'nano-banana', prompt, aspectRatio: '1:1' });

    expect(res.status).toBe(202);
    expect(res.body.message.projectId).toBe(res.body.projectId);
    expect(queuesModule.addServicePipelineJob).toHaveBeenCalledWith({ projectId: res.body.projectId, userId, mode: 'production' });

    const project = await prisma.project.findUniqueOrThrow({ where: { id: res.body.projectId } });
    expect(project.mode).toBe('free-chat');
    expect(project.userInputs).toEqual(expect.objectContaining({
      chatGeneration: expect.objectContaining({ modelSlug: 'nano-banana', category: 'image' }),
    }));

    const updatedChat = await prisma.chat.findUniqueOrThrow({ where: { id: chat.id } });
    expect(updatedChat.title).toBe(prompt.slice(0, 50));
    expect(updatedChat.updatedAt.getTime()).toBeGreaterThanOrEqual(beforeUpdatedAt.getTime());

    const afterUser = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(afterUser.tokenBalance).toBe(beforeUser.tokenBalance - cost);

    const details = await request(app)
      .get(`/api/user/chats/${chat.id}`)
      .set('Cookie', authCookie(userId));
    expect(details.status).toBe(200);
    expect(details.body.messages).toHaveLength(1);
    expect(details.body.messages[0].project.status).toBe('PENDING');
  });
});
