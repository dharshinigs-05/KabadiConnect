import { Router } from 'express';
import { authRouter } from './auth.routes.js';
import { usersRouter, safetyGuidesRouter } from './users.routes.js';
import { uploadsRouter } from './uploads.routes.js';
import { lotsRouter } from './lots.routes.js';
import { syncRouter } from './sync.routes.js';
import { offersRouter } from './offers.routes.js';
import { pricesRouter } from './prices.routes.js';
import { recyclersRouter } from './recyclers.routes.js';
import {
  transactionsRouter,
  traceEventsRouter,
  collectorsRouter,
} from './transactions.routes.js';

export const apiRouter = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/users', usersRouter);
apiRouter.use('/uploads', uploadsRouter);
apiRouter.use('/lots', lotsRouter);
apiRouter.use('/sync', syncRouter);
apiRouter.use('/', offersRouter);
apiRouter.use('/prices', pricesRouter);
apiRouter.use('/recyclers', recyclersRouter);
apiRouter.use('/transactions', transactionsRouter);
apiRouter.use('/trace-events', traceEventsRouter);
apiRouter.use('/collectors', collectorsRouter);
apiRouter.use('/safety-guides', safetyGuidesRouter);
