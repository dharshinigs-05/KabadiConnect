import { normalizeDbMoney } from '../lib/money.js';
import type {
  LotRow,
  OfferRow,
  TransactionRow,
  PaymentRow,
  TraceEventRow,
  RecyclerRow,
  PriceRow,
  SafetyGuideRow,
  PickupScheduleRow,
} from '../types/contracts.js';

function toIso(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return new Date(value).toISOString();
}

export function mapLot(row: LotRow, imageUrls: string[] = []) {
  return {
    id: row.id,
    client_uuid: row.client_uuid,
    collector_id: row.collector_id,
    material_category: row.material_category,
    material_subcategory: row.material_subcategory ?? undefined,
    description: row.description ?? undefined,
    image_urls: imageUrls,
    estimated_weight_kg: Number(row.estimated_weight_kg),
    verified_weight_kg: row.verified_weight_kg !== null ? Number(row.verified_weight_kg) : null,
    weight_status: row.weight_status,
    condition: row.condition,
    source_type: row.source_type,
    estimated_value_total_inr: normalizeDbMoney(row.estimated_value_total_inr),
    location: row.location,
    status: row.status,
    created_by_actor: row.created_by_actor,
    created_at: toIso(row.created_at)!,
    synced_at: toIso(row.synced_at),
  };
}

export function mapOffer(row: OfferRow) {
  return {
    id: row.id,
    lot_id: row.lot_id,
    recycler_id: row.recycler_id,
    offered_rate_inr_per_kg: normalizeDbMoney(row.offered_rate_inr_per_kg),
    offered_total_inr: normalizeDbMoney(row.offered_total_inr),
    pickup_available: row.pickup_available,
    status: row.status,
    created_at: toIso(row.created_at)!,
    expires_at: toIso(row.expires_at)!,
  };
}

export function mapTransaction(row: TransactionRow) {
  return {
    id: row.id,
    client_uuid: row.client_uuid,
    lot_id: row.lot_id,
    offer_id: row.offer_id,
    collector_id: row.collector_id,
    recycler_id: row.recycler_id,
    agreed_rate_inr_per_kg: normalizeDbMoney(row.agreed_rate_inr_per_kg),
    final_weight_kg: row.final_weight_kg !== null ? Number(row.final_weight_kg) : null,
    final_total_inr: row.final_total_inr !== null ? normalizeDbMoney(row.final_total_inr) : null,
    status: row.status,
    created_at: toIso(row.created_at)!,
    updated_at: toIso(row.updated_at)!,
  };
}

export function mapPayment(row: PaymentRow) {
  return {
    id: row.id,
    transaction_id: row.transaction_id,
    amount_inr: normalizeDbMoney(row.amount_inr),
    method: row.method,
    status: row.status,
    reference: row.reference,
    confirmed_by_collector: row.confirmed_by_collector,
    confirmed_by_recycler: row.confirmed_by_recycler,
    recorded_at: toIso(row.recorded_at)!,
  };
}

export function mapPickupSchedule(row: PickupScheduleRow) {
  return {
    id: row.id,
    transaction_id: row.transaction_id,
    client_uuid: row.client_uuid,
    scheduled_date: row.scheduled_date,
    scheduled_time_window: row.scheduled_time_window,
    pickup_location: row.pickup_location,
    collector_note: row.collector_note,
    recycler_note: row.recycler_note,
    status: row.status,
    created_at: toIso(row.created_at)!,
    updated_at: toIso(row.updated_at)!,
  };
}

export function mapTraceEvent(row: TraceEventRow, photoUrls: string[] = []) {
  return {
    id: row.id,
    transaction_id: row.transaction_id,
    lot_id: row.lot_id,
    event_type: row.event_type,
    photo_urls: photoUrls,
    gps: row.gps,
    timestamp: toIso(row.timestamp)!,
    actor_user_id: row.actor_user_id,
    handover_reference_code: row.handover_reference_code,
    record_hash: row.record_hash,
    recorded_by: row.recorded_by,
  };
}

export function mapRecycler(row: RecyclerRow) {
  const rates: Record<string, string> = {};
  for (const [key, value] of Object.entries(row.typical_rates_inr_per_kg ?? {})) {
    rates[key] = normalizeDbMoney(value);
  }

  return {
    id: row.id,
    name: row.name,
    facility_location: row.facility_location,
    materials_accepted: row.materials_accepted,
    authorization_id: row.authorization_id ?? '',
    authorization_status: row.authorization_status,
    contact_phone: row.contact_phone ?? '',
    typical_rates_inr_per_kg: rates,
    pickup_available: row.pickup_available,
    service_area_radius_km: Number(row.service_area_radius_km),
  };
}

export function mapPrice(row: PriceRow) {
  return {
    id: row.id,
    material_category: row.material_category,
    material_subcategory: row.material_subcategory ?? '',
    location: row.location,
    date: row.date,
    buying_rate_inr_per_kg: normalizeDbMoney(row.buying_rate_inr_per_kg),
    market_range_low_inr_per_kg: normalizeDbMoney(row.market_range_low_inr_per_kg),
    market_range_high_inr_per_kg: normalizeDbMoney(row.market_range_high_inr_per_kg),
    recycler_id: row.recycler_id,
    source: row.source,
  };
}

export function mapSafetyGuide(row: SafetyGuideRow) {
  return {
    id: row.id,
    title_hi: row.title_hi,
    title_mr: row.title_mr,
    title_en: row.title_en,
    icon_key: row.icon_asset_key ?? '',
    audio_key: row.audio_asset_key ?? '',
    image_url: row.storage_path ?? '',
  };
}
