import { randomUUID } from 'crypto';
import type pg from 'pg';
import { query, withTransaction } from '../lib/db.js';
import { predictPrice } from '../services/ml.adapter.js';
import { multiplyMoney, moneyEquals, parseMoney } from '../lib/money.js';
import { mapLot } from '../mappers/index.js';
import { badRequest, conflict, forbidden, notFound } from '../errors/AppError.js';
import { getLotImageUrls, insertLotImages, encodeCursor, decodeCursor, PAGE_SIZE } from '../repositories/helpers.js';
import type { AuthUser } from '../middleware/auth.js';
import type { LotRow } from '../types/contracts.js';
import type { z } from 'zod';
import type { lotCreateSchema } from '../validators/schemas.js';

type LotCreateInput = z.infer<typeof lotCreateSchema>;

async function createLotInternal(user: AuthUser, input: LotCreateInput, existingClient = false) {
  if (user.role !== 'collector') {
    throw forbidden('Only collectors can create lots');
  }

  const existing = await query<LotRow>('SELECT * FROM lots WHERE client_uuid = $1', [input.client_uuid]);
  if (existing.rows[0]) {
    if (existing.rows[0].collector_id !== user.id) {
      throw forbidden('Client UUID belongs to another collector');
    }
    const imageUrls = await getLotImageUrls(existing.rows[0].id);
    return { lot: mapLot(existing.rows[0], imageUrls), created: false };
  }

  const prediction = await predictPrice({
    material_category: input.material_category,
    material_subcategory: input.material_subcategory,
    estimated_weight_kg: input.estimated_weight_kg,
    location: input.location,
    condition: input.condition,
  });

  const estimatedTotal = prediction.predicted_total_inr;

  const insertResult = await query<LotRow>(
    `INSERT INTO lots (
      client_uuid, collector_id, material_category, material_subcategory, description,
      estimated_weight_kg, weight_status, condition, source_type, estimated_value_total_inr,
      location, status, created_by_actor, synced_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'open',$12, NOW())
    RETURNING *`,
    [
      input.client_uuid,
      user.id,
      input.material_category,
      input.material_subcategory ?? null,
      input.description ?? null,
      input.estimated_weight_kg,
      input.weight_status,
      input.condition,
      input.source_type,
      estimatedTotal,
      JSON.stringify(input.location),
      input.created_by_actor,
    ],
  );

  const lot = insertResult.rows[0];
  await insertLotImages(lot.id, input.image_urls);

  await query(
    `INSERT INTO ml_predictions (lot_id, model_version, predicted_rate_inr_per_kg, confidence, shap_breakdown)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      lot.id,
      prediction.model_version,
      prediction.predicted_rate_inr_per_kg,
      prediction.confidence,
      JSON.stringify(prediction.shap_breakdown),
    ],
  );

  const imageUrls = await getLotImageUrls(lot.id);
  return {
    lot: mapLot(lot, imageUrls),
    created: !existingClient,
    price_breakdown: prediction.shap_breakdown,
  };
}

export async function createLot(user: AuthUser, input: LotCreateInput) {
  const result = await createLotInternal(user, input);
  return {
    ...result.lot,
    price_breakdown: result.price_breakdown ?? [],
  };
}

export async function syncLots(user: AuthUser, items: LotCreateInput[]) {
  const results: Array<{ client_uuid: string; server_id: string; status: string }> = [];
  for (const item of items) {
    const result = await createLotInternal(user, item, true);
    results.push({
      client_uuid: item.client_uuid,
      server_id: result.lot.id,
      status: result.created ? 'created' : 'existing',
    });
  }
  return { results };
}

export async function getLotById(lotId: string, user: AuthUser) {
  const result = await query<LotRow>('SELECT * FROM lots WHERE id = $1', [lotId]);
  const lot = result.rows[0];
  if (!lot) {
    throw notFound('Lot not found');
  }

  await assertLotAccess(lot, user);
  const imageUrls = await getLotImageUrls(lot.id);
  return mapLot(lot, imageUrls);
}

export async function listCollectorLots(user: AuthUser, cursor?: string) {
  if (user.role !== 'collector') {
    throw forbidden('Collector role required');
  }

  const decoded = decodeCursor(cursor);
  const params: unknown[] = [user.id, PAGE_SIZE + 1];
  let sql = `SELECT * FROM lots WHERE collector_id = $1`;
  if (decoded) {
    params.push(decoded.createdAt, decoded.id);
    sql += ` AND (created_at, id) < ($3::timestamptz, $4::uuid)`;
  }
  sql += ` ORDER BY created_at DESC, id DESC LIMIT $2`;

  const result = await query<LotRow>(sql, params);
  const rows = result.rows.slice(0, PAGE_SIZE);
  const items = await Promise.all(
    rows.map(async (row) => mapLot(row, await getLotImageUrls(row.id))),
  );

  const next =
    result.rows.length > PAGE_SIZE
      ? encodeCursor(rows[rows.length - 1].created_at, rows[rows.length - 1].id)
      : null;

  return { items, next_cursor: next };
}

export async function listOpenLots(user: AuthUser, cursor?: string) {
  if (user.role !== 'recycler' || !user.recyclerId) {
    throw forbidden('Authorized recycler required');
  }

  const recyclerResult = await query<{
    authorization_status: string;
    materials_accepted: string[];
    facility_location: { lat: number; lng: number } | null;
    service_area_radius_km: string;
  }>('SELECT authorization_status, materials_accepted, facility_location, service_area_radius_km FROM recyclers WHERE id = $1', [
    user.recyclerId,
  ]);
  const recycler = recyclerResult.rows[0];
  if (!recycler || recycler.authorization_status !== 'authorized') {
    throw forbidden('Recycler is not authorized');
  }

  const materials = recycler.materials_accepted;
  if (materials.length === 0) {
    return { items: [], next_cursor: null };
  }

  // Fix 8: filter by material category at the DB level (before pagination)
  const decoded = decodeCursor(cursor);
  const params: unknown[] = ['open', materials, PAGE_SIZE + 1];
  let sql = `SELECT * FROM lots WHERE status = $1 AND material_category = ANY($2::text[])`;
  if (decoded) {
    params.push(decoded.createdAt, decoded.id);
    sql += ` AND (created_at, id) < ($4::timestamptz, $5::uuid)`;
  }
  sql += ` ORDER BY created_at DESC, id DESC LIMIT $3`;

  const result = await query<LotRow>(sql, params);
  const rows = result.rows.slice(0, PAGE_SIZE);
  const items = await Promise.all(
    rows.map(async (row) => mapLot(row, await getLotImageUrls(row.id))),
  );

  const next =
    result.rows.length > PAGE_SIZE
      ? encodeCursor(rows[rows.length - 1].created_at, rows[rows.length - 1].id)
      : null;

  return { items, next_cursor: next };
}

async function assertLotAccess(lot: LotRow, user: AuthUser): Promise<void> {
  if (user.role === 'collector' && lot.collector_id === user.id) {
    return;
  }
  if (user.role === 'recycler' && lot.status === 'open') {
    // Fix 7: require authorization before recycler can access lot detail
    if (!user.recyclerId) throw forbidden('Recycler mapping required');
    const r = await query<{ authorization_status: string }>(
      'SELECT authorization_status FROM recyclers WHERE id = $1',
      [user.recyclerId],
    );
    if (r.rows[0]?.authorization_status === 'authorized') return;
    throw forbidden('Recycler is not authorized to access lot data');
  }
  if (user.role === 'admin') {
    return;
  }
  throw forbidden('Access denied to this lot');
}

export { assertLotAccess };
