import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import sharp from 'sharp';
import { prisma } from '@allvision/database';
import { app } from '../app';
import { signAccessToken } from '../utils/jwt';

const RUN_ID = Date.now();
const USER_EMAIL = `chat-upload-${RUN_ID}@example.ru`;

let tmpDir: string;
let originalUploads: string | undefined;
let originalApiUrl: string | undefined;
let userId: string;

function authCookie(id: string) {
  return [`accessToken=${signAccessToken(id, 'USER')}`];
}

async function pngBuffer() {
  return sharp({
    create: { width: 64, height: 64, channels: 3, background: '#44aa99' },
  }).png().toBuffer();
}

async function cleanup() {
  const user = await prisma.user.findUnique({ where: { email: USER_EMAIL }, select: { id: true } });
  if (user) {
    await prisma.tokenTransaction.deleteMany({ where: { userId: user.id } });
    await prisma.chatMessage.deleteMany({ where: { chat: { userId: user.id } } });
    await prisma.chat.deleteMany({ where: { userId: user.id } });
    await prisma.project.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
}

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'user-chat-upload-test-'));
  originalUploads = process.env.UPLOADS_DIR;
  originalApiUrl = process.env.PUBLIC_API_URL;
  process.env.UPLOADS_DIR = tmpDir;
  process.env.PUBLIC_API_URL = 'http://test.local:4000';
  await cleanup();
  const user = await prisma.user.create({ data: { email: USER_EMAIL, passwordHash: 'hash', tokenBalance: 1000 } });
  userId = user.id;
});

afterAll(async () => {
  await cleanup();
  process.env.UPLOADS_DIR = originalUploads;
  process.env.PUBLIC_API_URL = originalApiUrl;
  fs.rmSync(tmpDir, { recursive: true, force: true });
  await prisma.$disconnect();
});

describe('/api/user/chat legacy upload', () => {
  it('uploads a temporary chat image and rejects unsupported files', async () => {
    const ok = await request(app)
      .post('/api/user/chat/upload')
      .set('Cookie', authCookie(userId))
      .attach('file', await pngBuffer(), { filename: 'input.png', contentType: 'image/png' });

    expect(ok.status).toBe(201);
    expect(ok.body.input.ref).toContain(`chat:user-uploads/chat/${userId}/`);
    expect(ok.body.input.mediaKind).toBe('image');

    const audio = await request(app)
      .post('/api/user/chat/upload')
      .set('Cookie', authCookie(userId))
      .attach('file', Buffer.from('fake mp3 bytes'), { filename: 'music.mp3', contentType: 'audio/mpeg' });
    expect(audio.status).toBe(201);
    expect(audio.body.input.ref).toContain(`chat:user-uploads/chat/${userId}/`);
    expect(audio.body.input.mediaKind).toBe('audio');

    const invalid = await request(app)
      .post('/api/user/chat/upload')
      .set('Cookie', authCookie(userId))
      .attach('file', Buffer.from('hello'), { filename: 'note.txt', contentType: 'text/plain' });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe('UNSUPPORTED_FORMAT');
  });

  it('returns 410 for deprecated generate and history endpoints', async () => {
    const generate = await request(app)
      .post('/api/user/chat/generate')
      .set('Cookie', authCookie(userId))
      .send({ modelSlug: 'nano-banana', prompt: 'A portrait' });
    expect(generate.status).toBe(410);
    expect(generate.body.error.code).toBe('CHAT_ENDPOINT_DEPRECATED');

    const history = await request(app)
      .get('/api/user/chat/history')
      .set('Cookie', authCookie(userId));
    expect(history.status).toBe(410);
  });
});
