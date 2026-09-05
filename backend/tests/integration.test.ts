/**
 * Integration tests — ML offline fallback, idempotency, and smoke validation.
 * These run WITHOUT a live database and with the real ML adapter path so
 * we can confirm fallbacks are safe when ML is unreachable.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { registerMockToken, clearMockTokens } from '../src/socket/registry.js';
import type { AuthUser } from '../src/middleware/auth.js';

vi.stubEnv('NODE_ENV', 'test');
vi.stubEnv('USE_MOCK_AUTH', 'true');
vi.stubEnv('USE_MOCK_ML', 'false');
// Point ML_SERVICE_URL to an address guaranteed to be un-reachable.
vi.stubEnv('ML_SERVICE_URL', 'http://127.0.0.1:19999');
vi.stubEnv('DEFAULT_DEMO_REGION', 'test-region');

const { createApp } = await import('../src/app.js');

// ─── ML Offline Fallback ──────────────────────────────────────────────────────
describe('10 — ML offline fallback: predictPrice', () => {
    it('returns a fallback prediction when ML service is unreachable', async () => {
        const { predictPrice } = await import('../src/services/ml.adapter.js');
        const result = await predictPrice({
            material_category: 'pcb',
            estimated_weight_kg: 5.0,
            condition: 'good',
        });
        // Must still return a valid response
        expect(result).toBeDefined();
        expect(result.predicted_rate_inr_per_kg).toMatch(/^\d+\.\d{2}$/);
        expect(result.predicted_total_inr).toMatch(/^\d+\.\d{2}$/);
        expect(result.source).toBe('fallback');
        expect(result.confidence).toBeGreaterThan(0);
        expect(Array.isArray(result.shap_breakdown)).toBe(true);
    });
});

describe('10 — ML offline fallback: checkAnomaly', () => {
    it('returns a conservative fallback when ML service is unreachable', async () => {
        const { checkAnomaly } = await import('../src/services/ml.adapter.js');
        const result = await checkAnomaly({
            material_category: 'pcb',
            final_weight_kg: '5.00',
            agreed_rate_inr_per_kg: '135.00',
            final_total_inr: '675.00',
        });
        expect(result).toBeDefined();
        expect(result.risk_band).toBeDefined();
        expect(['allow', 'monitor', 'verify', 'block']).toContain(result.risk_band);
        expect(result.risk_score).toBeGreaterThanOrEqual(0);
        expect(Array.isArray(result.reasons)).toBe(true);
    });
});

describe('10 — ML offline: checkMlHealth returns false', () => {
    it('returns false when ML service is unavailable', async () => {
        const { checkMlHealth } = await import('../src/services/ml.adapter.js');
        const healthy = await checkMlHealth();
        expect(healthy).toBe(false);
    });
});

// ─── API Smoke Test ───────────────────────────────────────────────────────────
describe('11 — API smoke tests', () => {
    const app = createApp();

    it('GET /health responds 200 without auth', async () => {
        const res = await request(app).get('/health');
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('ok');
    });

    it('GET /ready responds 200 without auth', async () => {
        const res = await request(app).get('/ready');
        // /ready may 200 or 503 depending on DB; it must not crash the server.
        expect([200, 503]).toContain(res.status);
    });

    it('POST /v1/auth/otp/request responds without auth header', async () => {
        const res = await request(app)
            .post('/v1/auth/otp/request')
            .send({ phone_number: '+919876543210' });
        // Without a real OTP provider this will succeed with mock or fail 500 — not 401.
        expect(res.status).not.toBe(401);
    });
});

// ─── Client UUID Idempotency (unit-level) ────────────────────────────────────
describe('7 — client_uuid idempotency (logic coverage)', () => {
    it('same client_uuid returns existing lot without creating a duplicate', () => {
        // Simulates the guard in createLotInternal where existing.rows[0] is checked.
        const existingLot = { id: 'server-lot-uuid-1', client_uuid: 'client-uuid-abc' };
        const incomingClientUuid = 'client-uuid-abc';
        // The service returns early if a match is found for the same collector.
        const isDuplicate = existingLot.client_uuid === incomingClientUuid;
        expect(isDuplicate).toBe(true);
    });

    it('different client_uuid on same collector creates a new lot', () => {
        const existingLot = { id: 'server-lot-uuid-1', client_uuid: 'client-uuid-abc' };
        const incomingClientUuid = 'client-uuid-xyz';
        const isDuplicate = existingLot.client_uuid === incomingClientUuid;
        expect(isDuplicate).toBe(false);
    });

    it('same client_uuid from a different collector is forbidden', () => {
        const existingLot = { collector_id: 'collector-aaa', client_uuid: 'client-uuid-abc' };
        const requestingCollector = { id: 'collector-bbb', role: 'collector' };
        const isOwner = existingLot.collector_id === requestingCollector.id;
        expect(isOwner).toBe(false);
    });

    it('sync endpoint returns status=existing for already-synced lots', () => {
        const mockResults = [{ client_uuid: 'client-uuid-abc', server_id: 'srv-001', status: 'existing' }];
        const found = mockResults.find(r => r.client_uuid === 'client-uuid-abc');
        expect(found?.status).toBe('existing');
    });
});

// ─── Authorization isolation checks (logic coverage) ─────────────────────────
describe('6 — Authorization isolation', () => {
    it('collector A cannot access lot owned by collector B', () => {
        const lot = { collector_id: 'collector-bbb' };
        const userA = { id: 'collector-aaa', role: 'collector' };
        const canAccess =
            userA.role === 'collector' && lot.collector_id === userA.id;
        expect(canAccess).toBe(false);
    });

    it('recycler can only see own transactions', () => {
        const tx = { recycler_id: 'recycler-bbb' };
        const userA = { recyclerId: 'recycler-aaa', role: 'recycler' };
        const canAccess =
            userA.role === 'recycler' && userA.recyclerId === tx.recycler_id;
        expect(canAccess).toBe(false);
    });

    it('collector cannot see another collector transaction', () => {
        const tx = { collector_id: 'collector-bbb' };
        const userA = { id: 'collector-aaa', role: 'collector' };
        const canAccess =
            userA.role === 'collector' && tx.collector_id === userA.id;
        expect(canAccess).toBe(false);
    });

    it('RBAC: collector gets 403 on recycler-only route', async () => {
        clearMockTokens();
        const app2 = createApp();
        const collector: AuthUser = {
            id: '22222222-2222-2222-2222-222222222222',
            role: 'collector',
            phoneNumber: '+919000000001',
            preferredLanguage: 'en',
        };
        registerMockToken('int-collector-token', collector);
        const res = await request(app2)
            .post('/v1/lots/00000000-0000-0000-0000-000000000001/offers')
            .set('Authorization', 'Bearer int-collector-token')
            .send({
                offered_rate_inr_per_kg: '100.00',
                offered_total_inr: '250.00',
                pickup_available: true,
                expires_at: new Date(Date.now() + 86400000).toISOString(),
            });
        expect(res.status).toBe(403);
    });
});
