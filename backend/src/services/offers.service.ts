import { randomUUID } from 'crypto';
import type pg from 'pg';
import { query, withTransaction } from '../lib/db.js';
import { mapOffer, mapTransaction } from '../mappers/index.js';
import { badRequest, conflict, forbidden, notFound } from '../errors/AppError.js';
import { moneyEquals, multiplyMoney, parseMoney } from '../lib/money.js';
import type { AuthUser } from '../middleware/auth.js';
import type { LotRow, OfferRow, TransactionRow } from '../types/contracts.js';
import { emitToUser, emitToRecycler } from '../socket/events.js';
import type { z } from 'zod';
import type { offerCreateSchema } from '../validators/schemas.js';
import { encodeCursor, decodeCursor, PAGE_SIZE } from '../repositories/helpers.js';

type OfferCreateInput = z.infer<typeof offerCreateSchema>;

export async function createOffer(user: AuthUser, lotId: string, input: OfferCreateInput) {
  if (user.role !== 'recycler' || !user.recyclerId) {
    throw forbidden('Recycler facility mapping required');
  }

  const recyclerResult = await query<{ authorization_status: string }>(
    'SELECT authorization_status FROM recyclers WHERE id = $1',
    [user.recyclerId],
  );
  if (recyclerResult.rows[0]?.authorization_status !== 'authorized') {
    throw forbidden('Recycler is not authorized to submit offers');
  }

  const lotResult = await query<LotRow>('SELECT * FROM lots WHERE id = $1', [lotId]);
  const lot = lotResult.rows[0];
  if (!lot) {
    throw notFound('Lot not found');
  }
  if (lot.status !== 'open') {
    throw conflict('Lot is not open for offers');
  }

  const weight = lot.verified_weight_kg ?? lot.estimated_weight_kg;
  const expectedTotal = multiplyMoney(input.offered_rate_inr_per_kg, weight);
  if (!moneyEquals(expectedTotal, input.offered_total_inr)) {
    throw badRequest(
      `offered_total_inr must equal offered_rate_inr_per_kg × weight (${expectedTotal})`,
    );
  }

  if (new Date(input.expires_at) <= new Date()) {
    throw badRequest('expires_at must be in the future');
  }

  try {
    const result = await query<OfferRow>(
      `INSERT INTO offers (lot_id, recycler_id, offered_rate_inr_per_kg, offered_total_inr, pickup_available, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        lotId,
        user.recyclerId,
        input.offered_rate_inr_per_kg,
        input.offered_total_inr,
        input.pickup_available,
        input.expires_at,
      ],
    );

    const offer = mapOffer(result.rows[0]);
    emitToUser(lot.collector_id, 'offer:new', { lot_id: lotId, offer_id: offer.id });
    return offer;
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && (error as { code: string }).code === '42501') {
      throw forbidden('Recycler is not authorized to submit offers');
    }
    throw error;
  }
}

export async function listOffersForLot(user: AuthUser, lotId: string, cursor?: string) {
  const lotResult = await query<LotRow>('SELECT * FROM lots WHERE id = $1', [lotId]);
  const lot = lotResult.rows[0];
  if (!lot) {
    throw notFound('Lot not found');
  }

  if (user.role === 'collector' && lot.collector_id !== user.id) {
    throw forbidden('Access denied');
  }
  if (user.role === 'recycler' && user.recyclerId) {
    // recyclers can only see their own offers via transaction flow; list is collector-facing
    throw forbidden('Collectors only for lot offer listing');
  }
  if (user.role !== 'collector' && user.role !== 'admin') {
    throw forbidden('Access denied');
  }

  const decoded = decodeCursor(cursor);
  const params: unknown[] = [lotId, PAGE_SIZE + 1];
  let sql = `SELECT * FROM offers WHERE lot_id = $1`;
  if (decoded) {
    params.push(decoded.createdAt, decoded.id);
    sql += ` AND (created_at, id) < ($3::timestamptz, $4::uuid)`;
  }
  sql += ` ORDER BY created_at DESC, id DESC LIMIT $2`;

  const result = await query<OfferRow>(sql, params);
  const rows = result.rows.slice(0, PAGE_SIZE);
  const items = rows.map(mapOffer);
  const next =
    result.rows.length > PAGE_SIZE
      ? encodeCursor(rows[rows.length - 1].created_at, rows[rows.length - 1].id)
      : null;

  return { items, next_cursor: next };
}

export async function rejectOffer(user: AuthUser, offerId: string) {
  const offerResult = await query<OfferRow & { collector_id: string }>(
    `SELECT o.*, l.collector_id
     FROM offers o
     JOIN lots l ON l.id = o.lot_id
     WHERE o.id = $1`,
    [offerId],
  );
  const row = offerResult.rows[0];
  if (!row) {
    throw notFound('Offer not found');
  }
  if (user.role !== 'collector' || row.collector_id !== user.id) {
    throw forbidden('Only the lot owner can reject offers');
  }
  if (row.status !== 'pending') {
    throw conflict('Offer is not pending');
  }

  const updated = await query<OfferRow>(
    `UPDATE offers SET status = 'rejected' WHERE id = $1 RETURNING *`,
    [offerId],
  );
  const offer = mapOffer(updated.rows[0]);
  emitToRecycler(row.recycler_id, 'offer:rejected', { lot_id: row.lot_id, offer_id: offer.id });
  return offer;
}

export async function acceptOffer(user: AuthUser, offerId: string) {
  if (user.role !== 'collector') {
    throw forbidden('Only collectors can accept offers');
  }

  try {
    return await withTransaction(async (client) => {
    const offerResult = await client.query<OfferRow>(
      `SELECT o.* FROM offers o WHERE o.id = $1 FOR UPDATE`,
      [offerId],
    );
    const offer = offerResult.rows[0];
    if (!offer) {
      throw notFound('Offer not found');
    }

    const lotResult = await client.query<LotRow>(
      `SELECT * FROM lots WHERE id = $1 FOR UPDATE`,
      [offer.lot_id],
    );
    const lot = lotResult.rows[0];
    if (!lot) {
      throw notFound('Lot not found');
    }
    if (lot.collector_id !== user.id) {
      throw forbidden('Only the lot owner can accept offers');
    }
    if (lot.status !== 'open') {
      throw conflict('Lot already has an accepted offer or is closed');
    }
    if (offer.status !== 'pending') {
      throw conflict('Offer is not pending');
    }
    if (new Date(offer.expires_at) <= new Date()) {
      await client.query(`UPDATE offers SET status = 'expired' WHERE id = $1`, [offerId]);
      throw conflict('Offer has expired');
    }

    await client.query(`UPDATE offers SET status = 'accepted' WHERE id = $1`, [offerId]);
    await client.query(
      `UPDATE offers SET status = 'rejected'
       WHERE lot_id = $1 AND id <> $2 AND status = 'pending'`,
      [offer.lot_id, offerId],
    );
    await client.query(`UPDATE lots SET status = 'offer_accepted' WHERE id = $1`, [offer.lot_id]);

    const transactionClientUuid = randomUUID();
    const txResult = await client.query<TransactionRow>(
      `INSERT INTO transactions (
        client_uuid, lot_id, offer_id, collector_id, recycler_id, agreed_rate_inr_per_kg, status
      ) VALUES ($1, $2, $3, $4, $5, $6, 'accepted')
      RETURNING *`,
      [
        transactionClientUuid,
        offer.lot_id,
        offer.id,
        lot.collector_id,
        offer.recycler_id,
        offer.offered_rate_inr_per_kg,
      ],
    );

    const transaction = mapTransaction(txResult.rows[0]);

    await client.query(
      `INSERT INTO trace_events (transaction_id, lot_id, event_type, actor_user_id, recorded_by, timestamp)
       VALUES ($1, $2, 'offer_accepted', $3, 'collector', NOW())`,
      [transaction.id, lot.id, user.id],
    );

    const rejectedOffers = await client.query<{ recycler_id: string; id: string }>(
      `SELECT recycler_id, id FROM offers WHERE lot_id = $1 AND status = 'rejected' AND id <> $2`,
      [offer.lot_id, offerId],
    );

    emitToUser(user.id, 'offer:accepted', { lot_id: lot.id, offer_id: offerId });
    emitToRecycler(offer.recycler_id, 'offer:accepted', {
      lot_id: lot.id,
      offer_id: offerId,
      transaction_id: transaction.id,
    });
    for (const rejected of rejectedOffers.rows) {
      emitToRecycler(rejected.recycler_id, 'offer:rejected', {
        lot_id: lot.id,
        offer_id: rejected.id,
      });
    }

    emitToUser(lot.collector_id, 'transaction:status_changed', {
      transaction_id: transaction.id,
      status: transaction.status,
    });
    emitToRecycler(offer.recycler_id, 'transaction:status_changed', {
      transaction_id: transaction.id,
      status: transaction.status,
    });

    return transaction;
    });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && (error as { code: string }).code === '23505') {
      throw conflict('Another offer was already accepted for this lot', 'CONFLICT');
    }
    throw error;
  }
}
