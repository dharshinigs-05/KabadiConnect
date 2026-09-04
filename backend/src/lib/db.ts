import pg from 'pg';
import { env } from '../config/env.js';
import { logger } from './logger.js';

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    if (!env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required');
    }
    pool = new Pool({
      connectionString: env.DATABASE_URL,
      max: 20,
      idleTimeoutMillis: 30_000,
    });
    pool.on('error', (err) => {
      logger.error('Unexpected database pool error', { error: err.message });
    });
  }
  return pool;
}

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<pg.QueryResult<T>> {
  return getPool().query<T>(text, params);
}

export async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function checkDatabaseConnection(): Promise<boolean> {
  if (!env.DATABASE_URL) {
    return false;
  }
  try {
    await query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

/** Test-only hook to inject a mock pool */
export function setPoolForTests(testPool: pg.Pool | null): void {
  pool = testPool;
}
