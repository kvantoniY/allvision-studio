import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { router } from './routes';
import { errorHandler } from './middleware/error-handler';

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
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

app.use('/api', router);

app.use(errorHandler);
