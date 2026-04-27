import type { NextFunction, Request, Response } from 'express';
import { HttpError } from '../utils/http-error';

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) {
    return next(new HttpError(401, 'UNAUTHORIZED', 'РўСЂРµР±СѓРµС‚СЃСЏ Р°РІС‚РѕСЂРёР·Р°С†РёСЏ'));
  }
  if (req.user.role !== 'ADMIN') {
    return next(new HttpError(403, 'FORBIDDEN_ADMIN_ONLY', 'РўСЂРµР±СѓСЋС‚СЃСЏ РїСЂР°РІР° Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂР°'));
  }
  return next();
}
