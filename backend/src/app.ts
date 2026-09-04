import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import { apiRouter } from './routes/index.js';
import {
  errorHandler,
  notFoundHandler,
  requestIdMiddleware,
} from './middleware/errorHandler.js';
import { requestLogger } from './middleware/requestLogger.js';
import { checkDatabaseConnection } from './lib/db.js';
import { checkMlHealth } from './services/ml.adapter.js';

export function createApp() {
  const app = express();

  app.use(requestIdMiddleware);
  app.use(requestLogger);
  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN.split(','),
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(
    rateLimit({
      windowMs: 60_000,
      max: env.NODE_ENV === 'test' ? 10_000 : 300,
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'kabadi-connect-backend' });
  });

  app.get('/ready', async (_req, res) => {
    const dbOk = await checkDatabaseConnection();
    const mlOk = await checkMlHealth();
    const ready = dbOk;
    res.status(ready ? 200 : 503).json({
      status: ready ? 'ready' : 'not_ready',
      dependencies: {
        database: dbOk ? 'up' : 'down',
        ml: mlOk ? 'up' : 'degraded',
      },
    });
  });

  app.use('/v1', apiRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
