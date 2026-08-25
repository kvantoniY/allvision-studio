import jwt, { type SignOptions } from 'jsonwebtoken';

const ACCESS_TTL_DEFAULT = process.env.JWT_ACCESS_TTL
  ?? (process.env.ACCESS_TTL_MIN ? `${process.env.ACCESS_TTL_MIN}m` : '15m');
const REFRESH_TTL = process.env.JWT_REFRESH_TTL
  ?? (process.env.REFRESH_TTL_DAYS ? `${process.env.REFRESH_TTL_DAYS}d` : '30d');
export type JwtRole = 'USER' | 'ADMIN' | 'READONLY_ADMIN';

function accessSecret(): string {
  const s = process.env.JWT_ACCESS_SECRET ?? process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_ACCESS_SECRET is not set');
  return s;
}

function refreshSecret(): string {
  const s = process.env.JWT_REFRESH_SECRET;
  if (!s) throw new Error('JWT_REFRESH_SECRET is not set');
  return s;
}

export interface AccessTokenPayload {
  sub: string; // userId
  role: JwtRole;
}

export interface RefreshTokenPayload {
  sub: string;
}

export function accessTtlForRole(role: JwtRole): string {
  if (role === 'READONLY_ADMIN') {
    return `${Number(process.env.READONLY_ADMIN_ACCESS_TTL_MIN ?? '1440')}m`;
  }
  return ACCESS_TTL_DEFAULT;
}

export function signAccessToken(userId: string, role: JwtRole): string {
  const opts: SignOptions = { algorithm: 'HS256', expiresIn: accessTtlForRole(role) as SignOptions['expiresIn'] };
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
