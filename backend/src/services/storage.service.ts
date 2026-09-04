import { env } from '../config/env.js';
import { getSupabaseAdmin } from '../lib/supabase.js';
import { useMockAuth } from '../config/env.js';
import { badRequest } from '../errors/AppError.js';

export async function createSignedUploadUrl(
  fileName: string,
  contentType: string,
  bucket = env.STORAGE_BUCKET_LOTS,
): Promise<{ upload_url: string; storage_path: string }> {
  if (!fileName || !contentType) {
    throw badRequest('file_name and content_type are required');
  }

  const storagePath = `${Date.now()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

  if (useMockAuth()) {
    return {
      upload_url: `mock://upload/${bucket}/${storagePath}?content_type=${encodeURIComponent(contentType)}`,
      storage_path: `${bucket}/${storagePath}`,
    };
  }

  const { data, error } = await getSupabaseAdmin()
    .storage.from(bucket)
    .createSignedUploadUrl(storagePath);

  if (error || !data) {
    throw badRequest(`Failed to create upload URL: ${error?.message ?? 'unknown error'}`);
  }

  return {
    upload_url: data.signedUrl,
    storage_path: `${bucket}/${storagePath}`,
  };
}

export async function createSignedReadUrl(
  storagePath: string,
): Promise<{ read_url: string; expires_in: number }> {
  if (!storagePath) {
    throw badRequest('storage_path is required');
  }

  const [bucket, ...rest] = storagePath.split('/');
  const path = rest.join('/');

  if (useMockAuth()) {
    return {
      read_url: `mock://read/${storagePath}`,
      expires_in: env.SIGNED_URL_EXPIRY_SECONDS,
    };
  }

  const { data, error } = await getSupabaseAdmin()
    .storage.from(bucket)
    .createSignedUrl(path, env.SIGNED_URL_EXPIRY_SECONDS);

  if (error || !data) {
    throw badRequest(`Failed to create read URL: ${error?.message ?? 'unknown error'}`);
  }

  return {
    read_url: data.signedUrl,
    expires_in: env.SIGNED_URL_EXPIRY_SECONDS,
  };
}

export function parseStoragePath(fullPath: string): { bucket: string; path: string } {
  const [bucket, ...rest] = fullPath.split('/');
  return { bucket, path: rest.join('/') };
}
