import { query } from '../lib/db.js';
import { env } from '../config/env.js';
import { parseStoragePath } from '../services/storage.service.js';

export async function getLotImageUrls(lotId: string): Promise<string[]> {
  const result = await query<{ storage_bucket: string; storage_path: string }>(
    'SELECT storage_bucket, storage_path FROM lot_images WHERE lot_id = $1 ORDER BY created_at',
    [lotId],
  );
  return result.rows.map((r) => `${r.storage_bucket}/${r.storage_path}`);
}

export async function insertLotImages(lotId: string, imageUrls: string[]): Promise<void> {
  for (const fullPath of imageUrls) {
    const { bucket, path } = parseStoragePath(fullPath);
    await query(
      `INSERT INTO lot_images (lot_id, storage_bucket, storage_path)
       VALUES ($1, $2, $3)
       ON CONFLICT (lot_id, storage_bucket, storage_path) DO NOTHING`,
      [lotId, bucket || env.STORAGE_BUCKET_LOTS, path || fullPath],
    );
  }
}

export async function getTraceEventPhotoUrls(traceEventId: string): Promise<string[]> {
  const result = await query<{ storage_bucket: string; storage_path: string }>(
    'SELECT storage_bucket, storage_path FROM trace_event_photos WHERE trace_event_id = $1',
    [traceEventId],
  );
  return result.rows.map((r) => `${r.storage_bucket}/${r.storage_path}`);
}

export async function insertTraceEventPhotos(traceEventId: string, photoUrls: string[]): Promise<void> {
  for (const fullPath of photoUrls) {
    const { bucket, path } = parseStoragePath(fullPath);
    await query(
      `INSERT INTO trace_event_photos (trace_event_id, storage_bucket, storage_path)
       VALUES ($1, $2, $3)
       ON CONFLICT (trace_event_id, storage_bucket, storage_path) DO NOTHING`,
      [traceEventId, bucket || env.STORAGE_BUCKET_TRACE, path || fullPath],
    );
  }
}

export function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(`${createdAt.toISOString()}|${id}`).toString('base64url');
}

export function decodeCursor(cursor: string | undefined): { createdAt: string; id: string } | null {
  if (!cursor) {
    return null;
  }
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    const [createdAt, id] = decoded.split('|');
    if (!createdAt || !id) {
      return null;
    }
    return { createdAt, id };
  } catch {
    return null;
  }
}

export const PAGE_SIZE = 20;
