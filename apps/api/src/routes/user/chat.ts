import { Router, type NextFunction, type Request, type Response } from 'express';
import { listChatModels } from '@allvision/shared';
import { requireAuth } from '../../middleware/auth';
import { uploadChatInput as uploadChatInputMiddleware } from '../../middleware/upload';
import { HttpError } from '../../utils/http-error';
import * as fileService from '../../services/file-service';
import { readModelPriceOverrides } from '../../services/model-pricing';

export const userChatRouter = Router();

userChatRouter.use(requireAuth);

userChatRouter.get('/models', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ models: listChatModels(), modelPriceOverrides: await readModelPriceOverrides() });
  } catch (err) {
    next(err);
  }
});

userChatRouter.post('/upload', uploadChatInputMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) throw new HttpError(400, 'FILE_REQUIRED', 'Прикрепите файл');
    const uploaded = await fileService.uploadChatInput(req.user!.id, req.file);
    res.status(201).json({ input: uploaded });
  } catch (err) {
    next(err);
  }
});

userChatRouter.post('/generate', (_req: Request, res: Response) => {
  res.status(410).json({
    error: {
      code: 'CHAT_ENDPOINT_DEPRECATED',
      message: 'Используйте /api/user/chats/:id/messages для новых сообщений.',
    },
  });
});

userChatRouter.get('/history', (_req: Request, res: Response) => {
  res.status(410).json({
    error: {
      code: 'CHAT_ENDPOINT_DEPRECATED',
      message: 'Используйте /api/user/chats для списка чатов.',
    },
  });
});
