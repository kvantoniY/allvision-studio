import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import multer from 'multer';
import { logger } from '../utils/logger';
import { HttpError } from '../utils/http-error';

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({
        error: { code: 'FILE_TOO_LARGE', message: 'Файл слишком большой (макс 25 MB)' },
      });
      return;
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      res.status(400).json({
        error: { code: 'INVALID_FIELD', message: 'Неожиданное поле файла' },
      });
      return;
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      res.status(400).json({
        error: { code: 'TOO_MANY_FILES', message: 'Слишком много файлов' },
      });
      return;
    }
    res.status(400).json({
      error: { code: 'INVALID_FILE', message: err.message },
    });
    return;
  }

  if (err instanceof Error && err.message.startsWith('INVALID_MIME')) {
    res.status(400).json({
      error: {
        code: 'UNSUPPORTED_FORMAT',
        message: 'Поддерживаются только JPEG, PNG и WebP',
      },
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Некорректные данные',
        issues: err.errors.map((i) => ({ path: i.path, message: i.message })),
      },
    });
    return;
  }

  if (err instanceof HttpError) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message },
    });
    return;
  }

  const e = err as Error & { status?: number; code?: string };
  logger.error(e.message ?? 'Unknown error', { stack: e.stack });
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Внутренняя ошибка сервера',
    },
  });
}
