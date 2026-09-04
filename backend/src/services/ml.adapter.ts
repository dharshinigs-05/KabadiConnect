import { env, useMockMl } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { multiplyMoney, toMoney } from '../lib/money.js';
import type { MaterialCategory, RiskBand } from '../types/contracts.js';

export interface PricePrediction {
  predicted_rate_inr_per_kg: string;
  predicted_total_inr: string;
  confidence: number;
  shap_breakdown: Array<{ factor: string; contribution: number }>;
  model_version: string;
  source: 'ml' | 'fallback';
}

export interface AnomalyResult {
  risk_score: number;
  risk_band: RiskBand;
  reasons: string[];
}

const FALLBACK_RATES: Record<string, number> = {
  crt: 12.0,
  lcd_panel: 45.0,
  pcb: 130.0,
  cable: 90.0,
  battery: 55.0,
  motor: 75.0,
  magnet_assembly: 110.0,
  mixed_plastic: 25.0,
  other: 30.0,
};

function mockPredictPrice(features: {
  material_category: MaterialCategory;
  estimated_weight_kg: number;
}): PricePrediction {
  const baseRate = FALLBACK_RATES[features.material_category] ?? 30.0;
  const rate = toMoney(baseRate);
  return {
    predicted_rate_inr_per_kg: rate,
    predicted_total_inr: multiplyMoney(rate, features.estimated_weight_kg),
    confidence: 0.55,
    shap_breakdown: [
      { factor: 'material_category', contribution: 0.4 },
      { factor: 'reference_market', contribution: 0.35 },
      { factor: 'region', contribution: 0.25 },
    ],
    model_version: 'fallback-v1',
    source: 'fallback',
  };
}

export async function predictPrice(features: {
  material_category: MaterialCategory;
  material_subcategory?: string;
  estimated_weight_kg: number;
  location?: { lat: number; lng: number };
  condition?: string;
}): Promise<PricePrediction> {
  if (useMockMl()) {
    return mockPredictPrice(features);
  }

  try {
    const response = await fetch(`${env.ML_SERVICE_URL}/ml/predict-price`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(features),
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      throw new Error(`ML service returned ${response.status}`);
    }

    const data = (await response.json()) as Omit<PricePrediction, 'model_version' | 'source'>;
    return {
      ...data,
      model_version: 'ml-service',
      source: 'ml',
    };
  } catch (error) {
    logger.warn('ML price prediction unavailable, using fallback', {
      error: error instanceof Error ? error.message : String(error),
    });
    return mockPredictPrice(features);
  }
}

export async function checkAnomaly(features: Record<string, unknown>): Promise<AnomalyResult> {
  if (useMockMl()) {
    return {
      risk_score: 15,
      risk_band: 'allow',
      reasons: ['Deterministic fallback: no anomaly indicators'],
    };
  }

  try {
    const response = await fetch(`${env.ML_SERVICE_URL}/ml/anomaly-check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(features),
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      throw new Error(`ML service returned ${response.status}`);
    }

    return (await response.json()) as AnomalyResult;
  } catch (error) {
    logger.warn('ML anomaly check unavailable, using fallback', {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      risk_score: 20,
      risk_band: 'monitor',
      reasons: ['ML service unavailable; using conservative fallback'],
    };
  }
}

export async function checkMlHealth(): Promise<boolean> {
  if (useMockMl()) {
    return true;
  }
  try {
    const response = await fetch(`${env.ML_SERVICE_URL}/ml/health`, {
      signal: AbortSignal.timeout(3000),
    });
    return response.ok;
  } catch {
    return false;
  }
}
