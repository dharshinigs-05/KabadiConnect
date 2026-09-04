import { Router } from 'express';
import { routeParam } from '../lib/routeParams.js';
import {
  authenticate,
  requireCollector,
  requireRecycler,
  type AuthenticatedRequest,
} from '../middleware/auth.js';
import { offerCreateSchema, parseBody } from '../validators/schemas.js';
import {
  createOffer,
  listOffersForLot,
  acceptOffer,
  rejectOffer,
} from '../services/offers.service.js';

export const offersRouter = Router();

offersRouter.post(
  '/lots/:lotId/offers',
  authenticate,
  requireRecycler,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const input = parseBody(offerCreateSchema, req.body);
      const offer = await createOffer(req.user!, routeParam(req.params.lotId, 'lotId'), input);
      res.status(201).json(offer);
    } catch (error) {
      next(error);
    }
  },
);

offersRouter.get(
  '/lots/:lotId/offers',
  authenticate,
  requireCollector,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const result = await listOffersForLot(
        req.user!,
        routeParam(req.params.lotId, 'lotId'),
        req.query.cursor as string | undefined,
      );
      res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

offersRouter.patch('/offers/:id/accept', authenticate, requireCollector, async (req, res, next) => {
  try {
    const transaction = await acceptOffer((req as AuthenticatedRequest).user!, routeParam(req.params.id));
    res.json(transaction);
  } catch (error) {
    next(error);
  }
});

offersRouter.patch('/offers/:id/reject', authenticate, requireCollector, async (req, res, next) => {
  try {
    const offer = await rejectOffer((req as AuthenticatedRequest).user!, routeParam(req.params.id));
    res.json(offer);
  } catch (error) {
    next(error);
  }
});
