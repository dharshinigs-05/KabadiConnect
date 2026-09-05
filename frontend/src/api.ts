import type { Lot, LotDraft, Offer, Price, Session, Transaction } from './types';
const base = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/v1';
const sessionKey = 'kc-session';
export const session = () => JSON.parse(localStorage.getItem(sessionKey) || 'null') as Session | null;
export const saveSession = (value: Session | null) => value ? localStorage.setItem(sessionKey, JSON.stringify(value)) : localStorage.removeItem(sessionKey);
export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
async function request<T>(path: string, options: RequestInit = {}, auth = true): Promise<T> {
  const token = session()?.access_token;
  const response = await fetch(`${base}${path}`, { ...options, headers: { ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...(auth && token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers } });
  if (!response.ok) { const body = await response.json().catch(() => null) as { error?: { message?: string } } | null; throw new ApiError(response.status, body?.error?.message || 'Unable to complete this request.'); }
  return response.json() as Promise<T>;
}
export const api = {
  requestOtp: (phone_number: string) => request<{ success: boolean }>('/auth/otp/request', { method: 'POST', body: JSON.stringify({ phone_number }) }, false),
  verifyOtp: (phone_number: string, otp: string) => request<Session>('/auth/otp/verify', { method: 'POST', body: JSON.stringify({ phone_number, otp }) }, false),
  lots: () => request<{ items: Lot[]; next_cursor: string | null }>('/lots'),
  openLots: () => request<{ items: Lot[]; next_cursor: string | null }>('/lots/open'),
  prices: () => request<{ items: Price[]; next_cursor: string | null }>('/prices'),
  earnings: () => request<{ total_earned_inr: string }>('/collectors/me/earnings'),
  createLot: (lot: LotDraft) => request<Lot>('/lots', { method: 'POST', body: JSON.stringify(lot) }),
  syncLots: (items: LotDraft[]) => request<{ results: { client_uuid: string; server_id: string; status: string }[] }>('/sync/lots', { method: 'POST', body: JSON.stringify({ items }) }),
  offers: (lotId: string) => request<{ items: Offer[]; next_cursor: string | null }>(`/lots/${lotId}/offers`),
  makeOffer: (lotId: string, body: Pick<Offer, 'offered_rate_inr_per_kg' | 'offered_total_inr' | 'pickup_available' | 'expires_at'>) => request<Offer>(`/lots/${lotId}/offers`, { method: 'POST', body: JSON.stringify(body) }),
  acceptOffer: (id: string) => request<Transaction>(`/offers/${id}/accept`, { method: 'PATCH' }),
  transactions: () => request<{ items: Transaction[]; next_cursor: string | null }>('/transactions'),
  transition: (id: string, status: Transaction['status']) => request<Transaction>(`/transactions/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  upload: async (file: File) => { const target = await request<{ upload_url: string; storage_path: string }>('/uploads/signed-upload-url', { method: 'POST', body: JSON.stringify({ file_name: file.name, content_type: file.type }) }); const put = await fetch(target.upload_url, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file }); if (!put.ok) throw new Error('Photo upload failed. Please retry.'); return target.storage_path; },
};
