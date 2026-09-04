import { Router } from 'express';
import { routeParam } from '../lib/routeParams.js';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js';
import { query } from '../lib/db.js';
import { mapRecycler } from '../mappers/index.js';
import { matchRecyclersForLot } from '../services/matching.service.js';
import type { RecyclerRow } from '../types/contracts.js';

export const recyclersRouter = Router();

recyclersRouter.get('/match', authenticate, async (req, res, next) => {
  try {
    const lotId = req.query.lot_id as string;
    if (!lotId) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'lot_id is required' } });
      return;
    }
    const items = await matchRecyclersForLot(lotId);
    res.json({ items, next_cursor: null });
  } catch (error) {
    next(error);
  }
});

recyclersRouter.get('/:id', authenticate, async (req, res, next) => {
  try {
    const result = await query<RecyclerRow>('SELECT * FROM recyclers WHERE id = $1', [routeParam(req.params.id)]);
    const row = result.rows[0];
    if (!row) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Recycler not found' } });
      return;
    }
    res.json(mapRecycler(row));
  } catch (error) {
    next(error);
  }
});
