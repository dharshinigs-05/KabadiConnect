import type { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { query } from '../lib/db.js';
import { verifyAccessToken } from '../lib/supabase.js';
import { useMockAuth } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { mockTokens } from './registry.js';

let io: Server | null = null;

const SOCKET_EVENTS = {
  OFFER_NEW: 'offer:new',
  OFFER_ACCEPTED: 'offer:accepted',
  OFFER_REJECTED: 'offer:rejected',
  TRANSACTION_STATUS_CHANGED: 'transaction:status_changed',
} as const;

export function initSocket(httpServer: HttpServer, corsOrigin: string): Server {
  io = new Server(httpServer, {
    cors: { origin: corsOrigin === '*' ? '*' : corsOrigin.split(','), methods: ['GET', 'POST'] },
    path: '/socket.io',
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token as string | undefined;
      if (!token) {
        next(new Error('Authentication required'));
        return;
      }

      let userId: string;
      if (useMockAuth()) {
        const mockUser = mockTokens.get(token);
        if (!mockUser) {
          next(new Error('Invalid token'));
          return;
        }
        userId = mockUser.id;
        socket.data.userId = userId;
        socket.data.role = mockUser.role;
        socket.data.recyclerId = mockUser.recyclerId;
        next();
        return;
      }

      ({ userId } = await verifyAccessToken(token));
      socket.data.userId = userId;

      const userResult = await query<{ role: string }>('SELECT role FROM users WHERE id = $1', [userId]);
      socket.data.role = userResult.rows[0]?.role;

      if (socket.data.role === 'recycler') {
        const mapping = await query<{ recycler_id: string }>(
          'SELECT recycler_id FROM recycler_users WHERE user_id = $1 LIMIT 1',
          [userId],
        );
        socket.data.recyclerId = mapping.rows[0]?.recycler_id;
      }

      next();
    } catch (error) {
      next(error instanceof Error ? error : new Error('Auth failed'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.data.userId as string;
    void socket.join(`user:${userId}`);
    logger.info('Socket connected', { userId });

    if (socket.data.recyclerId) {
      void socket.join(`recycler:${socket.data.recyclerId as string}`);
    }

    socket.on('disconnect', () => {
      logger.info('Socket disconnected', { userId });
    });
  });

  return io;
}

export function getIo(): Server | null {
  return io;
}

export function emitToUser(userId: string, event: string, payload: unknown): void {
  io?.to(`user:${userId}`).emit(event, payload);
}

export function emitToRecycler(recyclerId: string, event: string, payload: unknown): void {
  io?.to(`recycler:${recyclerId}`).emit(event, payload);
}

export { SOCKET_EVENTS };
