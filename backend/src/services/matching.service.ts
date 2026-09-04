import { query } from '../lib/db.js';
import { env } from '../config/env.js';
import { mapRecycler } from '../mappers/index.js';
import { forbidden } from '../errors/AppError.js';
import type { LotRow, RecyclerRow } from '../types/contracts.js';

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function normalizeScore(value: number, min: number, max: number): number {
  if (max <= min) {
    return 1;
  }
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

export async function matchRecyclersForLot(lotId: string, user: { role: string; id: string }) {
  const lotResult = await query<LotRow>('SELECT * FROM lots WHERE id = $1', [lotId]);
  const lot = lotResult.rows[0];
  if (!lot) {
    return [];
  }

  if (user.role === 'collector' && lot.collector_id !== user.id) {
    throw forbidden('Access denied to this lot');
  }

  const recyclersResult = await query<RecyclerRow>(
    `SELECT * FROM recyclers WHERE authorization_status = 'authorized'`,
  );

  const lotLocation = lot.location;
  const eligible: Array<{
    recycler: ReturnType<typeof mapRecycler>;
    score: number;
    breakdown: Record<string, number>;
    distanceKm: number;
  }> = [];

  for (const row of recyclersResult.rows) {
    if (!row.materials_accepted.includes(lot.material_category)) {
      continue;
    }

    const facility = row.facility_location;
    if (!facility) {
      continue;
    }

    const distanceKm = haversineKm(lotLocation.lat, lotLocation.lng, facility.lat, facility.lng);
    if (distanceKm > Number(row.service_area_radius_km)) {
      continue;
    }

    const rateStr = row.typical_rates_inr_per_kg?.[lot.material_category];
    const rate = rateStr ? Number(rateStr) : 0;

    eligible.push({
      recycler: mapRecycler(row),
      score: 0,
      breakdown: {},
      distanceKm,
      ...({ _rate: rate } as { _rate: number }),
    });
  }

  if (eligible.length === 0) {
    return [];
  }

  const rates = eligible.map((e) => (e as unknown as { _rate: number })._rate);
  const minRate = Math.min(...rates);
  const maxRate = Math.max(...rates);

  const scored = eligible.map((entry) => {
    const recyclerRow = recyclersResult.rows.find((r) => r.id === entry.recycler.id)!;
    const rate = (entry as unknown as { _rate: number })._rate;
    const radius = Number(recyclerRow.service_area_radius_km);

    const netValueScore = normalizeScore(rate, minRate, maxRate);
    const distanceScore = Math.max(0, 1 - entry.distanceKm / radius);
    const materialCompatibilityScore =
      lot.material_subcategory &&
        recyclerRow.materials_accepted.includes(lot.material_category)
        ? 1
        : 0.7;
    const pickupServiceFitScore = recyclerRow.pickup_available ? 1 : 0.4;

    const score =
      0.35 * netValueScore +
      0.25 * distanceScore +
      0.2 * materialCompatibilityScore +
      0.2 * pickupServiceFitScore;

    return {
      recycler: entry.recycler,
      score: Number(score.toFixed(4)),
      breakdown: {
        net_value_score: Number(netValueScore.toFixed(4)),
        distance_score: Number(distanceScore.toFixed(4)),
        material_compatibility_score: Number(materialCompatibilityScore.toFixed(4)),
        pickup_service_fit_score: Number(pickupServiceFitScore.toFixed(4)),
        distance_km: Number(entry.distanceKm.toFixed(2)),
        demo_region: env.DEFAULT_DEMO_REGION,
      },
    };
  });

  return scored.sort((a, b) => b.score - a.score);
}

export { haversineKm };
