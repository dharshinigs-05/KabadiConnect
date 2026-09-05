import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PendingLot } from './offline';

const base = process.env.EXPO_PUBLIC_API_BASE_URL || 'http://10.0.2.2:4000/v1';
const sessionKey = 'kc-session';
export type Session = { access_token: string; refresh_token: string; user_id: string; role: 'collector' | 'recycler' | 'admin'; is_new_user: boolean };
export type Transaction = { id: string; client_uuid: string; lot_id: string; offer_id: string; collector_id: string; recycler_id: string; agreed_rate_inr_per_kg: string; final_weight_kg: number | null; final_total_inr: string | null; status: string; created_at: string; updated_at: string };
export type Offer = { id: string; lot_id: string; recycler_id: string; offered_total_inr: string; offered_rate_inr_per_kg: string; pickup_available: boolean; status: 'pending' | 'accepted' | 'rejected' | 'expired'; created_at: string; expires_at: string };
export type PickupSchedule = { id: string; transaction_id: string; client_uuid: string; scheduled_date: string; scheduled_time_window: string; pickup_location: { lat: number; lng: number; label: string }; collector_note: string | null; recycler_note: string | null; status: 'scheduled' | 'completed' | 'cancelled'; created_at: string; updated_at: string };
export type TraceEvent = { id: string; transaction_id: string; lot_id: string; event_type: string; photo_urls: string[]; gps: { lat: number; lng: number } | null; timestamp: string; actor_user_id: string; handover_reference_code: string | null; record_hash: string | null; recorded_by: 'collector' | 'recycler' };
export type Payment = { id: string; transaction_id: string; amount_inr: string; method: 'cash' | 'upi' | 'bank_transfer'; status: 'pending' | 'cash_collected' | 'upi_paid' | 'bank_transfer'; reference: string | null; confirmed_by_collector: boolean; confirmed_by_recycler: boolean; recorded_at: string };
export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
export const getSession = () => AsyncStorage.getItem(sessionKey).then(value => value ? JSON.parse(value) as Session : null);
export const saveSession = (value: Session | null) => value ? AsyncStorage.setItem(sessionKey, JSON.stringify(value)) : AsyncStorage.removeItem(sessionKey);
async function request<T>(path: string, options: RequestInit = {}, authenticated = true): Promise<T> {
  const token = authenticated ? (await getSession())?.access_token : undefined;
  try {
    const response = await fetch(`${base}${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers } });
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { error?: { message?: string } } | null;
      if (response.status === 401 && authenticated) await saveSession(null);
      throw new ApiError(response.status, response.status === 401 ? 'Your session has expired. Please sign in again.' : body?.error?.message || 'Please try again.');
    }
    return response.json() as Promise<T>;
  } catch (error) { if (error instanceof ApiError) throw error; throw new ApiError(0, 'No internet connection. Your lot is safe on this device.'); }
}
async function uploadImage(uri: string): Promise<string> {
  const fileName = uri.split('/').pop() || 'lot-photo.jpg';
  const target = await request<{ upload_url: string; storage_path: string }>('/uploads/signed-upload-url', { method: 'POST', body: JSON.stringify({ file_name: fileName, content_type: 'image/jpeg' }) });
  try {
    const image = await fetch(uri);
    const blob = await image.blob();
    const upload = await fetch(target.upload_url, { method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, body: blob });
    if (!upload.ok) throw new Error('Photo upload failed.');
  } catch {
    throw new ApiError(0, 'Photo upload failed. Your lot is still saved on this device.');
  }
  return target.storage_path;
}
export type SyncResult = { client_uuid: string; server_id: string; status: string };
export const api = {
  requestOtp: (phone_number: string) => request<{ success: boolean }>('/auth/otp/request', { method: 'POST', body: JSON.stringify({ phone_number }) }, false),
  verifyOtp: (phone_number: string, otp: string) => request<Session>('/auth/otp/verify', { method: 'POST', body: JSON.stringify({ phone_number, otp }) }, false),
  createLot: (lot: Omit<PendingLot, 'image_uris' | 'created_at'> & { image_urls: string[] }) => request('/lots', { method: 'POST', body: JSON.stringify({ ...lot, weight_status: 'estimated', source_type: 'household', created_by_actor: 'collector' }) }),
  syncLots: async (items: PendingLot[]): Promise<{ results: SyncResult[]; failed: string[] }> => {
    const results: SyncResult[] = [];
    const failed: string[] = [];
    for (const item of items) {
      try {
        const image_urls = await Promise.all(item.image_uris.map(uploadImage));
        const result = await request<{ results: SyncResult[] }>('/sync/lots', { method: 'POST', body: JSON.stringify({ items: [{ ...item, image_uris: undefined, image_urls, created_at: undefined, weight_status: 'estimated', source_type: 'household', created_by_actor: 'collector' }] }) });
        results.push(...result.results);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) throw error;
        failed.push(item.client_uuid);
      }
    }
    return { results, failed };
  },
  lots: () => request<{ items: { id: string; client_uuid: string; material_category: string; estimated_weight_kg: number; verified_weight_kg: number | null; estimated_value_total_inr: string | null; status: string; created_at: string }[]; next_cursor: string | null }>('/lots'),
  offers: (lotId: string) => request<{ items: Offer[]; next_cursor: string | null }>(`/lots/${lotId}/offers`),
  acceptOffer: (id: string) => request<Transaction>(`/offers/${id}/accept`, { method: 'PATCH' }),
  transactions: () => request<{ items: Transaction[]; next_cursor: string | null }>('/transactions'),
  schedulePickup: (id: string, body: { client_uuid: string; scheduled_date: string; scheduled_time_window: string; pickup_location: { lat: number; lng: number; label: string }; collector_note?: string; recycler_note?: string }) => request<PickupSchedule>(`/transactions/${id}/pickup`, { method: 'PUT', body: JSON.stringify(body) }),
  traceEvents: (id: string, cursor?: string) => request<{ items: TraceEvent[]; next_cursor: string | null }>(`/transactions/${id}/trace-events${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`),
  payments: (id: string, cursor?: string) => request<{ items: Payment[]; next_cursor: string | null }>(`/transactions/${id}/payments${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`),
  earnings: () => request<{ total_earned_inr: string }>('/collectors/me/earnings'),
  prices: (material?: string) => request<{ items: { id: string; material_category: string; buying_rate_inr_per_kg: string; market_range_low_inr_per_kg: string; market_range_high_inr_per_kg: string; date: string; location: string; source: string }[]; next_cursor: string | null }>(`/prices${material ? `?material_category=${encodeURIComponent(material)}` : ''}`),
  safetyGuides: (language: 'en' | 'hi' | 'mr') => request<{ items: { id: string; title_en: string; title_hi: string; title_mr: string; icon_key: string; audio_key: string; image_url: string }[]; next_cursor: string | null }>(`/safety-guides?language=${language}`),
};
