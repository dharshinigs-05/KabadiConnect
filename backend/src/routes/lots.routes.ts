import { Router } from 'express';
import { routeParam } from '../lib/routeParams.js';
import {
  authenticate,
  requireCollector,
  type AuthenticatedRequest,
} from '../middleware/auth.js';
import { lotCreateSchema, parseBody } from '../validators/schemas.js';
import {
  createLot,
  getLotById,
  listCollectorLots,
  listOpenLots,
} from '../services/lots.service.js';

export const lotsRouter = Router();

lotsRouter.post('/', authenticate, requireCollector, async (req: AuthenticatedRequest, res, next) => {
  try {
    const input = parseBody(lotCreateSchema, req.body);
    const lot = await createLot(req.user!, input);
    res.status(201).json(lot);
  } catch (error) {
    next(error);
  }
});

lotsRouter.get('/open', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const result = await listOpenLots(req.user!, req.query.cursor as string | undefined);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

lotsRouter.get('/', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const result = await listCollectorLots(req.user!, req.query.cursor as string | undefined);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

lotsRouter.get('/:id', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const lot = await getLotById(routeParam(req.params.id), req.user!);
    res.json(lot);
  } catch (error) {
    next(error);
  }
});
