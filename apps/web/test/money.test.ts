import { describe, expect, it } from 'vitest';
import { currencyDigits, formatMoney as format } from '../src/lib/money';

// Intl separates a currency code from the amount with a no-break space.
const formatMoney = (minor: string, currency: string) =>
  format(minor, currency).replace(/\u00a0/g, ' ');

describe('money formatting', () => {
  it('uses each currency’s standard digits', () => {
    expect(currencyDigits('MMK')).toBe(0);
    expect(currencyDigits('USD')).toBe(2);
    expect(formatMoney('15000', 'MMK')).toBe('MMK 15,000');
    expect(formatMoney('2900', 'USD')).toBe('$29.00');
    expect(formatMoney('5', 'USD')).toBe('$0.05');
    expect(formatMoney('0', 'USD')).toBe('$0.00');
  });
  it('stays exact beyond the safe integer range', () => {
    expect(formatMoney('900719925474099312', 'USD')).toBe(
      '$9,007,199,254,740,993.12',
    );
  });
});
