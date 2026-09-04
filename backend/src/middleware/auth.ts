import type { Request, Response, NextFunction } from 'express';
import { query } from '../lib/db.js';
import { verifyAccessToken } from '../lib/supabase.js';
import { unauthorized, forbidden } from '../errors/AppError.js';
import { env, useMockAuth } from '../config/env.js';
import type { UserRole } from '../types/contracts.js';
import { registerMockToken } from '../socket/registry.js';

export interface AuthUser {
  id: string;
  role: UserRole;
  phoneNumber: string;
  preferredLanguage: string;
  recyclerId?: string;
  roleAtFacility?: 'staff' | 'owner';
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
  token?: string;
}

async function loadUser(userId: string): Promise<AuthUser | null> {
  const userResult = await query<{
    id: string;
    role: UserRole;
    phone_number: string;
    preferred_language: string;
  }>('SELECT id, role, phone_number, preferred_language FROM users WHERE id = $1', [userId]);

  const user = userResult.rows[0];
  if (!user) {
    return null;
  }

  const authUser: AuthUser = {
    id: user.id,
    role: user.role,
    phoneNumber: user.phone_number,
    preferredLanguage: user.preferred_language,
  };

  if (user.role === 'recycler') {
    const recyclerResult = await query<{ recycler_id: string; role_at_facility: 'staff' | 'owner' }>(
      'SELECT recycler_id, role_at_facility FROM recycler_users WHERE user_id = $1 LIMIT 1',
      [userId],
    );
    const mapping = recyclerResult.rows[0];
    if (mapping) {
      authUser.recyclerId = mapping.recycler_id;
      authUser.roleAtFacility = mapping.role_at_facility;
    }
  }

  return authUser;
}

export async function authenticate(req: AuthenticatedRequest, _res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw unauthorized();
    }

    const token = header.slice('Bearer '.length).trim();
    if (!token) {
      throw unauthorized();
    }

    if (useMockAuth()) {
      const { mockTokens } = await import('../socket/registry.js');
      const mockUser = mockTokens.get(token);
      if (!mockUser) {
        throw unauthorized('Invalid or expired token');
      }
      req.user = mockUser;
      req.token = token;
      next();
      return;
    }

    const { userId } = await verifyAccessToken(token);
    const user = await loadUser(userId);
    if (!user) {
      throw unauthorized('User profile not found');
    }

    req.user = user;
    req.token = token;
    next();
  } catch (error) {
    next(error instanceof Error && 'statusCode' in error ? error : unauthorized());
  }
}

export function optionalAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.headers.authorization) {
    next();
    return;
  }
  void authenticate(req, res, next);
}

export function requireRole(...roles: UserRole[]) {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(unauthorized());
      return;
    }
    if (!roles.includes(req.user.role)) {
      next(forbidden(`Requires one of roles: ${roles.join(', ')}`));
      return;
    }
    next();
  };
}

export function requireRecycler(req: AuthenticatedRequest, _res: Response, next: NextFunction): void {
  if (!req.user || req.user.role !== 'recycler' || !req.user.recyclerId) {
    next(forbidden('Recycler facility mapping required'));
    return;
  }
  next();
}

export function requireCollector(req: AuthenticatedRequest, _res: Response, next: NextFunction): void {
  if (!req.user || req.user.role !== 'collector') {
    next(forbidden('Collector role required'));
    return;
  }
  next();
}

export function createDevToken(user: AuthUser): string {
  const token = `dev-${user.id}`;
  registerMockToken(token, user);
  return token;
}

export function getMockOtp(): string {
  return env.MOCK_OTP;
}

export { loadUser };
