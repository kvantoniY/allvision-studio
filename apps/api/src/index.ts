import './config/env';
import { app } from './app';
import { logger } from './utils/logger';

const port = Number(process.env.PORT ?? 4000);

app.listen(port, () => {
  logger.info(`API listening on http://localhost:${port}`);
});
