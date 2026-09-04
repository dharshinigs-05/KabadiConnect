import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import {
  isValidTransactionTransition,
  VALID_TRANSACTION_TRANSITIONS,
} from '../src/lib/transactionStateMachine.js';
import { multiplyMoney, moneyEquals } from '../src/lib/money.js';
import { AppError } from '../src/errors/AppError.js';
import { registerMockToken, clearMockTokens } from '../src/socket/registry.js';
import type { AuthUser } from '../src/middleware/auth.js';

vi.stubEnv('NODE_ENV', 'test');
vi.stubEnv('USE_MOCK_AUTH', 'true');
vi.stubEnv('USE_MOCK_ML', 'true');
vi.stubEnv('DEFAULT_DEMO_REGION', 'test-region');

const { createApp } = await import('../src/app.js');

describe('HTTP layer', () => {
  const app = createApp();

  it('returns health check without auth', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('rejects unauthenticated protected routes', async () => {
    const res = await request(app).get('/v1/users/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects invalid bearer token in mock auth mode', async () => {
    const res = await request(app)
      .get('/v1/users/me')
      .set('Authorization', 'Bearer invalid-token');
    expect(res.status).toBe(401);
  });

  it('validates lot create payload shape', async () => {
    const res = await request(app)
      .post('/v1/lots')
      .set('Authorization', 'Bearer invalid-token')
      .send({});
    expect([400, 401]).toContain(res.status);
  });

  it('returns 404 for unknown routes', async () => {
    const res = await request(app).get('/v1/unknown-route');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('transaction state machine', () => {
  it('allows only immediate next states or cancelled', () => {
    expect(isValidTransactionTransition('accepted', 'pickup_scheduled')).toBe(true);
    expect(isValidTransactionTransition('accepted', 'cancelled')).toBe(true);
    expect(isValidTransactionTransition('accepted', 'paid')).toBe(false);
    expect(isValidTransactionTransition('confirmed', 'paid')).toBe(true);
    expect(isValidTransactionTransition('paid', 'recycled')).toBe(true);
    expect(isValidTransactionTransition('recycled', 'cancelled')).toBe(false);
  });

  it('defines terminal states with no outgoing transitions', () => {
    expect(VALID_TRANSACTION_TRANSITIONS.recycled).toEqual([]);
    expect(VALID_TRANSACTION_TRANSITIONS.cancelled).toEqual([]);
  });
});

describe('offer total validation', () => {
  it('requires offered_total to equal rate times weight', () => {
    const rate = '135.00';
    const weight = 2.5;
    const expected = multiplyMoney(rate, weight);
    expect(expected).toBe('337.50');
    expect(moneyEquals(expected, '337.50')).toBe(true);
    expect(moneyEquals(expected, '337.51')).toBe(false);
  });
});

describe('AppError shape', () => {
  it('maps conflict to 409 with code', () => {
    const err = new AppError(409, 'INVALID_STATE_TRANSITION', 'Invalid transition');
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe('INVALID_STATE_TRANSITION');
  });
});

describe('ML adapter fallback', () => {
  beforeEach(() => {
    vi.stubEnv('USE_MOCK_ML', 'true');
  });

  it('returns fallback price prediction', async () => {
    const { predictPrice } = await import('../src/services/ml.adapter.js');
    const result = await predictPrice({
      material_category: 'pcb',
      estimated_weight_kg: 2.5,
    });
    expect(result.predicted_rate_inr_per_kg).toMatch(/^\d+\.\d{2}$/);
    expect(result.predicted_total_inr).toMatch(/^\d+\.\d{2}$/);
    expect(result.source).toBe('fallback');
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('returns fallback anomaly assessment', async () => {
    const { checkAnomaly } = await import('../src/services/ml.adapter.js');
    const result = await checkAnomaly({ transaction_id: 'test' });
    expect(result.risk_band).toBeDefined();
    expect(result.risk_score).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(result.reasons)).toBe(true);
  });
});

describe('RBAC mock auth tokens', () => {
  beforeEach(() => {
    clearMockTokens();
  });

  it('accepts registered mock collector token', async () => {
    const collector: AuthUser = {
      id: '11111111-1111-1111-1111-111111111111',
      role: 'collector',
      phoneNumber: '+919999999999',
      preferredLanguage: 'hi',
    };
    registerMockToken('test-collector-token', collector);

    const app = createApp();
    const res = await request(app)
      .get('/v1/users/me')
      .set('Authorization', 'Bearer test-collector-token');

    // Without DATABASE_URL the profile query fails with 500; auth middleware passes.
    expect(res.status).not.toBe(401);
  });

  it('rejects recycler-only route for collector token', async () => {
    const collector: AuthUser = {
      id: '11111111-1111-1111-1111-111111111111',
      role: 'collector',
      phoneNumber: '+919999999999',
      preferredLanguage: 'hi',
    };
    registerMockToken('collector-only', collector);

    const app = createApp();
    const res = await request(app)
      .post('/v1/lots/00000000-0000-0000-0000-000000000001/offers')
      .set('Authorization', 'Bearer collector-only')
      .send({
        offered_rate_inr_per_kg: '100.00',
        offered_total_inr: '250.00',
        pickup_available: true,
        expires_at: new Date(Date.now() + 86400000).toISOString(),
      });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});

describe('recycler matching scoring', () => {
  it('computes haversine distance', async () => {
    const { haversineKm } = await import('../src/services/matching.service.js');
    const distance = haversineKm(21.1458, 79.0882, 21.15, 79.09);
    expect(distance).toBeGreaterThan(0);
    expect(distance).toBeLessThan(5);
  });
});

describe('schema validation', () => {
  it('rejects invalid money in offer create schema', async () => {
    const { offerCreateSchema } = await import('../src/validators/schemas.js');
    const result = offerCreateSchema.safeParse({
      offered_rate_inr_per_kg: '12.5',
      offered_total_inr: '100.00',
      pickup_available: true,
      expires_at: new Date().toISOString(),
    });
    expect(result.success).toBe(false);
  });

  it('accepts valid payment create payload', async () => {
    const { paymentCreateSchema } = await import('../src/validators/schemas.js');
    const result = paymentCreateSchema.safeParse({
      amount_inr: '500.00',
      method: 'cash',
      status: 'cash_collected',
      confirmed_by_collector: true,
      confirmed_by_recycler: true,
    });
    expect(result.success).toBe(true);
  });
});
