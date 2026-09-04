import { query } from '../lib/db.js';
import { env } from '../config/env.js';
import { mapPrice } from '../mappers/index.js';
import type { PriceRow } from '../types/contracts.js';

export async function getCurrentPrices(materialCategory?: string) {
  const params: unknown[] = [env.DEFAULT_DEMO_REGION];
  let sql = `
    SELECT DISTINCT ON (material_category, COALESCE(material_subcategory, ''))
      *
    FROM prices
    WHERE location = $1
  `;

  if (materialCategory) {
    params.push(materialCategory);
    sql += ` AND material_category = $2`;
  }

  sql += ` ORDER BY material_category, COALESCE(material_subcategory, ''), date DESC`;

  const result = await query<PriceRow>(sql, params);
  return result.rows.map(mapPrice);
}

export async function getPriceHistory(materialCategory?: string) {
  const params: unknown[] = [env.DEFAULT_DEMO_REGION];
  let sql = `SELECT * FROM prices WHERE location = $1`;
  if (materialCategory) {
    params.push(materialCategory);
    sql += ` AND material_category = $2`;
  }
  sql += ` ORDER BY date DESC LIMIT 100`;

  const result = await query<PriceRow>(sql, params);
  return result.rows.map(mapPrice);
}

export async function getReferenceRate(
  materialCategory: string,
  materialSubcategory?: string,
): Promise<{ rate: string; source: string } | null> {
  const params: unknown[] = [env.DEFAULT_DEMO_REGION, materialCategory];
  let sql = `
    SELECT buying_rate_inr_per_kg, source FROM prices
    WHERE location = $1 AND material_category = $2
  `;
  if (materialSubcategory) {
    params.push(materialSubcategory);
    sql += ` AND material_subcategory = $3`;
  }
  sql += ` ORDER BY date DESC LIMIT 1`;

  const result = await query<{ buying_rate_inr_per_kg: string; source: string }>(sql, params);
  const row = result.rows[0];
  if (!row) {
    return null;
  }
  return { rate: row.buying_rate_inr_per_kg, source: row.source };
}
