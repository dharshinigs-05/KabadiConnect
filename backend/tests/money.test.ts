import { describe, it, expect } from 'vitest';
import { multiplyMoney, moneyEquals, toMoney, parseMoney } from '../src/lib/money.js';

describe('money utilities', () => {
  it('formats values to two decimal places', () => {
    expect(toMoney('132.5')).toBe('132.50');
    expect(toMoney(10)).toBe('10.00');
  });

  it('multiplies rate by weight without float drift', () => {
    expect(multiplyMoney('135.00', 2.5)).toBe('337.50');
    expect(multiplyMoney('90.00', 3.33)).toBe('299.70');
  });

  it('compares money strings exactly', () => {
    expect(moneyEquals('337.50', '337.50')).toBe(true);
    expect(moneyEquals('337.50', '337.51')).toBe(false);
  });

  it('rejects invalid money format', () => {
    expect(() => parseMoney('12.5')).toThrow();
    expect(() => parseMoney('12.555')).toThrow();
  });
});
