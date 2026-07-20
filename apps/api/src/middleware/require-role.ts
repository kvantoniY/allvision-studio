import type { NextFunction, Request, Response } from 'express';
import { HttpError } from '../utils/http-error';
import type { JwtRole } from '../utils/jwt';

/**
 * Пускает только перечисленные роли (после requireAuth).
 * ADMIN проходит всегда — платформенный суперпользователь.
 */
export function requireRole(...roles: JwtRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new HttpError(401, 'UNAUTHORIZED', 'Требуется авторизация'));
    }
    if (req.user.role === 'ADMIN' || roles.includes(req.user.role)) {
      return next();
    }
    return next(new HttpError(403, 'FORBIDDEN_ROLE', 'Недостаточно прав для этого раздела'));
  };
}

/** Родительский доступ: PARENT (Academy) и legacy USER (аккаунты Studio). */
export const requireParent = requireRole('PARENT', 'USER');

/** Управление учебной программой: METHODIST (+ ADMIN всегда). */
export const requireMethodist = requireRole('METHODIST');
