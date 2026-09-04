import { Decimal } from 'decimal.js';

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

export function toMoney(value: Decimal | string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return '0.00';
  }
  return new Decimal(value).toFixed(2);
}

export function parseMoney(value: string): Decimal {
  if (!/^-?(?:0|[1-9]\d*)\.\d{2}$/.test(value)) {
    throw new Error(`Invalid money format: ${value}`);
  }
  return new Decimal(value);
}

export function multiplyMoney(rate: string, weightKg: number | string): string {
  return parseMoney(rate).mul(new Decimal(weightKg)).toFixed(2);
}

export function moneyEquals(a: string, b: string): boolean {
  return parseMoney(a).eq(parseMoney(b));
}

export function normalizeDbMoney(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return '0.00';
  }
  return new Decimal(value).toFixed(2);
}
