import { Router, type Request, type Response, type NextFunction } from 'express';
import { requireAuth } from '../middleware/auth';
import { uploadSinglePhoto } from '../middleware/upload';
import { uploadUserImage } from '../services/file-service';
import { HttpError } from '../utils/http-error';

// TODO(1.6b): убрать этот роут после реализации /api/projects.
export const testRouter = Router();

testRouter.post(
  '/upload',
  requireAuth,
  uploadSinglePhoto,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) throw new HttpError(400, 'NO_FILE', 'Файл не передан в поле image');
      const result = await uploadUserImage(req.user!.id, req.file.buffer, req.file.mimetype);
      res.json({ url: result.url, key: result.key, dimensions: result.dimensions });
    } catch (e) {
      next(e);
    }
  },
);
