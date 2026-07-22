import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { User } from '@allvision/shared';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:4000');

export type ServerUser = Omit<
  User,
  'passwordHash' | 'passwordResetToken' | 'passwordResetExpiresAt' | 'emailVerifyToken' | 'emailVerifyExpiresAt'
>;

export async function getServerMe(): Promise<ServerUser | null> {
  const res = await fetch(`${API_URL}/api/auth/me`, {
    headers: { cookie: cookies().toString() },
    cache: 'no-store',
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { user?: ServerUser };
  return body.user ?? null;
}

export async function requireAdminPage(): Promise<ServerUser> {
  const me = await getServerMe();
  if (!me) redirect('/login?redirect=/admin/trends');
  if (me.role !== 'ADMIN') redirect('/dashboard');
  return me;
}

export async function requireAcademyStaffPage(): Promise<ServerUser> {
  const me = await getServerMe();
  if (!me) redirect('/login?redirect=/admin');
  if (me.role !== 'ADMIN' && me.role !== 'METHODIST') redirect('/');
  return me;
}
