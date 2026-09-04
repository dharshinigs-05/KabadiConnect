import { z } from 'zod';
import {
  MATERIAL_CATEGORIES,
  LOT_CONDITIONS,
  LOT_SOURCE_TYPES,
  WEIGHT_STATUSES,
  CREATED_BY_ACTORS,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  TRANSACTION_STATUSES,
  TRACE_EVENT_TYPES,
  LANGUAGES,
} from '../../../contracts/enums.js';

const money = z.string().regex(/^-?(?:0|[1-9]\d*)\.\d{2}$/);
const uuid = z.string().uuid();
const location = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export const otpRequestSchema = z.object({
  phone_number: z.string().min(8),
});

export const otpVerifySchema = z.object({
  phone_number: z.string().min(8),
  otp: z.string().min(4),
});

export const userProfileUpdateSchema = z.object({
  preferred_language: z.enum(LANGUAGES).optional(),
  operating_location: z
    .object({
      lat: z.number(),
      lng: z.number(),
      label: z.string(),
    })
    .optional(),
});

export const signedUploadSchema = z.object({
  file_name: z.string().min(1),
  content_type: z.string().min(1),
});

export const lotCreateSchema = z.object({
  client_uuid: uuid,
  material_category: z.enum(MATERIAL_CATEGORIES),
  material_subcategory: z.string().optional(),
  description: z.string().optional(),
  image_urls: z.array(z.string().min(1)).min(1),
  estimated_weight_kg: z.number().min(0),
  weight_status: z.enum(WEIGHT_STATUSES),
  condition: z.enum(LOT_CONDITIONS),
  source_type: z.enum(LOT_SOURCE_TYPES),
  location,
  created_by_actor: z.enum(CREATED_BY_ACTORS),
});

export const syncLotsSchema = z.object({
  items: z.array(lotCreateSchema).min(1),
});

export const offerCreateSchema = z.object({
  offered_rate_inr_per_kg: money,
  offered_total_inr: money,
  pickup_available: z.boolean(),
  expires_at: z.string().datetime(),
});

export const transactionStatusSchema = z.object({
  status: z.enum(TRANSACTION_STATUSES),
});

export const traceEventCreateSchema = z.object({
  event_type: z.enum(TRACE_EVENT_TYPES),
  photo_urls: z.array(z.string().min(1)),
  gps: location,
  timestamp: z.string().datetime(),
});

export const handoverConfirmSchema = z.object({
  handover_reference_code: z.string().min(1),
});

export const paymentCreateSchema = z.object({
  amount_inr: money,
  method: z.enum(PAYMENT_METHODS),
  status: z.enum(PAYMENT_STATUSES),
  reference: z.string().nullable().optional(),
  confirmed_by_collector: z.boolean(),
  confirmed_by_recycler: z.boolean(),
});

import { badRequest } from '../errors/AppError.js';

export function parseBody<T>(schema: z.ZodSchema<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    const message = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw badRequest(message);
  }
  return result.data;
}
