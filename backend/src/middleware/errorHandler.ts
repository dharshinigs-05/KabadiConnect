import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { AppError } from '../errors/AppError.js';
import { logger } from '../lib/logger.js';
import { isProduction } from '../config/env.js';

export interface RequestWithId extends Request {
  requestId?: string;
}

export function requestIdMiddleware(req: RequestWithId, res: Response, next: NextFunction): void {
  const id = (req.headers['x-request-id'] as string | undefined) ?? randomUUID();
  req.requestId = id;
  res.setHeader('X-Request-Id', id);
  next();
}

export function errorHandler(err: unknown, req: RequestWithId, res: Response, _next: NextFunction): void {
  const requestId = req.requestId;

  if (err instanceof AppError) {
    logger.warn('Request failed with application error', {
      requestId,
      code: err.code,
      statusCode: err.statusCode,
      message: err.message,
    });
    res.status(err.statusCode).json({
      error: { code: err.code, message: err.message },
    });
    return;
  }

  if (err && typeof err === 'object' && 'code' in err) {
    const pgErr = err as { code?: string; constraint?: string; detail?: string };
    if (pgErr.code === '23505') {
      res.status(409).json({
        error: { code: 'CONFLICT', message: 'Resource already exists or constraint violated' },
      });
      return;
    }
    if (pgErr.code === '23514') {
      res.status(409).json({
        error: {
          code: 'INVALID_STATE_TRANSITION',
          message: pgErr.detail ?? 'Business rule or state transition rejected',
        },
      });
      return;
    }
    if (pgErr.code === '42501') {
      res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Operation not permitted' },
      });
      return;
    }
  }

  logger.error('Unhandled error', {
    requestId,
    error: err instanceof Error ? err.message : String(err),
  });

  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: isProduction() ? 'Internal server error' : err instanceof Error ? err.message : 'Unknown error',
    },
  });
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
}
