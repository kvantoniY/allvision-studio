import jwt, { type SignOptions } from 'jsonwebtoken';

const ACCESS_TTL = process.env.JWT_ACCESS_TTL ?? '15m';
const REFRESH_TTL = process.env.JWT_REFRESH_TTL ?? '30d';

function accessSecret(): string {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET is not set');
  return s;
}

function refreshSecret(): string {
  const s = process.env.JWT_REFRESH_SECRET;
  if (!s) throw new Error('JWT_REFRESH_SECRET is not set');
  return s;
}

export interface AccessTokenPayload {
  sub: string; // userId
  role: 'USER' | 'ADMIN';
}

export interface RefreshTokenPayload {
  sub: string;
}

export function signAccessToken(userId: string, role: 'USER' | 'ADMIN'): string {
  const opts: SignOptions = { algorithm: 'HS256', expiresIn: ACCESS_TTL as SignOptions['expiresIn'] };
  return jwt.sign({ sub: userId, role }, accessSecret(), opts);
}

export function signRefreshToken(userId: string): string {
  const opts: SignOptions = { algorithm: 'HS256', expiresIn: REFRESH_TTL as SignOptions['expiresIn'] };
  return jwt.sign({ sub: userId }, refreshSecret(), opts);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, accessSecret(), { algorithms: ['HS256'] }) as AccessTokenPayload;
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return jwt.verify(token, refreshSecret(), { algorithms: ['HS256'] }) as RefreshTokenPayload;
}
