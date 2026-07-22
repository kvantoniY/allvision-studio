import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { prisma } from '@allvision/database';
import { verifyAccessToken, type JwtRole } from '../utils/jwt';
import { HttpError } from '../utils/http-error';
import { logger } from '../utils/logger';

export interface AuthUser {
  id: string;
  role: JwtRole;
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
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) return auth.slice('Bearer '.length);
  const fromCookie = req.cookies?.accessToken as string | undefined;
  if (fromCookie) return fromCookie;
  return null;
}

function tokenFingerprint(token: string) {
  return `${token.slice(0, 8)}:${crypto.createHash('sha256').update(token).digest('hex').slice(0, 12)}`;
}

function isMutatingMethod(method: string) {
  return method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS';
}

function readonlyMutationError(user: AuthUser, req: Request) {
  if (user.role !== 'READONLY_ADMIN' || !isMutatingMethod(req.method)) return null;
  logger.warn(`[auth] readonly mutation blocked userId=${user.id} method=${req.method} path=${req.originalUrl}`);
  return new HttpError(403, 'READONLY_ADMIN_FORBIDDEN', 'READONLY_ADMIN cannot perform mutating requests');
}

async function resolveUser(req: Request): Promise<AuthUser | null> {
  const token = readToken(req);
  if (!token) return null;
  try {
    const payload = verifyAccessToken(token);
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, role: true, email: true, deletedAt: true },
    });
    if (!user || user.deletedAt) {
      const reason = user?.deletedAt ? 'ACCOUNT_DELETED' : 'USER_NOT_FOUND';
      logger.warn(`[auth] verify rejected reason=${reason} userId=${payload.sub} token=${tokenFingerprint(token)} path=${req.originalUrl}`);
      return null;
    }
    logger.info(`[auth] verify accepted userId=${user.id} role=${user.role} token=${tokenFingerprint(token)} path=${req.originalUrl}`);
    return user as AuthUser;
  } catch (err) {
    logger.warn(
      `[auth] verify rejected reason=${(err as Error).name || 'INVALID_ACCESS'} `
      + `message=${(err as Error).message} token=${tokenFingerprint(token)} path=${req.originalUrl}`,
    );
    return null;
  }
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const user = await resolveUser(req);
  if (!user) {
    logger.warn(`[auth] requireAuth rejected reason=NO_VALID_ACCESS method=${req.method} path=${req.originalUrl}`);
    return next(new HttpError(401, 'UNAUTHORIZED', 'Authorization required'));
  }
  const readonlyError = readonlyMutationError(user, req);
  if (readonlyError) return next(readonlyError);
  req.user = user;
  next();
}

export async function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  const user = await resolveUser(req);
  if (!user) return next(new HttpError(401, 'UNAUTHORIZED', 'Authorization required'));
  const readonlyError = readonlyMutationError(user, req);
  if (readonlyError) return next(readonlyError);
  if (user.role !== 'ADMIN') return next(new HttpError(403, 'FORBIDDEN', 'Admin role required'));
  req.user = user;
  next();
}

export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const user = await resolveUser(req);
  if (user) req.user = user;
  next();
}
