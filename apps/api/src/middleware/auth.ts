import type { NextFunction, Request, Response } from 'express';
import { prisma } from '@allvision/database';
import { verifyAccessToken } from '../utils/jwt';
import { HttpError } from '../utils/http-error';

export interface AuthUser {
  id: string;
  role: 'USER' | 'ADMIN';
  email: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

function readToken(req: Request): string | null {
  const fromCookie = req.cookies?.accessToken as string | undefined;
  if (fromCookie) return fromCookie;
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) return auth.slice('Bearer '.length);
  return null;
}

async function resolveUser(req: Request): Promise<AuthUser | null> {
  const token = readToken(req);
  if (!token) return null;
  try {
    const payload = verifyAccessToken(token);
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, role: true, email: true },
    });
    return user as AuthUser | null;
  } catch {
    return null;
  }
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const user = await resolveUser(req);
  if (!user) return next(new HttpError(401, 'UNAUTHORIZED', 'Требуется авторизация'));
  req.user = user;
  next();
}

export async function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  const user = await resolveUser(req);
  if (!user) return next(new HttpError(401, 'UNAUTHORIZED', 'Требуется авторизация'));
  if (user.role !== 'ADMIN') return next(new HttpError(403, 'FORBIDDEN', 'Требуются права администратора'));
  req.user = user;
  next();
}

export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const user = await resolveUser(req);
  if (user) req.user = user;
  next();
}
