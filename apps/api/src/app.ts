import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { router } from './routes';
import { errorHandler } from './middleware/error-handler';
import { requestLogger } from './middleware/request-logger';
import { resolveWorkspacePath } from './utils/paths';

export const app = express();

app.set('trust proxy', 1);

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(
  cors({
    origin: process.env.CORS_ORIGIN ?? process.env.PUBLIC_WEB_URL ?? 'http://localhost:3000',
    credentials: true,
  }),
);
app.use(compression());
app.use(
  express.json({
    limit: '10mb',
    verify: (req, _res, buf) => {
      (req as typeof req & { rawBody?: Buffer }).rawBody = Buffer.from(buf);
    },
  }),
);
app.use(
  express.urlencoded({
    extended: false,
    limit: '1mb',
    verify: (req, _res, buf) => {
      (req as typeof req & { rawBody?: Buffer }).rawBody = Buffer.from(buf);
    },
  }),
);
app.use(cookieParser());
app.use(requestLogger);

// Раздача загруженных файлов (LocalFileStorage). В prod заменим на Yandex S3.
const uploadsDir = resolveWorkspacePath(process.env.UPLOADS_DIR ?? './uploads');
app.use(
  '/static/uploads',
  express.static(uploadsDir, {
    maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0,
    cacheControl: true,
    fallthrough: true,
  }),
);
app.use(
  '/static',
  express.static(uploadsDir, {
    maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0,
    cacheControl: true,
    fallthrough: true,
  }),
);

app.use('/api', router);

app.use(errorHandler);
