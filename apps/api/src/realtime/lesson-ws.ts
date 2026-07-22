import type { Server } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { prisma } from '@allvision/database';
import {
  LESSON_CHAT_MAX_LENGTH,
  LESSON_WS_PATH,
  readSceneDocument,
  type LessonChatEntry,
  type LessonClientMessage,
  type LessonRole,
  type LessonServerMessage,
  type LessonStroke,
} from '@allvision/shared';
import { verifyAccessToken } from '../utils/jwt';
import { logger } from '../utils/logger';

interface Member {
  ws: WebSocket;
  role: LessonRole;
  userId: string;
  name: string;
  alive: boolean;
}

interface Room {
  lessonId: string;
  sceneCount: number;
  sceneIndex: number;
  unlocked: boolean;
  strokesByScene: Map<number, LessonStroke[]>;
  members: Set<Member>;
}

const rooms = new Map<string, Room>();

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

function send(ws: WebSocket, message: LessonServerMessage) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
}

function broadcast(room: Room, message: LessonServerMessage, exclude?: Member) {
  for (const m of room.members) {
    if (m !== exclude) send(m.ws, message);
  }
}

function presenceOf(room: Room) {
  let teacher = false;
  let student = false;
  for (const m of room.members) {
    if (m.role === 'teacher') teacher = true;
    else student = true;
  }
  return { teacher, student };
}

async function loadRoomContext(lessonId: string, userId: string, isAdmin: boolean) {
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    include: {
      teacher: { select: { userId: true, user: { select: { name: true, email: true } } } },
      child: { select: { parentId: true, name: true } },
      instance: { include: { version: { select: { scene: true } } } },
    },
  });
  if (!lesson) return null;
  const isTeacher = isAdmin || lesson.teacher.userId === userId;
  const isParent = lesson.child.parentId === userId;
  if (!isTeacher && !isParent) return null;
  const role: LessonRole = isTeacher ? 'teacher' : 'student';
  const name = isTeacher ? (lesson.teacher.user.name ?? lesson.teacher.user.email) : lesson.child.name;
  const sceneCount = lesson.instance ? readSceneDocument(lesson.instance.version.scene).length : 0;
  return { role, name, sceneCount };
}

function getOrCreateRoom(lessonId: string, sceneCount: number): Room {
  let room = rooms.get(lessonId);
  if (!room) {
    room = { lessonId, sceneCount, sceneIndex: 0, unlocked: false, strokesByScene: new Map(), members: new Set() };
    rooms.set(lessonId, room);
  } else {
    room.sceneCount = sceneCount; // на случай переподготовки урока
  }
  return room;
}

async function chatHistory(lessonId: string): Promise<LessonChatEntry[]> {
  const rows = await prisma.lessonChatMessage.findMany({
    where: { lessonId },
    orderBy: { createdAt: 'asc' },
    take: 200,
  });
  return rows.map((r) => ({
    id: r.id,
    role: r.role as LessonRole,
    authorName: '',
    body: r.body,
    createdAt: r.createdAt.toISOString(),
  }));
}

function currentStrokes(room: Room): LessonStroke[] {
  return room.strokesByScene.get(room.sceneIndex) ?? [];
}

async function handleMessage(room: Room, member: Member, raw: string) {
  let msg: LessonClientMessage;
  try {
    msg = JSON.parse(raw) as LessonClientMessage;
  } catch {
    return;
  }
  const isTeacher = member.role === 'teacher';

  switch (msg.t) {
    case 'ping':
      send(member.ws, { t: 'pong' });
      return;
    case 'chat': {
      const body = String(msg.body ?? '').trim().slice(0, LESSON_CHAT_MAX_LENGTH);
      if (!body) return;
      const row = await prisma.lessonChatMessage.create({
        data: { lessonId: room.lessonId, authorId: member.userId, role: member.role, body },
      });
      const entry: LessonChatEntry = { id: row.id, role: member.role, authorName: member.name, body, createdAt: row.createdAt.toISOString() };
      broadcast(room, { t: 'chat', entry });
      return;
    }
    case 'scene-event':
      // Проксируем взаимодействие ДРУГИМ участникам (плеер-инициатор применил локально).
      broadcast(room, { t: 'scene-event', event: msg.event, from: member.role }, member);
      return;
    default:
      break;
  }

  // Дальше — только команды учителя (он — источник истины).
  if (!isTeacher) return;

  switch (msg.t) {
    case 'nav': {
      const idx = Math.max(0, Math.min(room.sceneCount - 1, Math.floor(msg.sceneIndex)));
      room.sceneIndex = idx;
      room.unlocked = false;
      broadcast(room, { t: 'nav', sceneIndex: idx, strokes: currentStrokes(room) });
      broadcast(room, { t: 'unlock', value: false });
      return;
    }
    case 'unlock':
      room.unlocked = Boolean(msg.value);
      broadcast(room, { t: 'unlock', value: room.unlocked });
      return;
    case 'reward':
      broadcast(room, { t: 'reward' });
      return;
    case 'draw-clear':
      room.strokesByScene.set(room.sceneIndex, []);
      broadcast(room, { t: 'draw-clear' });
      return;
    case 'draw-start': {
      const stroke: LessonStroke = { id: msg.id, color: msg.color, size: msg.size, points: [msg.point] };
      const list = room.strokesByScene.get(room.sceneIndex) ?? [];
      list.push(stroke);
      room.strokesByScene.set(room.sceneIndex, list.slice(-500));
      broadcast(room, { t: 'draw-start', id: msg.id, color: msg.color, size: msg.size, point: msg.point }, member);
      return;
    }
    case 'draw-append': {
      const list = room.strokesByScene.get(room.sceneIndex) ?? [];
      const stroke = list.find((s) => s.id === msg.id);
      if (stroke) stroke.points.push(...msg.points.slice(0, 200));
      broadcast(room, { t: 'draw-append', id: msg.id, points: msg.points }, member);
      return;
    }
    case 'draw-end':
      broadcast(room, { t: 'draw-end', id: msg.id }, member);
      return;
    default:
      break;
  }
}

export function initLessonWebSocket(server: Server) {
  const wss = new WebSocketServer({ server, path: LESSON_WS_PATH });

  wss.on('connection', async (ws: WebSocket, req) => {
    try {
      const url = new URL(req.url ?? '', 'http://localhost');
      const lessonId = url.searchParams.get('lessonId') ?? '';
      const cookies = parseCookies(req.headers.cookie);
      const token = cookies.accessToken;
      if (!lessonId || !token) { ws.close(4001, 'unauthorized'); return; }

      let userId: string;
      let isAdmin = false;
      try {
        const payload = verifyAccessToken(token);
        userId = payload.sub;
        isAdmin = payload.role === 'ADMIN';
      } catch {
        ws.close(4001, 'unauthorized');
        return;
      }

      const ctx = await loadRoomContext(lessonId, userId, isAdmin);
      if (!ctx) { ws.close(4003, 'forbidden'); return; }

      const room = getOrCreateRoom(lessonId, ctx.sceneCount);
      const member: Member = { ws, role: ctx.role, userId, name: ctx.name, alive: true };
      room.members.add(member);

      send(ws, {
        t: 'state',
        role: ctx.role,
        state: {
          sceneIndex: room.sceneIndex,
          sceneCount: room.sceneCount,
          unlocked: room.unlocked,
          presence: presenceOf(room),
          strokes: currentStrokes(room),
        },
        chat: await chatHistory(lessonId),
      });
      broadcast(room, { t: 'presence', presence: presenceOf(room) });

      ws.on('message', (data) => { void handleMessage(room, member, data.toString()); });
      ws.on('pong', () => { member.alive = true; });
      ws.on('close', () => {
        room.members.delete(member);
        if (room.members.size === 0) rooms.delete(lessonId);
        else broadcast(room, { t: 'presence', presence: presenceOf(room) });
      });
    } catch (err) {
      logger.warn(`[lesson-ws] connection error: ${(err as Error).message}`);
      try { ws.close(1011, 'server error'); } catch { /* noop */ }
    }
  });

  // Heartbeat: рвём мёртвые соединения.
  const interval = setInterval(() => {
    for (const room of rooms.values()) {
      for (const m of room.members) {
        if (!m.alive) { m.ws.terminate(); continue; }
        m.alive = false;
        try { m.ws.ping(); } catch { /* noop */ }
      }
    }
  }, 30000);
  wss.on('close', () => clearInterval(interval));

  logger.info(`[lesson-ws] WebSocket сервер урока на ${LESSON_WS_PATH}`);
  return wss;
}
