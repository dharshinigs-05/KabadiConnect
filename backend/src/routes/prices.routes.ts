import { Router } from 'express';
import { getCurrentPrices, getPriceHistory } from '../services/pricing.service.js';

export const pricesRouter = Router();

pricesRouter.get('/', async (req, res, next) => {
  try {
    const items = await getCurrentPrices(req.query.material_category as string | undefined);
    res.json({ items, next_cursor: null });
  } catch (error) {
    next(error);
  }
});

pricesRouter.get('/history', async (req, res, next) => {
  try {
    const items = await getPriceHistory(req.query.material_category as string | undefined);
    res.json({ items, next_cursor: null });
  } catch (error) {
    next(error);
  }
});
