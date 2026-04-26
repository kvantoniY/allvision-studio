import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { router } from './routes';
import { errorHandler } from './middleware/error-handler';
import { requestLogger } from './middleware/request-logger';

export const app = express();

app.set('trust proxy', 1);

app.use(helmet());
app.use(
  cors({
    origin: process.env.PUBLIC_WEB_URL ?? 'http://localhost:3000',
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
app.use(cookieParser());
app.use(requestLogger);

app.use('/api', router);

app.use(errorHandler);
