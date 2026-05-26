import type { NextFunction, Request, Response } from 'express';
import { captchaTokenFromRequest, verifyCaptchaToken } from '../services/captcha-service';

export function requireCaptcha() {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      await verifyCaptchaToken(captchaTokenFromRequest(req), req.ip);
      next();
    } catch (error) {
      next(error);
    }
  };
}
