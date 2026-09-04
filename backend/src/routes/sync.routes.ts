import { Router } from 'express';
import { authenticate, requireCollector, type AuthenticatedRequest } from '../middleware/auth.js';
import { syncLotsSchema, parseBody } from '../validators/schemas.js';
import { syncLots } from '../services/lots.service.js';

export const syncRouter = Router();

syncRouter.post('/lots', authenticate, requireCollector, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { items } = parseBody(syncLotsSchema, req.body);
    const result = await syncLots(req.user!, items);
    res.json(result);
  } catch (error) {
    next(error);
  }
});
