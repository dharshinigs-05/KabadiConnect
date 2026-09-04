import { createHash, randomBytes } from 'crypto';
import { query, withTransaction } from '../lib/db.js';
import { mapPayment, mapTraceEvent, mapTransaction } from '../mappers/index.js';
import {
  badRequest,
  conflict,
  forbidden,
  notFound,
} from '../errors/AppError.js';
import { multiplyMoney, parseMoney } from '../lib/money.js';
import { checkAnomaly } from '../services/ml.adapter.js';
import type { AuthUser } from '../middleware/auth.js';
import type { PaymentRow, TraceEventRow, TransactionRow } from '../types/contracts.js';
import { emitToUser, emitToRecycler } from '../socket/events.js';
import {
  decodeCursor,
  encodeCursor,
  getTraceEventPhotoUrls,
  insertTraceEventPhotos,
  PAGE_SIZE,
} from '../repositories/helpers.js';
import { isValidTransactionTransition } from '../lib/transactionStateMachine.js';
import type { z } from 'zod';
import type {
  paymentCreateSchema,
  traceEventCreateSchema,
  transactionStatusSchema,
} from '../validators/schemas.js';

type TraceEventInput = z.infer<typeof traceEventCreateSchema>;
type PaymentInput = z.infer<typeof paymentCreateSchema>;

async function getTransactionRow(id: string): Promise<TransactionRow> {
  const result = await query<TransactionRow>('SELECT * FROM transactions WHERE id = $1', [id]);
  const row = result.rows[0];
  if (!row) {
    throw notFound('Transaction not found');
  }
  return row;
}

async function assertTransactionAccess(tx: TransactionRow, user: AuthUser): Promise<void> {
  if (user.role === 'admin') {
    return;
  }
  if (user.role === 'collector' && tx.collector_id === user.id) {
    return;
  }
  if (user.role === 'recycler' && user.recyclerId === tx.recycler_id) {
    return;
  }
  throw forbidden('Access denied to this transaction');
}

export async function getTransaction(id: string, user: AuthUser) {
  const tx = await getTransactionRow(id);
  await assertTransactionAccess(tx, user);
  return mapTransaction(tx);
}

export async function listTransactions(user: AuthUser, recyclerId?: string, cursor?: string) {
  const decoded = decodeCursor(cursor);
  const params: unknown[] = [PAGE_SIZE + 1];
  let sql = 'SELECT * FROM transactions WHERE 1=1';
  let paramIdx = 2;

  if (user.role === 'collector') {
    sql += ` AND collector_id = $${paramIdx}`;
    params.push(user.id);
    paramIdx++;
  } else if (user.role === 'recycler') {
    if (!user.recyclerId) {
      throw forbidden('Recycler mapping required');
    }
    sql += ` AND recycler_id = $${paramIdx}`;
    params.push(recyclerId ?? user.recyclerId);
    paramIdx++;
  } else if (recyclerId) {
    sql += ` AND recycler_id = $${paramIdx}`;
    params.push(recyclerId);
    paramIdx++;
  }

  if (decoded) {
    sql += ` AND (updated_at, id) < ($${paramIdx}::timestamptz, $${paramIdx + 1}::uuid)`;
    params.push(decoded.createdAt, decoded.id);
    paramIdx += 2;
  }

  sql += ` ORDER BY updated_at DESC, id DESC LIMIT $1`;

  const result = await query<TransactionRow>(sql, params);
  const rows = result.rows.slice(0, PAGE_SIZE);
  const items = rows.map(mapTransaction);
  const next =
    result.rows.length > PAGE_SIZE
      ? encodeCursor(rows[rows.length - 1].updated_at, rows[rows.length - 1].id)
      : null;

  return { items, next_cursor: next };
}

export async function transitionStatus(
  id: string,
  user: AuthUser,
  newStatus: z.infer<typeof transactionStatusSchema>['status'],
) {
  const tx = await getTransactionRow(id);
  await assertTransactionAccess(tx, user);

  const allowed = isValidTransactionTransition(tx.status, newStatus);
  if (!allowed) {
    throw conflict(
      `Invalid state transition from ${tx.status} to ${newStatus}`,
      'INVALID_STATE_TRANSITION',
    );
  }

  const result = await query<TransactionRow>(
    `UPDATE transactions SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
    [newStatus, id],
  );

  const updated = mapTransaction(result.rows[0]);

  if (newStatus === 'recycled') {
    await query(
      `INSERT INTO trace_events (transaction_id, lot_id, event_type, actor_user_id, recorded_by, timestamp)
       VALUES ($1, $2, 'recycled_confirmed', $3, $4, NOW())`,
      [id, tx.lot_id, user.id, user.role === 'recycler' ? 'recycler' : 'collector'],
    );
    await query(`UPDATE lots SET status = 'closed' WHERE id = $1`, [tx.lot_id]);
  }

  emitToUser(tx.collector_id, 'transaction:status_changed', {
    transaction_id: updated.id,
    status: updated.status,
  });
  emitToRecycler(tx.recycler_id, 'transaction:status_changed', {
    transaction_id: updated.id,
    status: updated.status,
  });

  return updated;
}

export async function getTransactionRisk(id: string, user: AuthUser) {
  const tx = await getTransactionRow(id);
  await assertTransactionAccess(tx, user);

  const lotResult = await query<{ estimated_weight_kg: string; material_category: string }>(
    'SELECT estimated_weight_kg, material_category FROM lots WHERE id = $1',
    [tx.lot_id],
  );
  const lot = lotResult.rows[0];

  return checkAnomaly({
    transaction_id: tx.id,
    agreed_rate_inr_per_kg: tx.agreed_rate_inr_per_kg,
    final_total_inr: tx.final_total_inr,
    final_weight_kg: tx.final_weight_kg,
    material_category: lot?.material_category,
    estimated_weight_kg: lot?.estimated_weight_kg,
  });
}

function generateHandoverCode(): string {
  return `KC-${randomBytes(3).toString('hex').toUpperCase()}`;
}

function generateRecordHash(payload: Record<string, unknown>): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(payload)).digest('hex')}`;
}

export async function createTraceEvent(
  transactionId: string,
  user: AuthUser,
  input: TraceEventInput,
) {
  const tx = await getTransactionRow(transactionId);
  await assertTransactionAccess(tx, user);

  const recordedBy = user.role === 'recycler' ? 'recycler' : 'collector';
  if (user.role === 'collector' && tx.collector_id !== user.id) {
    throw forbidden('Collector does not own transaction');
  }
  if (user.role === 'recycler' && user.recyclerId !== tx.recycler_id) {
    throw forbidden('Recycler not authorized for transaction');
  }

  let handoverCode: string | null = null;
  let recordHash: string | null = null;

  if (input.event_type === 'handover_photo') {
    handoverCode = generateHandoverCode();
    recordHash = generateRecordHash({
      transaction_id: transactionId,
      lot_id: tx.lot_id,
      gps: input.gps,
      timestamp: input.timestamp,
      handover_reference_code: handoverCode,
    });
  }

  const result = await query<TraceEventRow>(
    `INSERT INTO trace_events (
      transaction_id, lot_id, event_type, gps, timestamp, actor_user_id,
      handover_reference_code, record_hash, recorded_by
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    RETURNING *`,
    [
      transactionId,
      tx.lot_id,
      input.event_type,
      JSON.stringify(input.gps),
      input.timestamp,
      user.id,
      handoverCode,
      recordHash,
      recordedBy,
    ],
  );

  await insertTraceEventPhotos(result.rows[0].id, input.photo_urls);

  if (input.event_type === 'handover_photo') {
    await query(`UPDATE transactions SET status = 'handed_over', updated_at = NOW() WHERE id = $1`, [
      transactionId,
    ]);
    emitToUser(tx.collector_id, 'transaction:status_changed', {
      transaction_id: transactionId,
      status: 'handed_over',
    });
    emitToRecycler(tx.recycler_id, 'transaction:status_changed', {
      transaction_id: transactionId,
      status: 'handed_over',
    });
  }

  const photoUrls = await getTraceEventPhotoUrls(result.rows[0].id);
  return mapTraceEvent(result.rows[0], photoUrls);
}

export async function confirmHandover(
  traceEventId: string,
  user: AuthUser,
  handoverReferenceCode: string,
) {
  if (user.role !== 'recycler' || !user.recyclerId) {
    throw forbidden('Recycler role required');
  }

  const eventResult = await query<TraceEventRow>(
    'SELECT * FROM trace_events WHERE id = $1',
    [traceEventId],
  );
  const event = eventResult.rows[0];
  if (!event) {
    throw notFound('Trace event not found');
  }
  if (event.event_type !== 'handover_photo') {
    throw badRequest('Only handover_photo events can be confirmed');
  }
  if (event.handover_reference_code !== handoverReferenceCode) {
    throw badRequest('Invalid handover reference code');
  }

  const tx = await getTransactionRow(event.transaction_id);
  if (tx.recycler_id !== user.recyclerId) {
    throw forbidden('Recycler not authorized for this transaction');
  }

  const confirmResult = await query<TraceEventRow>(
    `INSERT INTO trace_events (
      transaction_id, lot_id, event_type, gps, timestamp, actor_user_id, recorded_by
    ) VALUES ($1,$2,'handover_confirmed',$3,NOW(),$4,'recycler')
    RETURNING *`,
    [event.transaction_id, event.lot_id, event.gps ? JSON.stringify(event.gps) : null, user.id],
  );

  await query(`UPDATE transactions SET status = 'confirmed', updated_at = NOW() WHERE id = $1`, [
    tx.id,
  ]);

  emitToUser(tx.collector_id, 'transaction:status_changed', {
    transaction_id: tx.id,
    status: 'confirmed',
  });
  emitToRecycler(tx.recycler_id, 'transaction:status_changed', {
    transaction_id: tx.id,
    status: 'confirmed',
  });

  return mapTraceEvent(confirmResult.rows[0], []);
}

export async function recordPayment(transactionId: string, user: AuthUser, input: PaymentInput) {
  const tx = await getTransactionRow(transactionId);
  await assertTransactionAccess(tx, user);

  if (tx.status !== 'confirmed') {
    throw conflict('Payment requires a confirmed transaction');
  }

  if (input.method !== 'cash' && !input.reference) {
    throw badRequest('reference is required for non-cash payments');
  }

  const result = await query<PaymentRow>(
    `INSERT INTO payments (
      transaction_id, amount_inr, method, status, reference,
      confirmed_by_collector, confirmed_by_recycler
    ) VALUES ($1,$2,$3,$4,$5,$6,$7)
    RETURNING *`,
    [
      transactionId,
      input.amount_inr,
      input.method,
      input.status,
      input.reference ?? null,
      input.confirmed_by_collector,
      input.confirmed_by_recycler,
    ],
  );

  if (input.status !== 'pending') {
    await query(`UPDATE transactions SET status = 'paid', updated_at = NOW() WHERE id = $1`, [
      transactionId,
    ]);
    emitToUser(tx.collector_id, 'transaction:status_changed', {
      transaction_id: transactionId,
      status: 'paid',
    });
    emitToRecycler(tx.recycler_id, 'transaction:status_changed', {
      transaction_id: transactionId,
      status: 'paid',
    });
  }

  await query(
    `INSERT INTO trace_events (transaction_id, lot_id, event_type, actor_user_id, recorded_by, timestamp)
     VALUES ($1, $2, 'payment_recorded', $3, $4, NOW())`,
    [transactionId, tx.lot_id, user.id, user.role === 'recycler' ? 'recycler' : 'collector'],
  );

  return mapPayment(result.rows[0]);
}

export async function getCollectorEarnings(user: AuthUser) {
  if (user.role !== 'collector') {
    throw forbidden('Collector role required');
  }

  const result = await query<{ total: string | null }>(
    `SELECT COALESCE(SUM(p.amount_inr), 0) AS total
     FROM payments p
     JOIN transactions t ON t.id = p.transaction_id
     WHERE t.collector_id = $1
       AND p.status IN ('cash_collected', 'upi_paid', 'bank_transfer')`,
    [user.id],
  );

  const total = result.rows[0]?.total ?? '0';
  return { total_earned_inr: parseMoney(String(total)).toFixed(2) };
}
