/**
 * Money from the API is an integer string of the currency's minor units, using
 * the currency's standard digits (MMK 0, USD 2). Formatting stays exact for
 * values beyond Number's safe range.
 */
export function currencyDigits(currency: string): number {
  return (
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).resolvedOptions().maximumFractionDigits ?? 2
  );
}

export function formatMoney(minor: string, currency: string): string {
  const digits = currencyDigits(currency);
  const value = BigInt(minor);
  const negative = value < BigInt(0);
  const text = (negative ? -value : value).toString().padStart(digits + 1, '0');
  const decimal =
    digits === 0 ? text : `${text.slice(0, -digits)}.${text.slice(-digits)}`;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(`${negative ? '-' : ''}${decimal}` as Intl.StringNumericLiteral);
}
