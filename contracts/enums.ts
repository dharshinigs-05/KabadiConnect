/**
 * KabadiConnect v2 frozen contract enums.
 * Import these types; do not duplicate their values in application code.
 */
export const LOT_STATUSES = ['open', 'offer_accepted', 'in_transaction', 'closed', 'cancelled'] as const;
export type LotStatus = (typeof LOT_STATUSES)[number];

export const LOT_CONDITIONS = ['good', 'damaged', 'mixed'] as const;
export type LotCondition = (typeof LOT_CONDITIONS)[number];

export const LOT_SOURCE_TYPES = ['household', 'aggregator', 'other'] as const;
export type LotSourceType = (typeof LOT_SOURCE_TYPES)[number];

export const WEIGHT_STATUSES = ['estimated', 'verified', 'pending'] as const;
export type WeightStatus = (typeof WEIGHT_STATUSES)[number];

export const OFFER_STATUSES = ['pending', 'accepted', 'rejected', 'expired'] as const;
export type OfferStatus = (typeof OFFER_STATUSES)[number];

export const TRANSACTION_STATUSES = ['accepted', 'pickup_scheduled', 'handed_over', 'confirmed', 'paid', 'recycled', 'cancelled'] as const;
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];

export const PAYMENT_STATUSES = ['pending', 'cash_collected', 'upi_paid', 'bank_transfer'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_METHODS = ['cash', 'upi', 'bank_transfer'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const RECYCLER_AUTH_STATUSES = ['authorized', 'pending', 'unauthorized'] as const;
export type RecyclerAuthStatus = (typeof RECYCLER_AUTH_STATUSES)[number];

export const RISK_BANDS = ['allow', 'monitor', 'verify', 'block'] as const;
export type RiskBand = (typeof RISK_BANDS)[number];

export const MATERIAL_CATEGORIES = ['crt', 'lcd_panel', 'pcb', 'cable', 'battery', 'motor', 'magnet_assembly', 'mixed_plastic', 'other'] as const;
export type MaterialCategory = (typeof MATERIAL_CATEGORIES)[number];

export const USER_ROLES = ['collector', 'recycler', 'admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const TRACE_EVENT_TYPES = ['lot_created', 'offer_accepted', 'pickup_started', 'handover_photo', 'handover_confirmed', 'payment_recorded', 'recycled_confirmed'] as const;
export type TraceEventType = (typeof TRACE_EVENT_TYPES)[number];

export const LANGUAGES = ['hi', 'mr', 'en'] as const;
export type Language = (typeof LANGUAGES)[number];

export const CREATED_BY_ACTORS = ['collector', 'field_facilitator'] as const;
export type CreatedByActor = (typeof CREATED_BY_ACTORS)[number];

export const TRACE_RECORDED_BY = ['collector', 'recycler'] as const;
export type TraceRecordedBy = (typeof TRACE_RECORDED_BY)[number];
