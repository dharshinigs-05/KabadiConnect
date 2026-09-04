import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from '../config/env.js';

let supabaseAdmin: SupabaseClient | null = null;
let supabaseAuth: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase admin credentials are not configured');
  }
  if (!supabaseAdmin) {
    supabaseAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return supabaseAdmin;
}

export function getSupabaseAuth(): SupabaseClient {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    throw new Error('Supabase auth credentials are not configured');
  }
  if (!supabaseAuth) {
    supabaseAuth = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return supabaseAuth;
}

export async function verifyAccessToken(token: string): Promise<{ userId: string }> {
  const { data, error } = await getSupabaseAdmin().auth.getUser(token);
  if (error || !data.user) {
    throw error ?? new Error('Invalid token');
  }
  return { userId: data.user.id };
}
