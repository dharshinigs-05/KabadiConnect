export type {
  LotStatus,
  LotCondition,
  LotSourceType,
  WeightStatus,
  OfferStatus,
  TransactionStatus,
  PaymentStatus,
  PaymentMethod,
  RecyclerAuthStatus,
  RiskBand,
  MaterialCategory,
  UserRole,
  TraceEventType,
  Language,
  CreatedByActor,
  TraceRecordedBy,
} from '../../../contracts/enums.js';

export interface LotRow {
  id: string;
  client_uuid: string;
  collector_id: string;
  material_category: string;
  material_subcategory: string | null;
  description: string | null;
  estimated_weight_kg: string;
  verified_weight_kg: string | null;
  weight_status: string;
  condition: string;
  source_type: string;
  estimated_value_total_inr: string;
  location: { lat: number; lng: number };
  status: string;
  created_by_actor: string;
  created_at: Date;
  synced_at: Date | null;
}

export interface OfferRow {
  id: string;
  lot_id: string;
  recycler_id: string;
  offered_rate_inr_per_kg: string;
  offered_total_inr: string;
  pickup_available: boolean;
  status: string;
  created_at: Date;
  expires_at: Date;
}

export interface TransactionRow {
  id: string;
  client_uuid: string;
  lot_id: string;
  offer_id: string;
  collector_id: string;
  recycler_id: string;
  agreed_rate_inr_per_kg: string;
  final_weight_kg: string | null;
  final_total_inr: string | null;
  status: string;
  created_at: Date;
  updated_at: Date;
}

export interface PaymentRow {
  id: string;
  transaction_id: string;
  amount_inr: string;
  method: string;
  status: string;
  reference: string | null;
  confirmed_by_collector: boolean;
  confirmed_by_recycler: boolean;
  recorded_at: Date;
}

export interface TraceEventRow {
  id: string;
  client_uuid: string;
  transaction_id: string;
  lot_id: string;
  event_type: string;
  gps: { lat: number; lng: number } | null;
  timestamp: Date;
  actor_user_id: string;
  handover_reference_code: string | null;
  record_hash: string | null;
  recorded_by: string;
}

export interface RecyclerRow {
  id: string;
  name: string;
  facility_location: { lat: number; lng: number; address: string } | null;
  materials_accepted: string[];
  authorization_id: string | null;
  authorization_status: string;
  contact_phone: string | null;
  typical_rates_inr_per_kg: Record<string, string>;
  pickup_available: boolean;
  service_area_radius_km: string;
}

export interface PriceRow {
  id: string;
  material_category: string;
  material_subcategory: string | null;
  location: string;
  date: string;
  buying_rate_inr_per_kg: string;
  market_range_low_inr_per_kg: string;
  market_range_high_inr_per_kg: string;
  recycler_id: string | null;
  source: string;
}

export interface SafetyGuideRow {
  id: string;
  title_hi: string;
  title_mr: string;
  title_en: string;
  icon_asset_key: string | null;
  audio_asset_key: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
}
