import { createHash, randomBytes } from 'crypto';
import { query, withTransaction } from '../lib/db.js';
import { mapPayment, mapPickupSchedule, mapTraceEvent, mapTransaction } from '../mappers/index.js';
import {
  badRequest,
  conflict,
  forbidden,
  notFound,
} from '../errors/AppError.js';
import { multiplyMoney, parseMoney, moneyEquals } from '../lib/money.js';
import { checkAnomaly } from '../services/ml.adapter.js';
import type { AuthUser } from '../middleware/auth.js';
import type { PaymentRow, PickupScheduleRow, TraceEventRow, TransactionRow } from '../types/contracts.js';
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
  handoverCreateSchema,
  pickupScheduleSchema,
  traceEventCreateSchema,
  transactionStatusSchema,
} from '../validators/schemas.js';

type TraceEventInput = z.infer<typeof traceEventCreateSchema>;
type PaymentInput = z.infer<typeof paymentCreateSchema>;
type PickupScheduleInput = z.infer<typeof pickupScheduleSchema>;
type HandoverInput = z.infer<typeof handoverCreateSchema>;
type LotWeightRow = { estimated_weight_kg: string };

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
    params.push(user.recyclerId);
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

  if (['pickup_scheduled', 'handed_over', 'confirmed', 'paid'].includes(newStatus)) {
    throw conflict('Use the workflow endpoint for this lifecycle transition', 'INVALID_STATE_TRANSITION');
  }

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

export async function schedulePickup(transactionId: string, user: AuthUser, input: PickupScheduleInput) {
  if (user.role !== 'collector' && user.role !== 'recycler') {
    throw forbidden('Collector or recycler role required');
  }

  return withTransaction(async (client) => {
    const txResult = await client.query<TransactionRow>(
      'SELECT * FROM transactions WHERE id = $1 FOR UPDATE',
      [transactionId],
    );
    const tx = txResult.rows[0];
    if (!tx) {
      throw notFound('Transaction not found');
    }
    await assertTransactionAccess(tx, user);
    if (tx.status !== 'accepted' && tx.status !== 'pickup_scheduled') {
      throw conflict(`Pickup cannot be scheduled from ${tx.status} state`, 'INVALID_STATE_TRANSITION');
    }

    const reusedKey = await client.query<{ transaction_id: string }>(
      'SELECT transaction_id FROM pickup_schedules WHERE client_uuid = $1',
      [input.client_uuid],
    );
    if (reusedKey.rows[0] && reusedKey.rows[0].transaction_id !== transactionId) {
      throw conflict('Idempotency key already belongs to another pickup', 'IDEMPOTENCY_CONFLICT');
    }

    const existing = await client.query<PickupScheduleRow>(
      'SELECT * FROM pickup_schedules WHERE transaction_id = $1 FOR UPDATE',
      [transactionId],
    );
    const wasScheduled = existing.rows.length > 0;
    const scheduleResult = await client.query<PickupScheduleRow>(
      `INSERT INTO pickup_schedules (
        transaction_id, client_uuid, scheduled_date, scheduled_time_window,
        pickup_location, collector_note, recycler_note
      ) VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT (transaction_id) DO UPDATE SET
        client_uuid = EXCLUDED.client_uuid,
        scheduled_date = EXCLUDED.scheduled_date,
        scheduled_time_window = EXCLUDED.scheduled_time_window,
        pickup_location = EXCLUDED.pickup_location,
        collector_note = EXCLUDED.collector_note,
        recycler_note = EXCLUDED.recycler_note,
        status = 'scheduled', updated_at = NOW()
      RETURNING *`,
      [
        transactionId,
        input.client_uuid,
        input.scheduled_date,
        input.scheduled_time_window,
        JSON.stringify(input.pickup_location),
        input.collector_note ?? null,
        input.recycler_note ?? null,
      ],
    );

    if (tx.status === 'accepted') {
      await client.query(
        `UPDATE transactions SET status = 'pickup_scheduled', updated_at = NOW() WHERE id = $1`,
        [transactionId],
      );
    }

    if (!wasScheduled) {
      await client.query(
        `INSERT INTO trace_events (transaction_id, lot_id, event_type, actor_user_id, recorded_by, timestamp)
         VALUES ($1, $2, 'pickup_scheduled', $3, $4, NOW())`,
        [transactionId, tx.lot_id, user.id, user.role],
      );
    }

    const schedule = mapPickupSchedule(scheduleResult.rows[0]);
    emitToUser(tx.collector_id, 'transaction:status_changed', {
      transaction_id: transactionId,
      status: 'pickup_scheduled',
    });
    emitToRecycler(tx.recycler_id, 'transaction:status_changed', {
      transaction_id: transactionId,
      status: 'pickup_scheduled',
    });
    return schedule;
  });
}

export async function listTraceEvents(transactionId: string, user: AuthUser, cursor?: string) {
  const tx = await getTransactionRow(transactionId);
  await assertTransactionAccess(tx, user);
  const decoded = decodeCursor(cursor);
  const params: unknown[] = [transactionId, PAGE_SIZE + 1];
  let sql = 'SELECT * FROM trace_events WHERE transaction_id = $1';
  let paramIdx = 3;
  if (decoded) {
    sql += ` AND (timestamp, id) > ($${paramIdx}::timestamptz, $${paramIdx + 1}::uuid)`;
    params.push(decoded.createdAt, decoded.id);
    paramIdx += 2;
  }
  sql += ` ORDER BY timestamp ASC, id ASC LIMIT $2`;
  const result = await query<TraceEventRow>(sql, params);
  const rows = result.rows.slice(0, PAGE_SIZE);
  const items = await Promise.all(rows.map(async (row) => mapTraceEvent(row, await getTraceEventPhotoUrls(row.id))));
  return {
    items,
    next_cursor: result.rows.length > PAGE_SIZE
      ? encodeCursor(rows[rows.length - 1].timestamp, rows[rows.length - 1].id)
      : null,
  };
}

export async function listPayments(transactionId: string, user: AuthUser, cursor?: string) {
  const tx = await getTransactionRow(transactionId);
  await assertTransactionAccess(tx, user);
  const decoded = decodeCursor(cursor);
  const params: unknown[] = [transactionId, PAGE_SIZE + 1];
  let sql = 'SELECT * FROM payments WHERE transaction_id = $1';
  let paramIdx = 3;
  if (decoded) {
    sql += ` AND (recorded_at, id) < ($${paramIdx}::timestamptz, $${paramIdx + 1}::uuid)`;
    params.push(decoded.createdAt, decoded.id);
    paramIdx += 2;
  }
  sql += ` ORDER BY recorded_at DESC, id DESC LIMIT $2`;
  const result = await query<PaymentRow>(sql, params);
  const rows = result.rows.slice(0, PAGE_SIZE);
  return {
    items: rows.map(mapPayment),
    next_cursor: result.rows.length > PAGE_SIZE
      ? encodeCursor(rows[rows.length - 1].recorded_at, rows[rows.length - 1].id)
      : null,
  };
}

export async function recordVerifiedHandover(transactionId: string, user: AuthUser, input: HandoverInput) {
  if (user.role !== 'recycler' || !user.recyclerId) {
    throw forbidden('Recycler role required');
  }

  const result = await withTransaction(async (client) => {
    const txResult = await client.query<TransactionRow>(
      'SELECT * FROM transactions WHERE id = $1 FOR UPDATE',
      [transactionId],
    );
    const tx = txResult.rows[0];
    if (!tx) {
      throw notFound('Transaction not found');
    }
    if (tx.recycler_id !== user.recyclerId) {
      throw forbidden('Recycler not authorized for this transaction');
    }
    const replay = await client.query<TraceEventRow>(
      `SELECT * FROM trace_events WHERE transaction_id = $1 AND client_uuid = $2`,
      [transactionId, input.client_uuid],
    );
    if (replay.rows[0]) {
      if (replay.rows[0].event_type !== 'handover_photo') {
        throw conflict('Idempotency key already used for another event');
      }
      return { event: replay.rows[0], replayed: true };
    }
    if (tx.status !== 'pickup_scheduled') {
      throw conflict('Handover requires a pickup_scheduled transaction', 'INVALID_STATE_TRANSITION');
    }

    const lotResult = await client.query<LotWeightRow>(
      'SELECT estimated_weight_kg FROM lots WHERE id = $1 FOR UPDATE',
      [tx.lot_id],
    );
    if (!lotResult.rows[0]) {
      throw notFound('Lot not found');
    }
    const handoverCode = generateHandoverCode();
    const recordHash = generateRecordHash({
      transaction_id: transactionId,
      verified_weight_kg: input.verified_weight_kg,
      timestamp: input.timestamp,
      notes: input.notes ?? null,
    });
    const eventResult = await client.query<TraceEventRow>(
      `INSERT INTO trace_events (
        client_uuid, transaction_id, lot_id, event_type, gps, timestamp,
        actor_user_id, handover_reference_code, record_hash, recorded_by
      ) VALUES ($1,$2,$3,'handover_photo',$4,$5,$6,$7,$8,'recycler') RETURNING *`,
      [input.client_uuid, transactionId, tx.lot_id, input.gps ? JSON.stringify(input.gps) : null,
        input.timestamp, user.id, handoverCode, recordHash],
    );
    const finalTotal = multiplyMoney(tx.agreed_rate_inr_per_kg, input.verified_weight_kg);
    await client.query(
      `UPDATE lots SET verified_weight_kg = $1, weight_status = 'verified' WHERE id = $2`,
      [input.verified_weight_kg.toFixed(2), tx.lot_id],
    );
    await client.query(
      `UPDATE transactions SET final_weight_kg = $1, final_total_inr = $2, status = 'handed_over', updated_at = NOW() WHERE id = $3`,
      [input.verified_weight_kg.toFixed(2), finalTotal, transactionId],
    );
    return { event: eventResult.rows[0], replayed: false };
  });

  if (!result.replayed) {
    await insertTraceEventPhotos(result.event.id, input.photo_urls);
    emitToUser((await getTransactionRow(transactionId)).collector_id, 'transaction:status_changed', {
      transaction_id: transactionId,
      status: 'handed_over',
    });
    emitToRecycler(user.recyclerId, 'transaction:status_changed', {
      transaction_id: transactionId,
      status: 'handed_over',
    });
  }
  return mapTraceEvent(result.event, result.replayed ? await getTraceEventPhotoUrls(result.event.id) : input.photo_urls);
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

  if (input.event_type === 'pickup_scheduled') {
    throw badRequest('Use the pickup scheduling endpoint to record pickup_scheduled events');
  }
  if (input.event_type === 'handover_photo') {
    throw badRequest('Use the verified handover endpoint to record handover_photo events');
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
      null,
      null,
      recordedBy,
    ],
  );

  await insertTraceEventPhotos(result.rows[0].id, input.photo_urls);

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
  if (tx.status !== 'handed_over') {
    throw conflict('Transaction is not in handed_over state', 'INVALID_STATE_TRANSITION');
  }

  const existingConfirm = await query<TraceEventRow>(
    'SELECT id FROM trace_events WHERE transaction_id = $1 AND event_type = $2',
    [tx.id, 'handover_confirmed']
  );
  if (existingConfirm.rows.length > 0) {
    throw conflict('Handover already confirmed');
  }

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

  if (tx.status === 'paid' || tx.status === 'recycled') {
    throw conflict('Transaction already paid');
  }

  if (tx.status !== 'confirmed') {
    throw conflict('Payment requires a confirmed transaction');
  }

  if (tx.final_total_inr === null) {
    throw conflict('Transaction total not calculated');
  }
  const paymentAmount = parseMoney(input.amount_inr);
  const totalAmount = parseMoney(tx.final_total_inr);
  if (!moneyEquals(paymentAmount.toFixed(2), totalAmount.toFixed(2))) {
    throw badRequest('Payment amount must equal transaction final total');
  }

  if (input.method !== 'cash' && !input.reference) {
    throw badRequest('reference is required for non-cash payments');
  }

  if (input.client_uuid) {
    const replay = await query<PaymentRow>(
      'SELECT * FROM payments WHERE client_uuid = $1 AND transaction_id = $2',
      [input.client_uuid, transactionId],
    );
    if (replay.rows[0]) {
      return mapPayment(replay.rows[0]);
    }
  }

  const result = await query<PaymentRow>(
    `INSERT INTO payments (
      transaction_id, client_uuid, amount_inr, method, status, reference,
      confirmed_by_collector, confirmed_by_recycler
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    RETURNING *`,
    [
      transactionId,
      input.client_uuid ?? null,
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
