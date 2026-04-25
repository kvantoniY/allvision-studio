import type { CookieOptions, Response } from 'express';

const ACCESS_MAX_AGE_MS = 15 * 60 * 1000;            // 15 минут
const REFRESH_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 дней

function baseCookieOpts(): CookieOptions {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    // В dev домен не выставляем — браузер сам подставит localhost.
    // В проде можно расширить на поддомены через COOKIE_DOMAIN.
    ...(isProd && process.env.COOKIE_DOMAIN ? { domain: process.env.COOKIE_DOMAIN } : {}),
    path: '/',
  };
}

export function setAuthCookies(res: Response, accessToken: string, refreshToken: string) {
  const base = baseCookieOpts();
  res.cookie('accessToken', accessToken, { ...base, maxAge: ACCESS_MAX_AGE_MS });
  res.cookie('refreshToken', refreshToken, { ...base, maxAge: REFRESH_MAX_AGE_MS });
}

export function clearAuthCookies(res: Response) {
  const base = baseCookieOpts();
  res.clearCookie('accessToken', base);
  res.clearCookie('refreshToken', base);
}
