import { NextResponse, type NextRequest } from 'next/server';

// Витрина Studio скрыта на время реворка в Academy (cutover A2.5). Бэкенд и админка
// остаются; публичные Studio-страницы редиректим на Academy-главную.
const STUDIO_SURFACE_PREFIXES = ['/services', '/trends', '/scenarios', '/studio', '/pricing', '/dashboard'];

// Каталог Studio (gift factory) больше не входит в рабочую IA Academy: витрина скрыта,
// поэтому её backoffice-разделы мягко возвращаем на новый обзор без удаления данных/роутов.
// ВАЖНО: операционные разделы платформы (пользователи/роли, платежи, расходы AI, модели,
// диагностика, мониторинг, проекты, поддержка) НЕ выводятся из строя — они нужны для
// эксплуатации живого сервиса. В частности /admin/users — единственный способ назначить
// роль TEACHER/METHODIST, без которого Academy не работает.
const RETIRED_ADMIN_PREFIXES = [
  '/admin/services',
  '/admin/categories',
  '/admin/media-assets',
  '/admin/style-presets',
  '/admin/scenario-templates',
  '/admin/trends',
  '/admin/token-packages',
];

function isStudioSurface(pathname: string): boolean {
  return STUDIO_SURFACE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + '/'),
  );
}

function isRetiredAdminSurface(pathname: string): boolean {
  return RETIRED_ADMIN_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + '/'),
  );
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (isStudioSurface(pathname)) {
    const url = req.nextUrl.clone();
    url.pathname = '/';
    url.search = '';
    return NextResponse.redirect(url, 301);
  }

  if (isRetiredAdminSurface(pathname)) {
    const url = req.nextUrl.clone();
    url.pathname = '/admin';
    url.search = '';
    return NextResponse.redirect(url, 307);
  }

  const accessToken = req.cookies.get('accessToken')?.value;
  const refreshToken = req.cookies.get('refreshToken')?.value;
  if (!accessToken && !refreshToken) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirect', req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  // Backend verifies auth/role. This gate only avoids redirecting users while silent refresh renews accessToken.
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/admin/:path*',
    '/ai/:path*',
    '/studio/:path*',
    '/profile/:path*',
    '/support/:path*',
    '/services/:path*',
    '/trends/:path*',
    '/scenarios/:path*',
    '/pricing',
    '/family/:path*',
    '/lessons/:path*',
    '/lesson/:path*',
    '/teacher/:path*',
    '/constructor/:path*',
    '/kid/:path*',
    '/messages/:path*',
  ],
};
