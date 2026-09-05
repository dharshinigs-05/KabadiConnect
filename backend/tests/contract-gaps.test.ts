import { describe, expect, it } from 'vitest';
import { handoverCreateSchema, paymentCreateSchema, pickupScheduleSchema } from '../src/validators/schemas.js';

const validPickup = {
  client_uuid: '11111111-1111-1111-1111-111111111111',
  scheduled_date: '2099-01-02',
  scheduled_time_window: '10:00-12:00',
  pickup_location: { lat: 21.1458, lng: 79.0882, label: 'Collector address' },
};

describe('contract gap request validation', () => {
  it('accepts a complete pickup schedule', () => {
    expect(pickupScheduleSchema.safeParse(validPickup).success).toBe(true);
  });

  it('rejects malformed, past, and incomplete pickup schedules', () => {
    expect(pickupScheduleSchema.safeParse({ ...validPickup, scheduled_date: '2099-02-30' }).success).toBe(false);
    expect(pickupScheduleSchema.safeParse({ ...validPickup, scheduled_date: '2000-01-01' }).success).toBe(false);
    expect(pickupScheduleSchema.safeParse({ ...validPickup, pickup_location: undefined }).success).toBe(false);
  });

  it('requires positive verified weight with at most two decimals', () => {
    const base = {
      client_uuid: '22222222-2222-2222-2222-222222222222',
      timestamp: '2099-01-02T10:00:00.000Z',
    };
    expect(handoverCreateSchema.safeParse({ ...base, verified_weight_kg: 2.5 }).success).toBe(true);
    expect(handoverCreateSchema.safeParse({ ...base, verified_weight_kg: 0 }).success).toBe(false);
    expect(handoverCreateSchema.safeParse({ ...base, verified_weight_kg: -1 }).success).toBe(false);
    expect(handoverCreateSchema.safeParse({ ...base, verified_weight_kg: 1.234 }).success).toBe(false);
    expect(handoverCreateSchema.safeParse({ ...base, verified_weight_kg: 100001 }).success).toBe(false);
  });

  it('keeps payment money as a two-decimal string', () => {
    const valid = {
      amount_inr: '500.00',
      method: 'upi',
      status: 'upi_paid',
      reference: 'upi-ref',
      confirmed_by_collector: true,
      confirmed_by_recycler: true,
    };
    expect(paymentCreateSchema.safeParse(valid).success).toBe(true);
    expect(paymentCreateSchema.safeParse({ ...valid, amount_inr: 500 }).success).toBe(false);
  });
});