import type { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger.js';
import type { RequestWithId } from './errorHandler.js';

export function requestLogger(req: RequestWithId, res: Response, next: NextFunction): void {
  const start = Date.now();
  res.on('finish', () => {
    logger.info('HTTP request', {
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      latencyMs: Date.now() - start,
    });
  });
  next();
}
